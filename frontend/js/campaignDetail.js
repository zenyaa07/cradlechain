import { fetchCampaigns } from "./campaigns.js";
import { campaignImage, campaignImages } from "./campaignImages.js";
import { computeFundStageBreakdown, computeTimelineEvents } from "./campaignAnalytics.js";
import { pieChart } from "./svgCharts.js";
import { renderTimeline } from "./timelineChart.js";
import { renderCustodyMiniMap } from "./donationMap.js";
import { renderAISummary } from "./aiSummary.js";
import { locationForCampaign, CHECKPOINT_WAYPOINTS, categoryLabel, categoryColors } from "./mapSeedData.js";
import { checkpointLocation } from "./checkpointLocations.js";
import { previewSnapshot } from "./previewData.js";
import { fundsTrackerHtml } from "./fundsTracker.js";
import { mountCompletionNftButton } from "./completionNft.js";
import { mountFlagOverdueButton } from "./flagOverdue.js";
import { mountRevokeConfirmerPanel } from "./revokeConfirmer.js";

const HOW_STEPS = [
  "Every donation is tagged on-chain the moment it's given.",
  "As funds move — campaign wallet → vendor → the people they're meant for — the organiser logs each handoff as a checkpoint.",
  "An independent, platform-vetted confirmer signs off on each checkpoint before the next portion is released.",
  "Nothing moves without that independent sign-off.",
];

// Real campaigns created through the app have no on-chain field for a persuasive pitch —
// organizerName/why/howDetail only exist on the curated preview fixture — so this is the
// fallback for a live campaign that has none of that authored copy yet.
const WHY_FALLBACK =
  "Every donation to this campaign is tracked on-chain from the moment it's given, so you can see exactly how it's used.";

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shortAddress(address) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "unknown";
}

function galleryHtml(campaignKey, name) {
  const stored = campaignImages(campaignKey);
  const photos = stored.length > 0 ? stored : [campaignImage(campaignKey, name)];
  const [hero, ...rest] = photos;
  return `
    <section class="detail-gallery">
      <img class="detail-gallery-hero" src="${esc(hero)}" alt="${esc(name)}" />
      ${
        rest.length > 0
          ? `<div class="detail-gallery-thumbs">${rest
              .map((src, i) => `<img class="detail-gallery-thumb" src="${esc(src)}" alt="${esc(name)} photo ${i + 2}" />`)
              .join("")}</div>`
          : ""
      }
    </section>
  `;
}

function chartGridHtml(donations, checkpoints) {
  return `
    <div class="chart-grid detail-chart-grid">
      <div class="card card-glass-inset detail-chart-wide">
        <h3>Funds Tracker</h3>
        <div class="chart-body">${fundsTrackerHtml(checkpoints)}</div>
        <div class="detail-flag-overdue-slot"></div>
      </div>
      <div class="card card-glass-inset">
        <h3>Funds by stage</h3>
        <div class="chart-body">${pieChart(computeFundStageBreakdown(donations, checkpoints))}</div>
      </div>
      <div class="card card-glass-inset">
        <h3>Timeline</h3>
        <div class="chart-body">${renderTimeline(computeTimelineEvents(checkpoints))}</div>
      </div>
      <div class="card card-glass-inset detail-chart-wide">
        <h3>Where funds have moved</h3>
        <div class="detail-custody-map" data-detail-map="custody"></div>
        <div class="detail-custody-legend text-secondary">
          <span><span class="detail-custody-dot detail-custody-dot-confirmed"></span>Confirmed</span>
          <span><span class="detail-custody-dot detail-custody-dot-pending"></span>Awaiting confirmer sign-off</span>
          <span><span class="detail-custody-dot detail-custody-dot-future"></span>Not reached yet</span>
        </div>
      </div>
    </div>
  `;
}

function whyParagraphsHtml(why) {
  return why
    .split("\n\n")
    .map((para) => `<p>${esc(para)}</p>`)
    .join("");
}

// Minimal stroke icons, one per section — matches the existing accent-per-card system
// (see .detail-w-card[data-w=...] below) without leaning on a side-stripe border to carry it.
const W_ICONS = {
  what: '<path d="M6 2h9l5 5v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8"/>',
  why: '<path d="M12 21s-7.5-4.6-10-9.3C.5 8 2.4 4 6.5 4c2 0 3.6 1.1 4.5 2.7C11.9 5.1 13.5 4 15.5 4c4.1 0 6 4 4.5 7.7C17.5 16.4 12 21 12 21Z"/>',
  who: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  where: '<path d="M12 22s7-6.2 7-12A7 7 0 0 0 5 10c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>',
  how: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
};

function wHeaderHtml(key, label) {
  return `<h3 class="detail-w-heading"><svg class="detail-w-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${W_ICONS[key]}</svg>${esc(label)}</h3>`;
}

function factRowHtml(label, valueHtml) {
  return `<div class="detail-w-fact"><span class="detail-w-fact-label">${esc(label)}</span><span class="detail-w-fact-value">${valueHtml}</span></div>`;
}

function fiveWOneHHtml(campaign, confirmerLabel, location) {
  return `
    <div class="detail-w-grid">
      <div class="card card-glass detail-w-card detail-w-card-wide" data-w="what">
        ${wHeaderHtml("what", "What")}
        <p class="detail-w-lead">${esc(campaign.name)}</p>
        <p>${esc(campaign.description)}</p>
        ${campaign.detailDescription ? `<p>${esc(campaign.detailDescription)}</p>` : ""}
      </div>
      <div class="card card-glass detail-w-card detail-w-card-wide detail-w-card-essay" data-w="why">
        ${wHeaderHtml("why", "Why")}
        <div class="detail-w-essay">${whyParagraphsHtml(campaign.why || WHY_FALLBACK)}</div>
      </div>
      <div class="card card-glass detail-w-card" data-w="who">
        ${wHeaderHtml("who", "Who")}
        <div class="detail-w-facts">
          ${factRowHtml("Organizer", `<strong>${esc(campaign.organizerName || shortAddress(campaign.organizer))}</strong>`)}
          ${factRowHtml("Wallet", esc(shortAddress(campaign.organizer)))}
          ${factRowHtml("Confirmer", `<strong>${esc(confirmerLabel || "not yet assigned")}</strong>`)}
        </div>
        ${campaign.organizerBlurb ? `<p class="detail-w-note">${esc(campaign.organizerBlurb)}</p>` : ""}
        <p class="text-secondary detail-w-note">An independent, platform-vetted signer approves each checkpoint before funds move.</p>
        <div class="detail-revoke-slot"></div>
      </div>
      <div class="card card-glass detail-w-card" data-w="where">
        ${wHeaderHtml("where", "Where")}
        <div class="detail-w-facts">
          ${factRowHtml("Location", `<strong>${esc(location.location)}</strong>`)}
        </div>
        <div class="detail-where-map" data-detail-map="where"></div>
      </div>
      <div class="card card-glass detail-w-card" data-w="how">
        ${wHeaderHtml("how", "How")}
        <ol class="detail-w-steps">
          ${HOW_STEPS.map((step) => `<li>${esc(step)}</li>`).join("")}
          ${campaign.howDetail ? `<li>${esc(campaign.howDetail)}</li>` : ""}
        </ol>
      </div>
    </div>
  `;
}

function sidebarHtml(campaign, raised, isPreview) {
  const label = categoryLabel(campaign.category);
  const colors = categoryColors(label);
  return `
    <aside class="campaign-detail-sidebar">
      <div class="card card-glass detail-sidebar-card">
        <span class="badge badge-category" style="background:${colors.bg};color:${colors.fg};">${esc(label)}</span>
        <h3 data-relabel="CampaignHeading">${esc(campaign.name)}</h3>
        ${isPreview ? '<p class="text-secondary detail-demo-note">Illustrative demo data — not a real transaction history.</p>' : ""}
        <div class="detail-raised">${raised.toFixed(3)} POL</div>
        <p class="text-secondary detail-raised-label">raised so far</p>
        <form class="donate-form">
          <input name="amount" type="number" step="0.001" min="0.001" placeholder="Amount (POL)" data-relabel="DonationAmount" required />
          <button type="submit" data-relabel="Donate">Donate</button>
        </form>
        <p class="text-secondary detail-nudge">Every donation is tracked checkpoint by checkpoint — see exactly where it goes.</p>
        <div class="detail-nft-slot"></div>
      </div>
    </aside>
  `;
}

// Each open mounts fresh Leaflet instances into a rebuilt DOM, so the previous open's
// maps have to be torn down or their resize listeners and tile layers leak.
let detailMaps = [];

// Real checkpoints logged with a location (see checkpoints.js) win first — that's the
// actual custody trail. Checkpoints without one fall back to the hardcoded demo route at
// the same index, so the curated demo campaigns still show a full trail.
// status on each point drives the pin colour in donationMap.js — a point only lights up
// teal once its checkpoint is actually confirmed; it sits amber (funds arrived, awaiting
// the confirmer's sign-off) until then.
//
// The whole planned route (CHECKPOINT_WAYPOINTS) stays visible even for hops that haven't
// happened yet — those render as "future" (dimmed, no pulse) instead of just being missing,
// so the map always shows the full chain of custody, not only however much of it has
// occurred so far. Real campaigns with no authored route just show what's actually logged.
function custodyWaypoints(campaign, history, homeLocation) {
  const demoRoute = CHECKPOINT_WAYPOINTS[campaign.id] || [];
  const reached = history
    .map((checkpoint, index) => {
      const saved = checkpointLocation(campaign.id, checkpoint.checkpointId);
      const base = saved ? { lat: saved.lat, lng: saved.lng, label: saved.label } : demoRoute[index];
      if (!base) return null;
      return { ...base, label: checkpoint.stageName || base.label, status: checkpoint.status === 1 ? "confirmed" : "pending" };
    })
    .filter(Boolean);
  const future = demoRoute.slice(history.length).map((point) => ({ ...point, status: "future" }));
  const points = [...reached, ...future];
  return points.length ? points : [{ ...homeLocation, label: homeLocation.location, status: "confirmed" }];
}

export async function renderCampaignDetailPage(campaignId) {
  const root = document.getElementById("campaign-detail-root");
  if (!root) return;

  detailMaps.forEach((map) => map && map.remove());
  detailMaps = [];

  const { campaigns, isPreview, snapshot } = await fetchCampaigns();
  const entry = campaigns.find((c) => c.id === Number(campaignId));
  if (!entry) {
    root.innerHTML = '<p class="text-secondary">Campaign not found.</p>';
    return;
  }

  const { campaign, history, confirmerLabel, confirmerTrack } = entry;
  const campaignKey = String(campaign.id);
  const donations = snapshot.donations
    .filter((d) => d.campaignId === campaign.id)
    .map((d) => ({ donationId: d.donationId, amount: Number(ethers.formatEther(d.amount)) }));
  const raised = donations.reduce((sum, d) => sum + d.amount, 0);
  const releasedDonationIds = new Set(
    snapshot.releases.filter((r) => r.campaignId === campaign.id).map((r) => r.donationId)
  );
  const location = locationForCampaign(campaign.id);

  root.innerHTML = `
    <div class="campaign-card campaign-detail" data-campaign-id="${campaign.id}">
      <div class="campaign-detail-grid">
        <div class="campaign-detail-main">
          ${galleryHtml(campaignKey, campaign.name)}
          ${chartGridHtml(donations, history)}
          <div class="card card-glass-inset detail-ai-card">
            <h3>AI summary</h3>
            <div class="ai-summary">${isPreview ? '<p class="text-secondary">Reading the checkpoint trail…</p>' : '<button type="button" class="ai-summary-trigger">Generate AI summary</button>'}</div>
          </div>
          ${fiveWOneHHtml(campaign, confirmerLabel, location)}
        </div>
        ${sidebarHtml(campaign, raised, isPreview)}
      </div>
    </div>
  `;

  // Leaflet measures its container, so both maps mount only after the markup is attached.
  detailMaps = await Promise.all([
    renderCustodyMiniMap(root.querySelector('[data-detail-map="custody"]'), custodyWaypoints(campaign, history, location)),
    renderCustodyMiniMap(root.querySelector('[data-detail-map="where"]'), [{ ...location, label: location.location }]),
  ]);

  // Preview mode is a hardcoded stub (no network call, can't fail) so it renders immediately.
  // A live campaign's summary is a real Groq call — only spend it when the donor actually
  // wants it, instead of firing on every detail-page load.
  if (isPreview) {
    await renderAISummary(campaign.id, history, campaign.category, {
      useStub: true,
      stubOverride: previewSnapshot.aiSummaries[campaign.id],
      confirmerTrack,
    });
  } else {
    root.querySelector(".ai-summary-trigger")?.addEventListener("click", async (event) => {
      event.target.disabled = true;
      event.target.textContent = "Generating…";
      await renderAISummary(campaign.id, history, campaign.category, { confirmerTrack });
    });
  }

  await mountCompletionNftButton(campaign.id, history, isPreview, donations, releasedDonationIds);
  await mountFlagOverdueButton(campaign.id, isPreview);
  await mountRevokeConfirmerPanel(campaign.id, isPreview);
}
