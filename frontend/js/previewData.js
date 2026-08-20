// Static fixture mirroring scripts/seed.js. Used by chainData.js/confirmersPanel.js as a
// fallback when there's no live contract to read (no wallet, unreachable RPC, or an
// empty/freshly-deployed contract) so the dashboard shows a populated demo instead of
// "connect a wallet" placeholders.
const eth = (n) => ethers.parseEther(n);
const nowSec = () => Math.floor(Date.now() / 1000);
const DAY = 86400;

const donorA = "0x1a2b3c4d5e6f7890abcdef1234567890abcdef12";
const donorB = "0x9f8e7d6c5b4a39281706f5e4d3c2b1a09876543a";
const directConfirmer = "0x5566778899aabbccddeeff001122334455667788";
const ngoConfirmer = "0x00aabbccddeeff1122334455667788990011aabb";
const vendorWallet = "0xdeadbeef00112233445566778899aabbccddeeff";
const pendingNgo = "0x3344556677889900aabbccddeeff0011223344aa";

// Two donors, two identity choices — matches the real backend's DonorProfile
// (is_anonymous/display_name, see backend/wallets/models.py + views_labels.py).
// donorA opted in to a public display name; donorB stayed anonymous, so they
// show up as a placeholder ("Donor #<id>") the same way a real anonymous
// donor would, instead of a raw wallet address.
export const previewDonorLabels = {
  [donorA]: "Aisyah Rahman",
  [donorB]: "Donor #A0002",
};

export const previewVendorLabel = "Kelantan Relief Logistics";

export const previewSnapshot = {
  campaigns: [
    { id: 0, name: "Urgent Flood Relief - Kelantan", description: "Emergency supplies for flood-displaced families.", category: 0, targetWallet: vendorWallet, organizer: donorA, organizerName: "Kelantan Flood Response Coalition", organizerBlurb: "Volunteer-led relief coalition coordinating flood response across Kelantan since 2021.", why: "Four days ago the Kelantan river burst its banks, and floodwater rose past chest height in homes across Pengkalan Chepa before families could save anything. Kitchens, mattresses, and school uniforms are gone, and the relief centre now holds more families than it was built for, with clean water and dry blankets running out faster than they can be replaced.\n\nThe Kelantan Flood Response Coalition has run flood operations across the state since 2021, so they already know which vendors and distribution centres can move fastest. Your donation is logged on-chain the moment it lands and reaches food, blankets, and clean water within days, not weeks.", howDetail: "For this campaign: funds move from the campaign wallet to vendor Kelantan Relief Logistics, then to the flood relief distribution centre in Kota Bharu, and finally out to flood-displaced households in Pengkalan Chepa." },
    { id: 1, name: "Ongoing School Meals - Sabah", description: "Weekly meal program for rural primary schools.", category: 1, targetWallet: vendorWallet, organizer: donorA, organizerName: "Sabah Rural Schools Meal Programme", organizerBlurb: "Community-run meal programme feeding rural primary schoolchildren across Ranau district since 2019.", why: "Some children in Ranau district walk hours along dirt roads to reach school, and the one hot meal waiting there is often the only reliable meal of their day. Skip it for a week and attendance drops. Skip it for a term, and some children stop coming back at all.\n\nThis programme has delivered that meal to six rural primary schools every week since 2019, sourced through the same vendor and distribution centre each time. Your donation becomes next Tuesday's lunch, tracked checkpoint by checkpoint from the campaign wallet to the schools themselves.", howDetail: "For this campaign: funds move from the campaign wallet to vendor Kelantan Relief Logistics, then to the school meal distribution centre in Ranau district, then out weekly to 6 rural primary schools." },
    { id: 2, name: "Long-term Reef Restoration - Semporna", description: "Multi-year coral reef rebuilding with local fishers.", category: 2, targetWallet: vendorWallet, organizer: donorA, organizerName: "Laut Lestari Reef Restoration Initiative", organizerBlurb: "Multi-year coral rebuilding initiative working with local fishers in Semporna since 2020.", why: "The reefs around Semporna are the fishing grounds entire families depend on, and years of bleaching, storm damage, and overfishing have stripped large sections down to bare rock. Rebuilding takes years of planting coral fragments and training local fishers, not a single fix.\n\nLaut Lestari has worked directly with Semporna's fishing families since 2020. The first hop of this campaign is already logged and awaiting confirmer sign-off. Your donation keeps the divers in the water and the next generation of coral in the ground.", howDetail: "For this campaign: the first hop, from the campaign wallet to vendor Kelantan Relief Logistics, has been logged and is awaiting confirmer sign-off before funds move further." },
    { id: 3, name: "Cahaya Damai Family Shelter", description: "Shelter, food, and welfare support for single-parent families and at-risk children in Sungai Buloh, Selangor.", category: 1, targetWallet: vendorWallet, organizer: donorA, detailDescription: "Cahaya Damai runs a community shelter and welfare programme in Sungai Buloh, Selangor, supporting single mothers, at-risk children, and displaced families with housing, food aid, and basic welfare assistance. Donations help cover day-to-day shelter costs and emergency welfare cases referred to the shelter.", organizerName: "Cahaya Damai Family Shelter", organizerBlurb: "Community shelter and welfare programme supporting single mothers and at-risk children in Sungai Buloh since 2018.", why: "A single mother arriving at Cahaya Damai's door in Sungai Buloh often has nowhere else to turn: no shelter, no income, sometimes a child in tow and nothing packed but what she could carry.\n\nThis shelter has been the difference between sleeping indoors and sleeping on the street since 2018, funded entirely by donations that cover food, beds, and welfare support day to day. Your donation keeps the doors open for the next family that shows up with nowhere else to go.", howDetail: "For this campaign: funds move from the campaign wallet to vendor Selangor Family Aid Logistics, then on to the welfare centre in Sungai Buloh, where the next hop is awaiting confirmer sign-off." },
    { id: 4, name: "Harapan Highlands Community Fund", description: "Community welfare and advocacy support for highland indigenous communities in Kundasang, Sabah.", category: 1, targetWallet: vendorWallet, organizer: donorA, detailDescription: "Harapan Highlands Community Fund advocates for and supports indigenous highland communities around Kundasang, Sabah, spanning community welfare aid, cultural advocacy, and support for underserved indigenous households.", organizerName: "Harapan Highlands Community Fund", organizerBlurb: "Community welfare and advocacy network supporting indigenous highland households around Kundasang since 2020.", why: "Highland indigenous communities around Kundasang are routinely the last to receive aid and the first to be left out of the conversation. Roads are harder to reach, services are thinner, and households often go without welfare support other communities take for granted.\n\nHarapan Highlands exists to close that gap directly, not through advocacy alone. Your donation goes straight to a household that would otherwise still be waiting.", howDetail: "For this campaign: funds move from the campaign wallet to vendor Sabah Highlands Support Network, then to the community centre in Kundasang, where the next hop is awaiting confirmer sign-off." },
    { id: 5, name: "Sinar Setia Rehabilitation Centre", description: "Rehabilitation and daily-living support for persons with disabilities (OKU) in Pekan Rembau, Negeri Sembilan.", category: 1, targetWallet: vendorWallet, organizer: donorA, detailDescription: "Sinar Setia is a community-based rehabilitation centre in Pekan Rembau, Negeri Sembilan, providing daily therapy, skills training, and care support for persons with disabilities (OKU) in the surrounding district. Donations support the centre's day-to-day rehabilitation programmes and equipment needs.", organizerName: "Sinar Setia Rehabilitation Centre", organizerBlurb: "Community-based rehabilitation centre providing therapy and skills training for persons with disabilities (OKU) in Pekan Rembau since 2017.", why: "For the OKU community in Pekan Rembau, a therapy session isn't a nice-to-have. It's what makes independent daily life possible instead of needing constant care.\n\nSinar Setia has provided that therapy and skills training since 2017, but every session and every piece of equipment costs money the centre has to raise continuously. Your donation keeps a session on the calendar and equipment in working order for someone who depends on both.", howDetail: "For this campaign: funds move from the campaign wallet to vendor Negeri Sembilan Rehabilitation Services, then to the rehabilitation facility in Pekan Rembau, where the next hop is awaiting confirmer sign-off." },
    { id: 6, name: "Kasih Ceria Children's Home", description: "Residential care and education for orphaned and underprivileged children in Setapak, Kuala Lumpur.", category: 1, targetWallet: vendorWallet, organizer: donorA, detailDescription: "Kasih Ceria operates a residential care centre in Taman Melur, Setapak, Kuala Lumpur, providing shelter, meals, and education support for orphaned and underprivileged children. Donations fund daily care costs, schooling needs, and centre upkeep.", organizerName: "Kasih Ceria Children's Home", organizerBlurb: "Residential care centre providing shelter, meals, and education for orphaned and underprivileged children in Setapak since 2016.", why: "For the children at Kasih Ceria in Setapak, this home is their school, their family, and the only stability many of them have, because no parent or guardian can provide it.\n\nSince 2016 the home has covered meals, school books, and shelter entirely through donations, and those costs recur every month regardless of funding. Your donation is the meal on tonight's table and the bed that stays filled instead of empty.", howDetail: "For this campaign: funds move from the campaign wallet to vendor KL Children's Care Logistics, then to the care centre in Setapak, where the next hop is awaiting confirmer sign-off." },
    { id: 7, name: "Nadi Sihat Community Health Outreach", description: "Healthcare, elder care, and family support programs across Penang's mainland communities.", category: 2, targetWallet: vendorWallet, organizer: donorA, detailDescription: "Nadi Sihat, based in Bukit Mertajam, Penang, runs healthcare outreach, elder care, and family support programmes for underserved communities across Penang's mainland, including seniors, single parents, and children.", organizerName: "Nadi Sihat Community Health Outreach", organizerBlurb: "Healthcare and family support outreach serving underserved communities across Penang's mainland since 2019.", why: "For elderly residents and single parents across Penang's mainland, the nearest clinic can be an afternoon's journey away, on transport many can't afford. Missed appointments turn into untreated conditions, and untreated conditions turn into emergencies.\n\nNadi Sihat has brought healthcare and family support directly to people's doorsteps since 2019. Your donation is the reason an outreach team reaches someone's doorstep this month instead of turning back.", howDetail: "For this campaign: funds move from the campaign wallet to vendor Penang Mainland Healthcare Outreach, then to the healthcare facility in Bukit Mertajam, where the next hop is awaiting confirmer sign-off." },
  ],
  // Each campaign's chain is only as deep as its real story supports: campaign 0's funds have
  // reached a physical distribution centre and the last hop to households is what's waiting on
  // AI/confirmer sign-off; campaign 1 is a mature ongoing program so its trail runs further;
  // campaign 2's single pending hop is the point — it's the stalled/goneDark example (see
  // aiSummaries[2] below), so it deliberately doesn't get padded with unearned further stages.
  // loggedAt/confirmedAt are real deltas, not placeholders — they drive the analytics tab's
  // time-to-confirm metric, so campaign 0/1's confirmed hops turn around in minutes while
  // campaign 2's pending hop is genuinely 9 days old (matches aiSummaries[2].reason below and
  // is what trips the "needs attention" staleness threshold in analyticsCharts.js).
  checkpoints: [
    // campaigns 0,1,3,4,5,6,7 mirror the real deployed chain: 3 confirmed hops each
    // (see scripts/seed.js's EXTRA_CHECKPOINTS). Campaign 0's checkpoint 3 stays Pending
    // with a real evidence photo hash — the live chain has zero Pending checkpoints left
    // (checkpoint 0 is auto-confirmed for every campaign by seed.js), so this is the only
    // place left to demo Beat 0 (AI evidence check) from docs/demo-script.md.
    { campaignId: 0, checkpointId: 0, donationId: 0, stageName: "campaign wallet -> vendor (Kelantan Relief Logistics)", status: 1, loggedAt: nowSec() - 3500, confirmedAt: nowSec() - 3000 },
    { campaignId: 0, checkpointId: 1, donationId: 0, stageName: "vendor (Kelantan Relief Logistics) -> flood relief distribution centre, Kota Bharu", status: 1, loggedAt: nowSec() - 2400, confirmedAt: nowSec() - 1900 },
    { campaignId: 0, checkpointId: 2, donationId: 1, stageName: "flood relief distribution centre, Kota Bharu -> flood-displaced households, Pengkalan Chepa", status: 1, loggedAt: nowSec() - 1200, confirmedAt: nowSec() - 900 },
    { campaignId: 0, checkpointId: 3, donationId: 1, stageName: "flood-displaced households, Pengkalan Chepa -> follow-up relief supplies, Wakaf Bharu", status: 0, loggedAt: nowSec() - 600, confirmedAt: 0, ipfsProofHash: "Qma6e8dovfLyiG2UUfdkSHNPAySzrWLX9qVXb44v1muqcp" },
    { campaignId: 1, checkpointId: 0, donationId: 0, stageName: "campaign wallet -> vendor (Kelantan Relief Logistics)", status: 1, loggedAt: nowSec() - 2800, confirmedAt: nowSec() - 2500 },
    { campaignId: 1, checkpointId: 1, donationId: 0, stageName: "vendor (Kelantan Relief Logistics) -> school meal distribution centre, Ranau district", status: 1, loggedAt: nowSec() - 1800, confirmedAt: nowSec() - 1500 },
    { campaignId: 1, checkpointId: 2, donationId: 1, stageName: "school meal distribution centre, Ranau district -> weekly delivery to 6 rural primary schools", status: 1, loggedAt: nowSec() - 300, confirmedAt: nowSec() - 60, ipfsProofHash: "QmT3vh9L6d2iC1kQzY9E3aC1eK7dW5xB2fM8sN4gR6pJqZ" },
    { campaignId: 1, checkpointId: 3, donationId: 1, stageName: "weekly delivery, rural primary schools -> term restock, Ranau district schools", status: 0, loggedAt: nowSec() - 120, confirmedAt: 0 },
    // campaign 2's checkpoint 0 is auto-confirmed on the real chain too (seed.js confirms
    // checkpoint 0 for every campaign, no exceptions) — its "stalled/gone-dark" story only
    // holds here, in preview mode. It is the deliberate exception: no extra checkpoints.
    { campaignId: 2, checkpointId: 0, donationId: 0, stageName: "campaign wallet -> vendor (Kelantan Relief Logistics)", status: 0, loggedAt: nowSec() - 9 * DAY, confirmedAt: 0 },
    { campaignId: 3, checkpointId: 0, donationId: 0, stageName: "campaign wallet -> vendor (Selangor Family Aid Logistics)", status: 1, loggedAt: nowSec() - 3200, confirmedAt: nowSec() - 2800 },
    { campaignId: 3, checkpointId: 1, donationId: 0, stageName: "vendor (Selangor Family Aid Logistics) -> welfare centre, Sungai Buloh", status: 1, loggedAt: nowSec() - 1200, confirmedAt: nowSec() - 900 },
    { campaignId: 3, checkpointId: 2, donationId: 1, stageName: "welfare centre -> emergency welfare case, Subang Jaya", status: 1, loggedAt: nowSec() - 300, confirmedAt: nowSec() - 60 },
    { campaignId: 3, checkpointId: 3, donationId: 1, stageName: "emergency welfare case, Subang Jaya -> emergency food parcel distribution, Kepong", status: 0, loggedAt: nowSec() - 120, confirmedAt: 0 },
    { campaignId: 4, checkpointId: 0, donationId: 0, stageName: "campaign wallet -> vendor (Sabah Highlands Support Network)", status: 1, loggedAt: nowSec() - 3100, confirmedAt: nowSec() - 2600 },
    { campaignId: 4, checkpointId: 1, donationId: 0, stageName: "vendor (Sabah Highlands Support Network) -> community centre, Kundasang", status: 1, loggedAt: nowSec() - 1100, confirmedAt: nowSec() - 800 },
    { campaignId: 4, checkpointId: 2, donationId: 1, stageName: "community centre -> household aid delivery, Kg Mesilou", status: 1, loggedAt: nowSec() - 300, confirmedAt: nowSec() - 60 },
    { campaignId: 4, checkpointId: 3, donationId: 1, stageName: "household aid delivery, Kg Mesilou -> highland school supplies delivery, Kundasang", status: 0, loggedAt: nowSec() - 120, confirmedAt: 0 },
    { campaignId: 5, checkpointId: 0, donationId: 0, stageName: "campaign wallet -> vendor (Negeri Sembilan Rehabilitation Services)", status: 1, loggedAt: nowSec() - 3000, confirmedAt: nowSec() - 2500 },
    { campaignId: 5, checkpointId: 1, donationId: 0, stageName: "vendor (Negeri Sembilan Rehabilitation Services) -> rehabilitation facility, Pekan Rembau", status: 1, loggedAt: nowSec() - 1000, confirmedAt: nowSec() - 700 },
    { campaignId: 5, checkpointId: 2, donationId: 1, stageName: "facility -> home therapy visit, Rembau district", status: 1, loggedAt: nowSec() - 300, confirmedAt: nowSec() - 60 },
    { campaignId: 5, checkpointId: 3, donationId: 1, stageName: "home therapy visit, Rembau district -> assistive equipment delivery, Pekan Rembau", status: 0, loggedAt: nowSec() - 120, confirmedAt: 0 },
    { campaignId: 6, checkpointId: 0, donationId: 0, stageName: "campaign wallet -> vendor (KL Children's Care Logistics)", status: 1, loggedAt: nowSec() - 2900, confirmedAt: nowSec() - 2400 },
    { campaignId: 6, checkpointId: 1, donationId: 1, stageName: "vendor -> final beneficiary", status: 1, loggedAt: nowSec() - 900, confirmedAt: nowSec() - 600 },
    { campaignId: 6, checkpointId: 2, donationId: 1, stageName: "final beneficiary -> school fees & supplies, Setapak", status: 1, loggedAt: nowSec() - 300, confirmedAt: nowSec() - 60 },
    { campaignId: 7, checkpointId: 0, donationId: 0, stageName: "campaign wallet -> vendor (Penang Mainland Healthcare Outreach)", status: 1, loggedAt: nowSec() - 2800, confirmedAt: nowSec() - 2300 },
    { campaignId: 7, checkpointId: 1, donationId: 0, stageName: "vendor (Penang Mainland Healthcare Outreach) -> healthcare facility, Bukit Mertajam", status: 1, loggedAt: nowSec() - 800, confirmedAt: nowSec() - 500 },
    { campaignId: 7, checkpointId: 2, donationId: 1, stageName: "facility -> elderly home-visit outreach, Bukit Mertajam", status: 1, loggedAt: nowSec() - 300, confirmedAt: nowSec() - 60 },
    { campaignId: 7, checkpointId: 3, donationId: 1, stageName: "elderly home-visit outreach, Bukit Mertajam -> mobile clinic visit, Bukit Mertajam", status: 0, loggedAt: nowSec() - 120, confirmedAt: 0 },
  ],
  confirmerByCampaign: {
    0: directConfirmer,
    1: ngoConfirmer,
    2: directConfirmer,
    3: ngoConfirmer,
    4: directConfirmer,
    5: ngoConfirmer,
    6: directConfirmer,
    7: ngoConfirmer,
  },
  donations: [
    { campaignId: 0, donationId: 0, donor: donorA, amount: eth("0.02"), timestamp: Math.floor(Date.now() / 1000) - 1860 },
    { campaignId: 0, donationId: 1, donor: donorB, amount: eth("0.015"), timestamp: Math.floor(Date.now() / 1000) - 3600 },
    { campaignId: 1, donationId: 0, donor: donorA, amount: eth("0.03"), timestamp: Math.floor(Date.now() / 1000) - 2880 },
    { campaignId: 1, donationId: 1, donor: donorB, amount: eth("0.004"), timestamp: Math.floor(Date.now() / 1000) - 3200 },
    { campaignId: 2, donationId: 0, donor: donorB, amount: eth("0.01"), timestamp: nowSec() - 9 * DAY - 1800 },
    { campaignId: 2, donationId: 1, donor: donorA, amount: eth("0.025"), timestamp: nowSec() - 9 * DAY - 600 },
    { campaignId: 3, donationId: 0, donor: donorA, amount: eth("0.025"), timestamp: nowSec() - 1500 },
    { campaignId: 3, donationId: 1, donor: donorB, amount: eth("0.015"), timestamp: nowSec() - 2400 },
    { campaignId: 4, donationId: 0, donor: donorA, amount: eth("0.02"), timestamp: nowSec() - 1800 },
    { campaignId: 4, donationId: 1, donor: donorB, amount: eth("0.004"), timestamp: nowSec() - 2200 },
    { campaignId: 5, donationId: 0, donor: donorB, amount: eth("0.03"), timestamp: nowSec() - 1200 },
    { campaignId: 5, donationId: 1, donor: donorA, amount: eth("0.01"), timestamp: nowSec() - 2100 },
    { campaignId: 6, donationId: 0, donor: donorB, amount: eth("0.025"), timestamp: nowSec() - 1400 },
    { campaignId: 6, donationId: 1, donor: donorA, amount: eth("0.004"), timestamp: nowSec() - 1900 },
    { campaignId: 7, donationId: 0, donor: donorA, amount: eth("0.015"), timestamp: nowSec() - 1600 },
    { campaignId: 7, donationId: 1, donor: donorB, amount: eth("0.02"), timestamp: nowSec() - 2200 },
  ],
  releases: [
    { campaignId: 0, donationId: 0, amount: eth("0.02") },
    { campaignId: 0, donationId: 1, amount: eth("0.015") },
    { campaignId: 1, donationId: 0, amount: eth("0.03") },
    { campaignId: 1, donationId: 1, amount: eth("0.004") },
    { campaignId: 3, donationId: 0, amount: eth("0.025") },
    { campaignId: 3, donationId: 1, amount: eth("0.015") },
    { campaignId: 4, donationId: 0, amount: eth("0.02") },
    { campaignId: 4, donationId: 1, amount: eth("0.004") },
    { campaignId: 5, donationId: 0, amount: eth("0.03") },
    { campaignId: 5, donationId: 1, amount: eth("0.01") },
    { campaignId: 6, donationId: 0, amount: eth("0.025") },
    { campaignId: 6, donationId: 1, amount: eth("0.004") },
    { campaignId: 7, donationId: 0, amount: eth("0.015") },
    { campaignId: 7, donationId: 1, amount: eth("0.02") },
  ],
  confirmers: [
    { address: directConfirmer, label: "Direct-Added Confirmer NGO", stake: eth("0.1"), isAllowed: true },
    { address: ngoConfirmer, label: "Ocean Relief Malaysia", stake: eth("0.1"), isAllowed: true },
  ],
  confirmerScores: {
    [directConfirmer]: { confirmed: 2, total: 4 },
    [ngoConfirmer]: { confirmed: 2, total: 3 },
  },
  aiSummaries: {
    0: {
      summary: "Funds have moved from the campaign wallet through the vendor to the Kota Bharu distribution centre. The final handoff to affected households is logged with photo evidence and awaiting confirmer sign-off.",
      goneDark: false,
      reason: null,
      pendingCount: 1,
      ifrcBenchmark: "IFRC's real Malaysia flood relief operation (MDRMY011) is a live-fetched reference. Connect a wallet to see the current figure.",
    },
    1: {
      summary: "Funds have reached the Ranau district distribution centre and both hops are confirmer-signed. This week's delivery to 6 rural primary schools is logged and awaiting sign-off.",
      goneDark: false,
      reason: null,
      pendingCount: 1,
      analysis: { zScore: 1.4 },
      ifrcBenchmark: "IFRC's real Malaysia flood relief operation (MDRMY011) is a live-fetched reference. Connect a wallet to see the current figure.",
    },
    2: {
      summary: "Campaign wallet to vendor transfer is logged but has not been confirmed in nine days, which is outside this campaign's typical confirmation window.",
      goneDark: true,
      reason: "No confirmer update in 9 days. This may be routine, but it's outside the normal range for this campaign and worth a follow-up.",
      pendingCount: 1,
      analysis: { zScore: 2.6 },
      ifrcBenchmark: "IFRC's real Malaysia flood relief operation (MDRMY011) is a live-fetched reference. Connect a wallet to see the current figure.",
    },
    3: {
      summary: "Funds have moved from the campaign wallet to the vendor and are awaiting confirmer sign-off before reaching Cahaya Damai's welfare centre in Sungai Buloh, Selangor.",
      goneDark: false,
      reason: null,
      pendingCount: 1,
      ifrcBenchmark: "IFRC's real Malaysia flood relief operation (MDRMY011) is a live-fetched reference. Connect a wallet to see the current figure.",
    },
    4: {
      summary: "Donations have been transferred to the vendor and are pending confirmer authorization before distribution to the highland community centre in Kundasang, Sabah.",
      goneDark: false,
      reason: null,
      pendingCount: 1,
      ifrcBenchmark: "IFRC's real Malaysia flood relief operation (MDRMY011) is a live-fetched reference. Connect a wallet to see the current figure.",
    },
    5: {
      summary: "Funds have reached the vendor stage and are awaiting confirmer approval before delivery to the rehabilitation facility in Pekan Rembau, Negeri Sembilan.",
      goneDark: false,
      reason: null,
      pendingCount: 1,
      ifrcBenchmark: "IFRC's real Malaysia flood relief operation (MDRMY011) is a live-fetched reference. Connect a wallet to see the current figure.",
    },
    6: {
      summary: "Donations are with the vendor and awaiting confirmer sign-off before reaching the children's care centre in Setapak, Kuala Lumpur.",
      goneDark: false,
      reason: null,
      pendingCount: 1,
      ifrcBenchmark: "IFRC's real Malaysia flood relief operation (MDRMY011) is a live-fetched reference. Connect a wallet to see the current figure.",
    },
    7: {
      summary: "Funds have been transferred to the vendor and are pending confirmer confirmation before reaching the healthcare facility in Bukit Mertajam, Penang.",
      goneDark: false,
      reason: null,
      pendingCount: 1,
      ifrcBenchmark: "IFRC's real Malaysia flood relief operation (MDRMY011) is a live-fetched reference. Connect a wallet to see the current figure.",
    },
  },
  aiVerdicts: {
    0: {
      2: {
        verdict: "plausible",
        reasoning: "The image shows relief supplies being distributed, consistent with the flood relief campaign objective.",
      },
    },
    1: {
      2: {
        verdict: "plausible",
        reasoning: "The image shows packaged meals being handed off at a school, consistent with the weekly meal program.",
      },
    },
  },
  pendingConfirmerRequests: [
    { address: pendingNgo, label: "Semporna Reef Guardians", jppmRegNumber: "PPM-021-14-08072026" },
  ],
};
