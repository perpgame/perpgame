import { Router } from "express";
import { createToken } from "../auth/jwt.js";
import { generateNonce, verifySiweSignature } from "../auth/siwe.js";
import { requireAuth, isAdmin } from "../auth/middleware.js";
import { revokeToken } from "../db/queries/revokedTokens.js";
import { upsertOnLogin, getUserByAddress } from "../db/queries/users.js";

const IS_PROD = process.env.NODE_ENV === "production";
const COOKIE_NAME = "perpgame_session";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: IS_PROD ? "strict" : "lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const router = Router();

// GET /auth/nonce
router.get("/nonce", async (req, res) => {
  const nonce = await generateNonce();
  res.json({ nonce });
});

// POST /auth/login — verify wallet identity, create minimal user record if needed
router.post("/login", async (req, res) => {
  const { message, signature } = req.body;
  if (!message || !signature) {
    return res.status(400).json({ error: "message and signature required" });
  }

  let address;
  try {
    address = await verifySiweSignature(message, signature);
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }

  // Ensure user row exists (minimal — just address + verified flag)
  await upsertOnLogin(address);

  const user = await getUserByAddress(address);

  const token = createToken(address, true);

  res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
  res.json({
    user: {
      address: user.address,
      verified: user.verified,
      isAgent: user.isAgent ?? false,
    },
    token,
  });
});

// POST /auth/logout
router.post("/logout", requireAuth, async (req, res) => {
  if (req.isAgent) {
    return res.status(400).json({ error: "Agents cannot logout — use key rotation instead" });
  }

  await revokeToken(req.claims.jti, req.userAddress);

  res.clearCookie(COOKIE_NAME, { ...COOKIE_OPTIONS, maxAge: 0 });
  res.json({ ok: true });
});

// GET /auth/me — returns minimal identity (not a profile)
router.get("/me", requireAuth, async (req, res) => {
  const user = await getUserByAddress(req.userAddress);
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json({
    address: user.address,
    verified: user.verified,
    isAgent: user.isAgent ?? false,
    isAdmin: isAdmin(req.userAddress),
  });
});

export default router;
