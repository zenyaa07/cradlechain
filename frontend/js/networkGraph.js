import { getChainSnapshot } from "./chainData.js";
import { previewDonorLabels, previewVendorLabel } from "./previewData.js";
import { iconSvg, GRAPH_KIND_ICON } from "./nodeIcons.js";
import { API_BASE } from "./backendAuth.js";

// Mirrors the .graph-node-* fill colors in style.css — used as the icon's secondary
// tone (design draws each node's icon in white with a same-hue accent detail).
const ICON_SECONDARY_BY_TYPE = {
  donor: "oklch(70% 0.14 35)",
  campaign: "oklch(60% 0.1 235)",
  confirmer: "oklch(55% 0.09 190)",
  target: "oklch(55% 0.06 80)",
  cluster: "oklch(55% 0.06 80)",
};

// Demo-only "new donor" pop-in — ported from the design's NEW_DONORS/growInterval, which
// flies one donor node in from a fixed corner every 9s on a scripted 4s cubic-ease-out path
// (not the force simulation), replacing the previous transient the same way growInterval's
// setState does. Only runs on preview/demo data (never fabricates activity once a real wallet
// is connected).
const NEW_DONOR_NAMES = ["Nur Hidayah", "Siti Aminah", "Wei Ming", "Kavitha Raj", "Farid Azman", "Chong Li"];
const TRANSIENT_TRAVEL_MS = 4000;
const easeOutCubic = (u) => 1 - (1 - u) ** 3;
let spawnTimer = null;
let transientRaf = null;

export function aggregateDonorNodes(nodes, links, { maxIndividualDonors = 25 } = {}) {
  const donorNodes = nodes.filter((n) => n.type === "donor").sort((a, b) => b.value - a.value);
  if (donorNodes.length <= maxIndividualDonors) return { nodes, links };

  const kept = new Set(donorNodes.slice(0, maxIndividualDonors).map((n) => n.id));
  const overflow = donorNodes.slice(maxIndividualDonors);

  // Iterate every overflow donor's link (not just their first), since a donor can give to
  // multiple campaigns and each contribution must land in its own campaign's cluster.
  const overflowIds = new Set(overflow.map((n) => n.id));
  const clusterByCampaign = new Map();
  const clusterDonorsByCampaign = new Map();

  links.filter((l) => l.type === "donation" && overflowIds.has(l.source)).forEach((link) => {
    const campaignId = link.target;
    if (!clusterByCampaign.has(campaignId)) {
      clusterByCampaign.set(campaignId, { id: `cluster-${campaignId}`, type: "cluster", label: "", value: 0 });
      clusterDonorsByCampaign.set(campaignId, new Set());
    }
    clusterByCampaign.get(campaignId).value += link.amount || 0;
    clusterDonorsByCampaign.get(campaignId).add(link.source);
  });

  const clusterNodes = [...clusterByCampaign.entries()].map(([campaignId, c]) => ({
    ...c,
    label: `Community Donors (${clusterDonorsByCampaign.get(campaignId).size})`,
  }));
  const clusterLinks = [...clusterByCampaign.entries()].map(([campaignId, c]) => ({
    source: c.id,
    target: campaignId,
    type: "donation",
  }));

  const filteredNodes = nodes.filter((n) => n.type !== "donor" || kept.has(n.id));
  const filteredLinks = links.filter((l) => kept.has(l.source) || l.type !== "donation" || nodes.find((n) => n.id === l.source)?.type !== "donor");

  return { nodes: [...filteredNodes, ...clusterNodes], links: [...filteredLinks, ...clusterLinks] };
}

export async function resolveDonorLabels(addresses) {
  if (addresses.length === 0) return {};
  try {
    const response = await fetch(`${API_BASE}/donor-labels/?addresses=${addresses.join(",")}`);
    if (!response.ok) throw new Error("label-fetch-failed");
    return await response.json();
  } catch (error) {
    return {};
  }
}

export async function renderNetworkGraph() {
  const container = document.getElementById("network-graph");
  let snapshot;
  try {
    snapshot = await getChainSnapshot();
  } catch (error) {
    container.innerHTML = '<p class="text-secondary">Connect a wallet to view the network.</p>';
    return;
  }

  if (typeof d3 === "undefined") {
    renderFallbackList(container, snapshot);
    return;
  }

  const { campaigns, donations, releases, confirmerByCampaign, confirmers, checkpoints } = snapshot;
  const confirmerLabelByAddress = Object.fromEntries(confirmers.map((c) => [c.address, c.label]));

  const nodesById = new Map();
  const links = [];

  function upsertNode(id, type, label, value = 0) {
    if (!nodesById.has(id)) nodesById.set(id, { id, type, label, value });
    else nodesById.get(id).value += value;
  }

  campaigns.forEach((c) => {
    upsertNode(`campaign-${c.id}`, "campaign", c.name);
    upsertNode(`target-${c.targetWallet}`, "target", snapshot.isPreview ? previewVendorLabel : shortAddress(c.targetWallet));
  });

  const donorAddresses = [...new Set(donations.map((d) => d.donor))];
  const donorLabels = snapshot.isPreview ? {} : await resolveDonorLabels(donorAddresses);

  donations.forEach((d) => {
    const campaign = campaigns.find((c) => c.id === d.campaignId);
    if (!campaign) return;
    const amount = Number(ethers.formatEther(d.amount));
    const label = donorLabels[d.donor] || previewDonorLabels[d.donor] || shortAddress(d.donor);
    upsertNode(`donor-${d.donor}`, "donor", label, amount);
    links.push({ source: `donor-${d.donor}`, target: `campaign-${d.campaignId}`, type: "donation", amount });
  });

  Object.entries(confirmerByCampaign).forEach(([campaignId, address]) => {
    upsertNode(`confirmer-${address}`, "confirmer", confirmerLabelByAddress[address] || shortAddress(address));
    const hasPendingCheckpoint = checkpoints.some(
      (c) => c.campaignId === Number(campaignId) && c.status === 0
    );
    links.push({
      source: `campaign-${campaignId}`,
      target: `confirmer-${address}`,
      type: "confirmation",
      pending: hasPendingCheckpoint,
    });
  });

  releases.forEach((r) => {
    const campaign = campaigns.find((c) => c.id === r.campaignId);
    if (!campaign) return;
    links.push({ source: `campaign-${r.campaignId}`, target: `target-${campaign.targetWallet}`, type: "release" });
  });

  const nodes = Array.from(nodesById.values());

  if (nodes.length === 0) {
    container.innerHTML = '<p class="text-secondary">No activity yet — create a campaign and donate to see the network.</p>';
    return;
  }

  let { nodes: finalNodes, links: finalLinks } = aggregateDonorNodes(nodes, links);

  container.innerHTML = "";
  clearInterval(spawnTimer);
  cancelAnimationFrame(transientRaf);
  const width = container.clientWidth || 800;
  const height = 480;

  const svg = d3
    .select(container)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", "100%")
    .attr("height", height);

  const simulation = d3
    .forceSimulation(finalNodes)
    .force("link", d3.forceLink(finalLinks).id((d) => d.id).distance(90))
    .force("charge", d3.forceManyBody().strength(-160))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide().radius((d) => nodeRadius(d) + 8))
    // Keep a faint restlessness instead of letting the graph freeze once it settles —
    // "live" map, matching the design's constantly-drifting nodes.
    .alphaTarget(0.02)
    .alphaDecay(0.02);

  const linkLayer = svg.append("g");
  const nodeLayer = svg.append("g");
  const labelLayer = svg.append("g");
  let link, node, label;

  function update() {
    link = linkLayer
      .selectAll("line")
      .data(finalLinks, (d) => `${d.source.id || d.source}-${d.target.id || d.target}`)
      .join(
        (enter) =>
          enter
            .append("line")
            .attr("class", (d) => `graph-link graph-link-${d.type}${d.pending ? " graph-link-pending" : ""}`)
            .style("opacity", 0)
            .call((e) => e.transition().duration(350).style("opacity", 1)),
        (update) => update,
        (exit) => exit.transition().duration(300).style("opacity", 0).remove()
      )
      .attr("stroke-width", (d) => {
        if (d.type !== "donation") return 1;
        const sourceNode = finalNodes.find((n) => n.id === (d.source.id || d.source));
        return sourceNode ? Math.min(1 + Math.sqrt(sourceNode.value || 0.1) * 2, 6) : 1;
      });

    node = nodeLayer
      .selectAll("g.graph-node-group")
      .data(finalNodes, (d) => d.id)
      .join(
        (enter) => {
          const g = enter.append("g").attr("class", "graph-node-group").call(drag(simulation));
          // Pop-in wrapper: scale/opacity animate here via CSS, kept separate from the
          // outer group so the tick handler's translate() below never fights the transition.
          const inner = g.append("g").attr("class", "graph-node-pop");
          inner
            .append("circle")
            .attr("class", (d) => `graph-node graph-node-${d.type}`)
            .attr("r", nodeRadius);
          inner.append("title").text((d) => d.label);
          inner
            .filter((d) => GRAPH_KIND_ICON[d.type])
            .append("g")
            .attr("class", "graph-node-icon")
            .style("pointer-events", "none")
            .html((d) => {
              const size = Math.round(nodeRadius(d) * 0.7);
              const icon = iconSvg(GRAPH_KIND_ICON[d.type], "#ffffff", ICON_SECONDARY_BY_TYPE[d.type] || "#ffffff", size);
              return icon.replace("<svg ", `<svg x="${-size / 2}" y="${-size / 2}" `);
            });
          return g;
        },
        (update) => update,
        (exit) => exit.transition().duration(300).style("opacity", 0).remove()
      );

    label = labelLayer
      .selectAll("text")
      .data(finalNodes, (d) => d.id)
      .join(
        (enter) => enter.append("text").attr("class", "graph-node-label").text((d) => d.label).style("opacity", 0).call((e) => e.transition().duration(350).style("opacity", 1)),
        (update) => update,
        (exit) => exit.remove()
      );
  }

  update();

  simulation.on("tick", () => {
    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);
    node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    label.attr("x", (d) => d.x + nodeRadius(d) + 4).attr("y", (d) => d.y + 4);
  });

  if (snapshot.isPreview) {
    let transientId = null;

    const spawnTransient = () => {
      const campaignNodes = finalNodes.filter((n) => n.type === "campaign");
      if (campaignNodes.length === 0) return;

      // design's growInterval replaces the whole transient array on each tick — only one
      // flying-in donor exists at a time, so drop the previous one before adding the next.
      if (transientId) {
        finalNodes = finalNodes.filter((n) => n.id !== transientId);
        finalLinks = finalLinks.filter((l) => (l.source.id || l.source) !== transientId);
      }

      const donorName = NEW_DONOR_NAMES[Math.floor(Math.random() * NEW_DONOR_NAMES.length)];
      const campaign = campaignNodes[Math.floor(Math.random() * campaignNodes.length)];
      const id = `live-donor-${Date.now()}`;
      transientId = id;

      // Fixed bottom-left start point, arriving just beside the target campaign — same
      // corner-to-campaign path as the design's `start`/`end`, scaled to our canvas size.
      const start = { x: width * 0.07, y: height * 0.94 };
      const end = {
        x: campaign.x - width * 0.1,
        y: campaign.y + (campaign.y < height / 2 ? height * 0.13 : -height * 0.13),
      };
      const donorNode = { id, type: "donor", label: donorName, value: 0.02, x: start.x, y: start.y, fx: start.x, fy: start.y };
      finalNodes.push(donorNode);
      finalLinks.push({ source: id, target: campaign.id, type: "donation", amount: 0.02 });
      simulation.nodes(finalNodes);
      simulation.force("link").links(finalLinks);
      update();

      // Scripted position (fx/fy), not the force simulation — same as the design, which
      // excludes transient nodes from stepPhysics and lerps them with a cubic ease-out.
      const bornAt = performance.now();
      const fly = () => {
        const u = easeOutCubic(Math.min(1, (performance.now() - bornAt) / TRANSIENT_TRAVEL_MS));
        donorNode.fx = start.x + (end.x - start.x) * u;
        donorNode.fy = start.y + (end.y - start.y) * u;
        if (u < 1 && transientId === id) transientRaf = requestAnimationFrame(fly);
      };
      transientRaf = requestAnimationFrame(fly);
    };

    spawnTimer = setInterval(spawnTransient, 9000);
  }
}

function nodeRadius(d) {
  if (d.type === "campaign") return 22;
  if (d.type === "donor") return Math.min(10 + d.value * 4, 26);
  if (d.type === "cluster") return Math.min(14 + Math.sqrt(d.value) * 6, 32);
  if (d.type === "confirmer") return 16;
  return 14;
}

function shortAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function drag(simulation) {
  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }
  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }
  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }
  return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
}

function renderFallbackList(container, snapshot) {
  const rows = snapshot.donations
    .map((d) => `<p class="text-secondary">${previewDonorLabels[d.donor] || shortAddress(d.donor)} → campaign #${d.campaignId}</p>`)
    .join("");
  container.innerHTML = `<h3>Network (fallback view)</h3>${rows || '<p class="text-secondary">No activity yet.</p>'}`;
}
