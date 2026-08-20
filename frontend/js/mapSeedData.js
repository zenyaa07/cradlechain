// Location metadata for the donation map. Campaign coordinates aren't on-chain
// (the contract has no geo field), so this is the seed/demo mapping — keyed to
// match scripts/seed.js and frontend/js/previewData.js exactly for the three
// demo campaigns, with a deterministic fallback for any campaign beyond those.
export const CAMPAIGN_LOCATIONS = {
  0: { location: "Kota Bharu, Kelantan", lat: 6.1254, lng: 102.2381 },
  1: { location: "Kota Kinabalu, Sabah", lat: 5.9804, lng: 116.0735 },
  2: { location: "Semporna, Sabah", lat: 4.4802, lng: 118.6118 },
  3: { location: "Sungai Buloh, Selangor", lat: 3.2049, lng: 101.5779 },
  4: { location: "Kundasang, Sabah", lat: 6.0099, lng: 116.5751 },
  5: { location: "Pekan Rembau, Negeri Sembilan", lat: 2.5975, lng: 102.0913 },
  6: { location: "Setapak, Kuala Lumpur", lat: 3.1969, lng: 101.7186 },
  7: { location: "Bukit Mertajam, Penang", lat: 5.3644, lng: 100.4657 },
};

// The FULL planned chain of custody for each campaign, one stop per hop — not just the
// hops actually logged on-chain yet. campaignDetail.js matches the leading stops to real
// checkpoints (colored by their confirm status) and renders the rest as "future" stops, so
// the whole route is always visible even when most of it hasn't happened yet. Every campaign
// gets 5+ stops; campaign 2 is the deliberate exception whose first (and only) real
// checkpoint stays unconfirmed — see previewData.js's "stalled/goneDark" comment.
export const CHECKPOINT_WAYPOINTS = {
  0: [
    { label: "Vendor pickup, Pasir Mas", lat: 6.0453, lng: 102.1397 },
    { label: "Flood relief distribution centre, Kota Bharu", lat: 6.1247911, lng: 102.2378065 },
    { label: "Flood-displaced households, Pengkalan Chepa", lat: 6.1726580, lng: 102.2930980 },
    { label: "Follow-up relief supplies, Wakaf Bharu", lat: 6.1494, lng: 101.7783 },
    { label: "Second wave relief supplies, Tumpat", lat: 6.1997, lng: 102.1707 },
  ],
  1: [
    { label: "Vendor pickup, Kota Kinabalu", lat: 5.9780066, lng: 116.0728988 },
    { label: "School meal distribution centre, Ranau district", lat: 5.8980313, lng: 116.6696079 },
    { label: "Weekly delivery, rural primary schools", lat: 6.0167, lng: 116.6167 },
    { label: "Term restock, Ranau district schools", lat: 5.9601, lng: 116.6841 },
    { label: "Termly supply restock, Kundasang border villages", lat: 6.0234, lng: 116.6403 },
  ],
  2: [
    { label: "Vendor pickup, Semporna", lat: 4.4790765, lng: 118.4297732 },
    { label: "Coral nursery site, Bum Bum Island", lat: 4.4740, lng: 118.6650 },
    { label: "Fisher training workshop, Semporna", lat: 4.4825, lng: 118.6198 },
    { label: "Handover to local fisher cooperative, Semporna", lat: 4.4869, lng: 118.6114 },
    { label: "Long-term reef monitoring site, Semporna", lat: 4.4712, lng: 118.6285 },
  ],
  3: [
    { label: "Vendor pickup, Shah Alam", lat: 3.0733, lng: 101.5185 },
    { label: "Welfare centre, Sungai Buloh", lat: 3.2049, lng: 101.5779 },
    { label: "Emergency welfare case, Subang Jaya", lat: 3.0567, lng: 101.5851 },
    { label: "Emergency food parcel distribution, Kepong", lat: 3.2107, lng: 101.6357 },
    { label: "Monthly welfare disbursement, Sungai Buloh", lat: 3.2005, lng: 101.5695 },
  ],
  4: [
    { label: "Vendor pickup, Ranau", lat: 5.9760, lng: 116.6650 },
    { label: "Community centre, Kundasang", lat: 6.0099, lng: 116.5751 },
    { label: "Household aid delivery, Kg Mesilou", lat: 6.0453, lng: 116.6094 },
    { label: "Highland school supplies delivery, Kundasang", lat: 6.0142, lng: 116.5822 },
    { label: "Follow-up welfare check, Kg Mesilou", lat: 6.0410, lng: 116.6035 },
  ],
  5: [
    { label: "Vendor pickup, Seremban", lat: 2.7297, lng: 101.9381 },
    { label: "Rehabilitation facility, Pekan Rembau", lat: 2.5975, lng: 102.0913 },
    { label: "Home therapy visit, Rembau district", lat: 2.6068, lng: 102.1102 },
    { label: "Assistive equipment delivery, Pekan Rembau", lat: 2.6011, lng: 102.0955 },
    { label: "Follow-up therapy session, Rembau district", lat: 2.6122, lng: 102.1049 },
  ],
  6: [
    { label: "Vendor pickup, Wangsa Maju", lat: 3.2050, lng: 101.7290 },
    { label: "Care centre, Setapak", lat: 3.1969, lng: 101.7186 },
    { label: "School fees & supplies, Setapak", lat: 3.1980, lng: 101.7150 },
    { label: "Extracurricular programme funding, Setapak", lat: 3.1943, lng: 101.7212 },
    { label: "Uniform & book drive, Setapak", lat: 3.2001, lng: 101.7128 },
  ],
  7: [
    { label: "Vendor pickup, Butterworth", lat: 5.3991, lng: 100.3638 },
    { label: "Healthcare facility, Bukit Mertajam", lat: 5.3644, lng: 100.4657 },
    { label: "Elderly home-visit outreach, Bukit Mertajam", lat: 5.3585, lng: 100.4735 },
    { label: "Mobile clinic visit, Bukit Mertajam", lat: 5.3702, lng: 100.4598 },
    { label: "Family support follow-up, Bukit Mertajam", lat: 5.3611, lng: 100.4689 },
  ],
};

const FALLBACK_CITIES = [
  { location: "George Town, Penang", lat: 5.4141, lng: 100.3288 },
  { location: "Kuching, Sarawak", lat: 1.5535, lng: 110.3593 },
  { location: "Johor Bahru, Johor", lat: 1.4927, lng: 103.7414 },
  { location: "Ipoh, Perak", lat: 4.5975, lng: 101.0901 },
];

export function locationForCampaign(id) {
  return CAMPAIGN_LOCATIONS[id] || FALLBACK_CITIES[id % FALLBACK_CITIES.length];
}

const CATEGORY_LABELS = ["Urgent", "Ongoing", "Long-term"];
const CAT_COLORS = {
  Urgent: { bg: "oklch(93% 0.06 35)", fg: "oklch(45% 0.13 35)" },
  Ongoing: { bg: "oklch(92% 0.03 235)", fg: "oklch(45% 0.1 235)" },
  "Long-term": { bg: "oklch(92% 0.03 275)", fg: "oklch(45% 0.09 275)" },
};
const PIN_DOT = { Urgent: "oklch(58% 0.18 35)", Ongoing: "oklch(50% 0.13 235)", "Long-term": "oklch(48% 0.12 275)" };

export function categoryLabel(categoryIndex) {
  return CATEGORY_LABELS[categoryIndex] || CATEGORY_LABELS[1];
}
export function categoryColors(label) {
  return CAT_COLORS[label] || CAT_COLORS.Ongoing;
}
export function pinDotColor(label) {
  return PIN_DOT[label] || PIN_DOT.Ongoing;
}
