// Campaign cover photos aren't part of the contract's Campaign struct, so an
// organizer-uploaded photo is cached client-side (data URL, localStorage) keyed
// by campaign id, same "no separate backend" spirit as the rest of the app.
// Campaigns without an uploaded photo fall back to a generated placeholder so
// donate cards and the map popup always show something.
const STORAGE_KEY = "cradlechain:campaignImages";
const PLACEHOLDER_HUES = [340, 210, 150, 40, 265];

// Real, copyright-clear photos (Wikimedia Commons, CC BY / CC BY-SA — see
// assets/campaign-photos/ATTRIBUTION.md) for the three seed campaigns from
// scripts/seed.js / previewData.js, so the demo shows real photography
// instead of a generated placeholder. Organizer-uploaded photos still win.
const SEED_PHOTOS = {
  0: "assets/campaign-photos/campaign-0-kelantan-flood.jpg",
  1: "assets/campaign-photos/campaign-1-sabah-school-meals.jpg",
  2: "assets/campaign-photos/campaign-2-semporna-reef.jpg",
  3: "assets/campaign-photos/campaign-3-cahaya-damai-shelter.jpg",
  4: "assets/campaign-photos/campaign-4-harapan-highlands.jpg",
  5: "assets/campaign-photos/campaign-5-sinar-setia-rehab.jpg",
  6: "assets/campaign-photos/campaign-6-kasih-ceria-childrens-home.jpg",
  7: "assets/campaign-photos/campaign-7-nadi-sihat-health.jpg",
};

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch (error) {
    return {};
  }
}

// Older builds stored a single data URL string per campaign instead of an array.
// Reads have to tolerate that, or `store[id][0]` yields one character of the data URL.
function storedImages(store, campaignId) {
  const value = store[campaignId];
  if (typeof value === "string") return value ? [value] : [];
  return Array.isArray(value) ? value : [];
}

export function saveCampaignImage(campaignId, dataUrl) {
  const store = readStore();
  store[campaignId] = [...storedImages(store, campaignId), dataUrl];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function placeholderImage(campaignId, label) {
  const hue = PLACEHOLDER_HUES[campaignId % PLACEHOLDER_HUES.length];
  const initial = (label || "?").trim().charAt(0).toUpperCase();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="hsl(${hue} 55% 88%)" />
          <stop offset="100%" stop-color="hsl(${hue} 45% 72%)" />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill="url(#g)" />
      <text x="50%" y="52%" font-family="Manrope, sans-serif" font-size="72" font-weight="700"
        fill="hsl(${hue} 35% 32%)" text-anchor="middle" dominant-baseline="middle">${initial}</text>
    </svg>
  `.trim();
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function campaignImage(campaignId, label) {
  const stored = storedImages(readStore(), campaignId);
  return stored[0] || SEED_PHOTOS[campaignId] || placeholderImage(campaignId, label);
}

export function campaignImages(campaignId) {
  const stored = storedImages(readStore(), campaignId);
  if (stored.length) return stored;
  return SEED_PHOTOS[campaignId] ? [SEED_PHOTOS[campaignId]] : [];
}
