import { ethers } from "ethers";

const BALANCE_FLOOR = ethers.parseEther("0.01");
const DRIP_AMOUNT = ethers.parseEther("0.05");
const RELAYER_SAFETY_FLOOR = ethers.parseEther("0.1");

// Guards against concurrent requests hitting the same warm serverless instance only —
// it does NOT protect across instances/cold starts, which is an accepted limitation.
const inFlight = new Set();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const { address } = req.body;
  if (!address || !ethers.isAddress(address)) {
    res.status(400).json({ error: "invalid-address" });
    return;
  }

  if (!process.env.RELAYER_PRIVATE_KEY || !process.env.ALCHEMY_AMOY_URL) {
    res.status(500).json({ error: "relayer-not-configured" });
    return;
  }

  if (inFlight.has(address)) {
    res.status(429).json({ error: "request-in-progress" });
    return;
  }
  inFlight.add(address);

  try {
    const provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_AMOY_URL);

    const balance = await provider.getBalance(address);
    if (balance >= BALANCE_FLOOR) {
      res.status(429).json({ error: "already-funded" });
      return;
    }

    const relayer = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider);

    const relayerBalance = await provider.getBalance(relayer.address);
    if (relayerBalance < RELAYER_SAFETY_FLOOR) {
      res.status(503).json({ error: "relayer-depleted" });
      return;
    }

    const tx = await relayer.sendTransaction({ to: address, value: DRIP_AMOUNT });

    res.status(200).json({ txHash: tx.hash });
  } catch (err) {
    console.error("relay-gas failed:", err?.message || err);
    res.status(500).json({ error: "relay-failed" });
  } finally {
    inFlight.delete(address);
  }
}
