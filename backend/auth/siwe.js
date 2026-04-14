import { randomBytes } from "node:crypto";
import { SiweMessage } from "siwe";
import { insertNonce, consumeNonce, getNonce } from "../db/queries/nonces.js";

// secp256k1 curve order
const SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;

/**
 * Normalize a signature to use the canonical (low-s) form.
 * Some wallets produce signatures with s in the upper half of the curve order,
 * which ethers v6 rejects. Flipping s = n - s and adjusting v gives an
 * equivalent signature that recovers the same address.
 */
function normalizeSignature(sig) {
  const hex = sig.startsWith("0x") ? sig.slice(2) : sig;
  if (hex.length !== 130) return sig;

  const s = BigInt("0x" + hex.slice(64, 128));
  if (s <= SECP256K1_N / 2n) return sig; // already canonical

  const r = hex.slice(0, 64);
  const v = parseInt(hex.slice(128, 130), 16);
  const newS = (SECP256K1_N - s).toString(16).padStart(64, "0");
  const newV = v >= 27 ? (v === 27 ? 28 : 27) : v === 0 ? 1 : 0;
  return "0x" + r + newS + newV.toString(16).padStart(2, "0");
}

const ALLOWED_DOMAINS = [
  "perpgame.xyz",
  "www.perpgame.xyz",
  "localhost:5173",
  "localhost:3000",
];

const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000; // 5 minutes

export const generateNonce = async () => {
  const nonce = randomBytes(16).toString("hex");
  await insertNonce(nonce);
  return nonce;
};

const NONCE_MAX_AGE_MS = 10 * 60 * 1000; // must match DB interval

const consumeNonceOrThrow = async (nonceValue) => {
  // Explicit pre-check: distinguish expired vs invalid vs already used
  const existing = await getNonce(nonceValue);
  if (!existing) {
    throw new Error("Invalid nonce. Please request a new one.");
  }
  if (existing.consumed) {
    throw new Error("Nonce already used. Please request a new one.");
  }
  if (Date.now() - new Date(existing.created_at).getTime() > NONCE_MAX_AGE_MS) {
    throw new Error("Nonce expired. Please request a new one.");
  }

  const result = await consumeNonce(nonceValue);
  if (!result) {
    throw new Error("Invalid or expired nonce. Please request a new one.");
  }
};

export const verifySiweSignature = async (message, signature) => {
  const siweMessage = new SiweMessage(message);

  // Validate domain
  if (!ALLOWED_DOMAINS.includes(siweMessage.domain)) {
    throw new Error(`Invalid domain: ${siweMessage.domain}`);
  }

  // Validate nonce
  if (!siweMessage.nonce || siweMessage.nonce.length < 16) {
    throw new Error("Nonce too short");
  }

  // Consume nonce (prevents replay)
  await consumeNonceOrThrow(siweMessage.nonce);

  // Validate issued-at is recent
  if (siweMessage.issuedAt) {
    const issuedAt = new Date(siweMessage.issuedAt);
    const age = Date.now() - issuedAt.getTime();
    if (age > MAX_MESSAGE_AGE_MS) {
      throw new Error("Message expired. Please sign again.");
    }
    if (age < -60_000) {
      throw new Error("Message timestamp is in the future");
    }
  }

  // Verify signature and recover address (normalize s to canonical form first)
  const { data: fields } = await siweMessage.verify({ signature: normalizeSignature(signature) });

  return fields.address.toLowerCase();
};
