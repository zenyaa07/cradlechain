import { renderFishLadder } from "./fishLadder.js";

// history is the campaign's checkpoint list, already resolved by the caller (chain
// snapshot or preview fallback) — this module only turns it into markup.
// A stale/broken chain is already surfaced by the campaign header's "Gone dark" badge
// (see campaigns.js), so this only renders the checkpoint track itself.
export function renderMigrationMap(campaignId, history) {
  const container = document.querySelector(`.campaign-card[data-campaign-id="${campaignId}"] .migration-map`);
  if (!container) return;
  container.innerHTML = renderFishLadder(history);
}
