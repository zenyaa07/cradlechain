import { getChainSnapshot } from "./chainData.js";
import { previewSnapshot } from "./previewData.js";
import { locationForCampaign, categoryLabel, categoryColors, pinDotColor } from "./mapSeedData.js";
import { campaignImage } from "./campaignImages.js";

// muted drops the pulsing ring and dims the pin — used for a custody stop funds haven't
// reached yet, so "not there yet" reads visually distinct from "reached, awaiting sign-off".
export function pinDivIcon(fill, dot, { muted = false } = {}) {
  return L.divIcon({
    className: "",
    html: `
      <div class="cc-pin${muted ? " cc-pin-muted" : ""}">
        ${muted ? "" : `<div class="cc-pin-pulse" style="background:${fill};"></div>`}
        <svg viewBox="0 0 24 28" width="40" height="52" class="cc-pin-svg">
          <path d="M12 1C6.9 1 3 5 3 9.6c0 6.6 9 16.4 9 16.4s9-9.8 9-16.4C21 5 17.1 1 12 1Z" fill="${fill}" stroke="white" stroke-width="1.4"></path>
          <circle cx="12" cy="9.8" r="4.2" fill="white"></circle>
          <circle cx="12" cy="9.8" r="2.2" fill="${dot}"></circle>
        </svg>
      </div>
    `,
    iconSize: [40, 52],
    iconAnchor: [20, 52],
    popupAnchor: [0, -48],
  });
}

function popupHtml(campaign) {
  return `
    <div class="cc-popup-inner">
      <div class="cc-popup-top">
        <span class="badge" style="background:${campaign.catBg};color:${campaign.catColor};border:none;">${campaign.category}</span>
        <span class="cc-popup-location">${campaign.location}</span>
      </div>
      <h4 class="cc-popup-title">${campaign.name}</h4>
      <img class="cc-popup-photo" src="${campaign.image}" alt="${campaign.name}" />
      <p class="cc-popup-purpose">${campaign.purpose}</p>
      <div class="cc-popup-confirmer">Confirmer: <strong>${campaign.confirmer}</strong></div>
      <div class="cc-popup-status">
        <span class="cc-popup-status-dot" style="background:${campaign.statusColor};"></span>
        <span style="color:${campaign.statusColor};">${campaign.statusLabel}</span>
      </div>
    </div>
  `;
}

async function buildMapCampaigns() {
  const snapshot = await getChainSnapshot();
  const { campaigns, checkpoints, confirmerByCampaign, confirmers } = snapshot;
  const confirmerLabelByAddress = Object.fromEntries(confirmers.map((c) => [c.address, c.label]));
  const aiSummaries = previewSnapshot.aiSummaries || {};

  return campaigns.map((campaign) => {
    const loc = locationForCampaign(campaign.id);
    const label = categoryLabel(campaign.category);
    const colors = categoryColors(label);
    const campaignCheckpoints = checkpoints
      .filter((c) => c.campaignId === campaign.id)
      .sort((a, b) => a.checkpointId - b.checkpointId);
    const lastCheckpoint = campaignCheckpoints[campaignCheckpoints.length - 1];
    const summary = aiSummaries[campaign.id];
    const goneDark = summary ? summary.goneDark : false;
    const statusLabel = goneDark
      ? "GONE DARK"
      : lastCheckpoint && lastCheckpoint.status === 1
      ? "CHECKPOINT CONFIRMED"
      : "AWAITING CONFIRMATION";
    const statusColor = goneDark
      ? "oklch(45% 0.13 35)"
      : lastCheckpoint && lastCheckpoint.status === 1
      ? "oklch(55% 0.09 190)"
      : "oklch(65% 0.14 35)";
    const confirmerAddress = confirmerByCampaign[campaign.id];

    return {
      id: campaign.id,
      name: campaign.name,
      category: label,
      catBg: colors.bg,
      catColor: colors.fg,
      location: loc.location,
      lat: loc.lat,
      lng: loc.lng,
      pinColor: colors.fg,
      dotColor: pinDotColor(label),
      confirmer: confirmerAddress ? confirmerLabelByAddress[confirmerAddress] || "Verified confirmer" : "Not yet assigned",
      purpose: (summary && summary.summary) || "Funds are tracked checkpoint by checkpoint from the campaign wallet to the people it's meant for.",
      image: campaignImage(campaign.id, campaign.name),
      statusLabel,
      statusColor,
    };
  });
}

function waitForLeaflet(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    (function poll() {
      if (window.L) return resolve();
      if (performance.now() - start > timeoutMs) return reject(new Error("leaflet-load-timeout"));
      requestAnimationFrame(poll);
    })();
  });
}

let map, markersLayer, resizeObserver;

export async function renderDonationMap() {
  const container = document.getElementById("donation-map");
  if (!container) return;

  try {
    await waitForLeaflet();
  } catch (error) {
    container.innerHTML = '<p class="text-secondary">Map unavailable right now.</p>';
    return;
  }

  const campaigns = await buildMapCampaigns();

  if (!map) {
    map = L.map(container, { scrollWheelZoom: false, zoomControl: true, attributionControl: true }).setView([5.0, 111.5], 6);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 17,
    }).addTo(map);
    markersLayer = L.layerGroup().addTo(map);

    if (!resizeObserver) {
      resizeObserver = new ResizeObserver(() => map.invalidateSize());
      resizeObserver.observe(container);
    }
  }

  requestAnimationFrame(() => map.invalidateSize());

  markersLayer.clearLayers();
  campaigns.forEach((campaign) => {
    const marker = L.marker([campaign.lat, campaign.lng], {
      icon: pinDivIcon(campaign.pinColor, campaign.dotColor),
    });
    marker.bindPopup(popupHtml(campaign), { maxWidth: 280, className: "cc-popup", autoPanPadding: [30, 30] });
    marker.addTo(markersLayer);
  });
}

// Leaflet writes these straight into SVG stroke/fill attributes, so they have to be plain
// color strings — these are the sRGB equivalents of --oklch-accent-teal and its pin dot.
const CUSTODY_TEAL = "#16827D";
const CUSTODY_TEAL_DOT = "#0C5B57";

// A waypoint only turns teal once its checkpoint is confirmed; it stays amber (funds have
// reached this stop, but the confirmer hasn't signed off yet) until then, and gray/dimmed
// ("future") for a planned stop funds haven't reached at all yet. No status on the point
// (e.g. the single "campaign location" pin) reads as confirmed, its normal steady state.
const CUSTODY_STATUS_COLORS = {
  confirmed: { fill: CUSTODY_TEAL, dot: CUSTODY_TEAL_DOT },
  pending: { fill: "#D97706", dot: "#92400E" },
  future: { fill: "#9CA3AF", dot: "#6B7280" },
};

// Small route map used by the campaign detail page: the chain-of-custody hops for one
// campaign, and (called a second time with a single point) that campaign's location.
export async function renderCustodyMiniMap(container, waypoints) {
  if (!container || !waypoints || waypoints.length === 0) return;

  try {
    await waitForLeaflet();
  } catch (error) {
    container.innerHTML = '<p class="text-secondary">Map unavailable right now.</p>';
    return;
  }

  const points = waypoints.map((point) => [point.lat, point.lng]);
  const miniMap = L.map(container, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 17,
  }).addTo(miniMap);

  // Reached stops (confirmed or pending sign-off) get a solid teal line — that's the custody
  // trail that has actually happened. Any future stop connects with a dashed gray line
  // instead, so the planned rest of the route reads as "not there yet", not as already moved.
  const firstFutureIndex = waypoints.findIndex((point) => point.status === "future");
  const reachedPoints = firstFutureIndex === -1 ? points : points.slice(0, firstFutureIndex);
  const futurePoints = firstFutureIndex === -1 ? [] : points.slice(Math.max(firstFutureIndex - 1, 0));

  if (reachedPoints.length > 1) {
    L.polyline(reachedPoints, { color: CUSTODY_TEAL, weight: 3, opacity: 0.85 }).addTo(miniMap);
  }
  if (futurePoints.length > 1) {
    L.polyline(futurePoints, { color: "#9CA3AF", weight: 3, opacity: 0.6, dashArray: "6 8" }).addTo(miniMap);
  }
  if (points.length > 1) {
    miniMap.fitBounds(points, { padding: [40, 40], maxZoom: 13 });
  } else {
    miniMap.setView(points[0], 13);
  }

  waypoints.forEach((point, index) => {
    const colors = CUSTODY_STATUS_COLORS[point.status] || CUSTODY_STATUS_COLORS.confirmed;
    const statusNote =
      point.status === "pending" ? " (awaiting confirmer sign-off)" : point.status === "future" ? " (not reached yet)" : "";
    L.marker([point.lat, point.lng], { icon: pinDivIcon(colors.fill, colors.dot, { muted: point.status === "future" }) })
      .bindPopup(`${index + 1}. ${point.label}${statusNote}`, { className: "cc-popup" })
      .addTo(miniMap);
  });

  requestAnimationFrame(() => miniMap.invalidateSize());

  return miniMap;
}
