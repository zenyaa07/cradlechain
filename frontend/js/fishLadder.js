// Checkpoint track — ported from CradleChain Dashboard Design.zip's buildLadder().
// A campaign's checkpoints are transitions ("campaign wallet -> vendor"); this turns
// that into a deduped chain of stage NODES with a fish swimming through each open gate.
import { iconSvg, ladderNodeKind, LADDER_KIND_ICON } from "./nodeIcons.js";

const FISH_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" class="ladder-fish-svg"><g transform="scale(-1,1) translate(-24,0)"><path d="M2 12c3-5 9-5 12 0-3 5-9 5-12 0Z M14 12 L21 7 V17 Z" fill="oklch(58% 0.13 200)"/></g></svg>`;

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function nodeCircleClass(state) {
  return `ladder-node ladder-node-${state}`;
}

export function renderFishLadder(history) {
  if (!history.length) {
    return `
      <div class="fish-ladder-track">
        <div class="ladder-cell">
          <div class="${nodeCircleClass("ahead")}">${iconSvg("checkCircle", "oklch(72% 0.02 250)", "#fff", 24)}</div>
          <span class="ladder-label ladder-label-ahead">No checkpoints logged yet</span>
        </div>
      </div>
    `;
  }

  // Split each transition into its two endpoints and dedupe adjacent ones into a
  // single chain of stage nodes, e.g. ["campaign wallet", "vendor", "distribution point"].
  const nodeLabels = [];
  history.forEach((cp, i) => {
    const parts = cp.stageName.split(/->|→/).map((s) => s.trim());
    if (i === 0) nodeLabels.push(parts[0]);
    nodeLabels.push(parts.length > 1 ? parts[1] : parts[0]);
  });

  // The fish sits behind the first unconfirmed gate — everything before it has
  // passed, that gate's far node is "current", anything further out is "ahead".
  let currentIdx = history.length - 1;
  for (let i = 0; i < history.length; i++) {
    if (history[i].status === 0) {
      currentIdx = i;
      break;
    }
  }

  const cells = [];
  nodeLabels.forEach((label, i) => {
    let state;
    if (i === 0) state = "passed";
    else {
      const e = i - 1;
      state = e < currentIdx ? "passed" : e === currentIdx ? "current" : "ahead";
    }
    const kind = ladderNodeKind(label);
    const iconMain = state === "ahead" ? "oklch(72% 0.02 250)" : "#ffffff";
    const secondary = kind === "vendor" ? "oklch(55% 0.06 80)" : "oklch(58% 0.13 200)";
    const title = state === "ahead" ? `${capitalize(label)} — not yet reached` : capitalize(label);
    cells.push(`
      <div class="ladder-cell" title="${title}">
        <div class="${nodeCircleClass(state)}">${iconSvg(LADDER_KIND_ICON[kind], iconMain, secondary, 24)}</div>
        <span class="ladder-label ladder-label-${state}">${capitalize(label)}</span>
      </div>
    `);

    if (i < nodeLabels.length - 1) {
      const open = history[i].status === 1;
      cells.push(`
        <div class="ladder-edge">
          <div class="ladder-edge-line ${open ? "ladder-edge-open" : "ladder-edge-closed"}"></div>
          <div class="ladder-gate ${open ? "ladder-gate-open" : "ladder-gate-closed"}"></div>
          ${open ? `<span class="ladder-fish">${FISH_ICON}</span>` : ""}
        </div>
      `);
    }
  });

  return `<div class="fish-ladder-track">${cells.join("")}</div>`;
}
