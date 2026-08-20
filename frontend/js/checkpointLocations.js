// Checkpoint locations aren't part of the contract's CustodyEvent struct, so an
// organizer-entered location is geocoded client-side and cached in localStorage,
// keyed by campaign + checkpoint id — same "no separate backend" spirit as
// campaignImages.js.
const STORAGE_KEY = "cradlechain:checkpointLocations";

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch (error) {
    return {};
  }
}

function keyFor(campaignId, checkpointId) {
  return `${campaignId}:${checkpointId}`;
}

export function saveCheckpointLocation(campaignId, checkpointId, location) {
  const store = readStore();
  store[keyFor(campaignId, checkpointId)] = location;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function checkpointLocation(campaignId, checkpointId) {
  return readStore()[keyFor(campaignId, checkpointId)] || null;
}

// Free, no-key geocoder — same OpenStreetMap data already backing the Leaflet map.
export async function geocodeLocation(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("geocoding failed");
  const results = await response.json();
  if (!results.length) throw new Error("location not found");
  return { lat: Number(results[0].lat), lng: Number(results[0].lon), label: query };
}
