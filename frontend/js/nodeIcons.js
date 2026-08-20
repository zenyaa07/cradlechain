// Icon glyphs used on graph nodes and ladder checkpoints — ported path-for-path from
// CradleChain Dashboard Design.zip's buildIcon() so every circle+icon combo matches exactly.
function part(d, fill, stroke, sw) {
  return { d, fill: fill || "none", stroke: stroke || "none", sw: sw || 0 };
}

const ICON_BUILDERS = {
  person: (main) => [part("M12 12a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z M5 20c0-3.6 3-6 7-6s7 2.4 7 6Z", main)],
  droplet: (main) => [part("M12 3C8 9 5 12.6 5 15.5a7 7 0 0 0 14 0C19 12.6 16 9 12 3Z", main)],
  target: (main) => [
    part("M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2Z", null, main, 2),
    part("M12 6.5a5.5 5.5 0 1 0 .001 11.001A5.5 5.5 0 0 0 12 6.5Z", null, main, 2),
    part("M12 11a1 1 0 1 0 .001 2.001A1 1 0 0 0 12 11Z", main),
  ],
  shieldCheck: (main, secondary) => [
    part("M12 2 L20 5.5 V11 C20 16.5 16.5 20.7 12 22 C7.5 20.7 4 16.5 4 11 V5.5 Z", main),
    part("M8.2 12.2 L11 15 L16 9.5", null, secondary, 2),
  ],
  box: (main, secondary) => [
    part("M12 2 L21 7 V17 L12 22 L3 17 V7 Z", main),
    part("M3 7 L12 12 L21 7 M12 12 L12 22", null, secondary, 1.4),
  ],
  pin: (main, secondary) => [
    part("M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8Z", main),
    part("M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z", secondary),
  ],
  checkCircle: (main, secondary) => [
    part("M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2Z", main),
    part("M7.5 12.5 L10.5 15.5 L16.5 9", null, secondary, 2),
  ],
};

export function buildIcon(kind, main, secondary = "#ffffff") {
  const build = ICON_BUILDERS[kind];
  return build ? build(main, secondary) : [];
}

export function iconSvg(kind, main, secondary, size = 24) {
  const paths = buildIcon(kind, main, secondary)
    .map((p) => `<path d="${p.d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.sw}" stroke-linecap="round" stroke-linejoin="round"/>`)
    .join("");
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}">${paths}</svg>`;
}

// donor / campaign / confirmer / target(vendor) — graph node kinds
export const GRAPH_KIND_ICON = { donor: "person", campaign: "target", confirmer: "shieldCheck", target: "box", cluster: "person" };

// campaign-wallet / vendor / distribution-point / confirmer / generic — checkpoint ladder kinds
export function ladderNodeKind(label) {
  const l = label.toLowerCase();
  if (l.includes("vendor")) return "vendor";
  if (l.includes("distribution")) return "distribution";
  if (l.includes("confirmer")) return "confirmer";
  if (l.includes("campaign") || l.includes("wallet")) return "campaign";
  return "generic";
}

// campaign uses "target" (the same bullseye used on the fund-flow map) everywhere —
// not "droplet" — so a campaign wallet reads as one consistent icon across tabs.
export const LADDER_KIND_ICON = { campaign: "target", vendor: "box", distribution: "pin", confirmer: "shieldCheck", generic: "checkCircle" };
