# Judge Testing Guide

No crypto wallet is required to browse. Every read (campaign list, checkpoints,
AI summary) works off a public read-only RPC connection — MetaMask is only
needed to donate or for the two admin-facing actions called out as optional
in the last step.

## Before you start

Confirm with whoever is running the demo:
- The URL to open (local `http://127.0.0.1:5500` or a deployed link).
- Whether the 3 seeded demo campaigns are live on-chain. If they are, you'll
  see real data and a real AI-generated summary. If a campaign card or the
  page shows a **"Demo data — connect a wallet..."** notice, you're looking
  at hardcoded fallback data, not a live result — see the "Real vs demo
  data" section below before drawing conclusions from what you see.

## Step 1 — Overview page

Open the app. You land on **Overview**. Look at:
- The four stat cards (Raised / Active Campaigns / Released / Confirmers).
- The live activity feed and the fund-flow map — drag a node to see it move.

This page alone should already tell you what the product does before you
click anything.

## Step 2 — Browse a campaign, no sign-in needed

Click **Donate** in the top nav, then open any campaign card. On the detail
page you'll see:
- The **5W1H block** (What / Why / Who / Where / How) — this is fixed,
  pre-written copy per campaign, not AI-generated.
- The **AI summary card** — click **Generate AI summary** to fetch it. This
  one *is* AI-generated (or falls back to pre-written demo text if the AI
  call fails or you're in preview mode; see below). It shows a 4-step
  pipeline (checkpoints retrieved → pace vs. campaign history → confirmer
  track record → status) followed by a plain-English summary paragraph. It's
  on-demand rather than automatic so a donor just browsing campaigns never
  triggers a Groq call they didn't ask for.
- The checkpoint timeline / custody map for that campaign.

## Step 3 — Trigger a live checkpoint

On a real (non-preview) campaign card, click **Trigger live checkpoint**.
This fires a real, server-signed transaction on Polygon Amoy — no wallet
needed. Watch the campaign's checkpoint count update, then click
**Generate AI summary** again to see it reflect the new on-chain data
(this also proves the AI summary isn't static — it re-generates from the
checkpoint history that just changed).

## Step 4 — Confirmers panel & Analytics

- **Confirm** page: view the confirmer allowlist — who's vetted to sign off
  checkpoints for which campaign.
- **Analytics** page: aggregate charts across all campaigns (time-to-confirm,
  category breakdown, etc.).

Both are read-only and need no sign-in.

## Step 5 — Optional, needs MetaMask (advanced / technical judges only)

These exercise the smart contract's permission logic directly and require a
MetaMask wallet with testnet POL:
- Try confirming a checkpoint from a wallet that isn't a registered
  confirmer — it should revert.
- Try registering a confirmer address that isn't on the platform's
  allowlist — it should also revert.

Skip this section if you don't want to set up MetaMask; everything else in
this guide covers the product's actual donor/organizer experience.

## Real vs demo data — how to tell

- **Real**: after clicking **Generate AI summary**, the text is specific and
  changes when you trigger a live checkpoint and generate again (Step 3). No
  "Demo data" banner shown.
- **Demo/fallback**: shown automatically if there are zero campaigns on-chain,
  or if a live read fails. A small **"Demo data — connect a wallet..."**
  notice appears, and the AI summary renders immediately (no button, no
  trigger needed) with fixed, pre-written copy (same text every time,
  doesn't change no matter what you click).

If you only see demo data, the 3 seeded campaigns likely haven't been
deployed/seeded for this session — flag it to whoever's running the demo
rather than judging the AI summary feature off the fallback text.
