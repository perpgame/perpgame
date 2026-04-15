import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import { Wallet } from "ethers"
import { randomBytes, createHash, randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
import { getDb } from "../db/index.js"
import { ensureDb, createTestApp, createTestUser } from "./setup.js"

const app = createTestApp()
let agentWallet, agentAddress, apiKey, viewerUser

beforeAll(async () => {
  await ensureDb()
  const db = getDb()

  // Create agent with a real wallet (so we can sign)
  agentWallet = Wallet.createRandom()
  agentAddress = agentWallet.address.toLowerCase()
  apiKey = `pgk_${randomBytes(32).toString("hex")}`
  const apiKeyHash = createHash("sha256").update(apiKey).digest("hex")
  const agentId = randomUUID()

  await db.execute(sql`
    INSERT INTO users (address, verified, display_name)
    VALUES (${agentAddress}, TRUE, 'ViewerTestBot')
    ON CONFLICT DO NOTHING
  `)
  await db.execute(sql`
    INSERT INTO agents (id, user_address, api_key_hash, key_prefix, is_public)
    VALUES (${agentId}, ${agentAddress}, ${apiKeyHash}, ${apiKey.slice(0, 8)}, TRUE)
  `)

  // Create a viewer user
  viewerUser = await createTestUser()
})

async function getNonce() {
  const res = await request(app).get("/api/register/nonce")
  return res.body.nonce
}

async function signViewerMessage(wallet, nonce) {
  const message = `PerpGame wants you to update viewers. Nonce: ${nonce}`
  return wallet.signMessage(message)
}

describe("PUT /api/state/viewers (wallet signature required)", () => {
  it("updates viewers with valid signature", async () => {
    const nonce = await getNonce()
    const signature = await signViewerMessage(agentWallet, nonce)

    const res = await request(app)
      .put("/api/state/viewers")
      .set("X-Agent-Key", apiKey)
      .send({
        viewers: [viewerUser.address],
        nonce,
        signature,
      })

    expect(res.status).toBe(200)
    expect(res.body.viewers).toEqual([viewerUser.address])
  })

  it("rejects without signature", async () => {
    const res = await request(app)
      .put("/api/state/viewers")
      .set("X-Agent-Key", apiKey)
      .send({ viewers: [viewerUser.address] })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain("nonce is required")
  })

  it("rejects without nonce", async () => {
    const res = await request(app)
      .put("/api/state/viewers")
      .set("X-Agent-Key", apiKey)
      .send({ viewers: [viewerUser.address], signature: "0x1234" })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain("nonce is required")
  })

  it("rejects with wrong wallet signature", async () => {
    const nonce = await getNonce()
    const wrongWallet = Wallet.createRandom()
    const signature = await signViewerMessage(wrongWallet, nonce)

    const res = await request(app)
      .put("/api/state/viewers")
      .set("X-Agent-Key", apiKey)
      .send({
        viewers: [viewerUser.address],
        nonce,
        signature,
      })

    expect(res.status).toBe(403)
    expect(res.body.error).toContain("does not match")
  })

  it("rejects expired/invalid nonce", async () => {
    const signature = await signViewerMessage(agentWallet, "fakefakefakefakefakefakefakefake")

    const res = await request(app)
      .put("/api/state/viewers")
      .set("X-Agent-Key", apiKey)
      .send({
        viewers: [viewerUser.address],
        nonce: "fakefakefakefakefakefakefakefake",
        signature,
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain("Invalid or expired nonce")
  })

  it("rejects replayed nonce", async () => {
    const nonce = await getNonce()
    const signature = await signViewerMessage(agentWallet, nonce)

    // First request succeeds
    const res1 = await request(app)
      .put("/api/state/viewers")
      .set("X-Agent-Key", apiKey)
      .send({ viewers: [viewerUser.address], nonce, signature })
    expect(res1.status).toBe(200)

    // Second request with same nonce fails
    const res2 = await request(app)
      .put("/api/state/viewers")
      .set("X-Agent-Key", apiKey)
      .send({ viewers: [viewerUser.address], nonce, signature })
    expect(res2.status).toBe(400)
    expect(res2.body.error).toContain("Invalid or expired nonce")
  })

  it("rejects without API key", async () => {
    const res = await request(app)
      .put("/api/state/viewers")
      .send({ viewers: [] })

    expect(res.status).toBe(401)
  })

  it("rejects invalid viewer addresses", async () => {
    const nonce = await getNonce()
    const signature = await signViewerMessage(agentWallet, nonce)

    const res = await request(app)
      .put("/api/state/viewers")
      .set("X-Agent-Key", apiKey)
      .send({ viewers: ["not-an-address"], nonce, signature })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain("Invalid address")
  })

  it("rejects more than 50 viewers", async () => {
    const nonce = await getNonce()
    const signature = await signViewerMessage(agentWallet, nonce)
    const tooMany = Array.from({ length: 51 }, () => `0x${randomBytes(20).toString("hex")}`)

    const res = await request(app)
      .put("/api/state/viewers")
      .set("X-Agent-Key", apiKey)
      .send({ viewers: tooMany, nonce, signature })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain("Max 50")
  })
})

describe("GET /api/state/viewers", () => {
  it("returns current whitelist", async () => {
    const res = await request(app)
      .get("/api/state/viewers")
      .set("X-Agent-Key", apiKey)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.viewers)).toBe(true)
    expect(res.body.viewers).toContain(viewerUser.address)
  })

  it("rejects without auth", async () => {
    const res = await request(app).get("/api/state/viewers")
    expect(res.status).toBe(401)
  })
})

describe("GET /api/agents/:address/state (whitelisted access)", () => {
  it("whitelisted user can view agent state", async () => {
    const res = await request(app)
      .get(`/api/agents/${agentAddress}/state`)
      .set("Authorization", `Bearer ${viewerUser.token}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("agent")
    expect(res.body).toHaveProperty("settings")
    expect(res.body).toHaveProperty("state")
    expect(res.body.agent.name).toBe("ViewerTestBot")
  })

  it("non-whitelisted user gets 403", async () => {
    const otherUser = await createTestUser()
    const res = await request(app)
      .get(`/api/agents/${agentAddress}/state`)
      .set("Authorization", `Bearer ${otherUser.token}`)

    expect(res.status).toBe(403)
  })

  it("rejects without auth", async () => {
    const res = await request(app)
      .get(`/api/agents/${agentAddress}/state`)

    expect(res.status).toBe(401)
  })
})

describe("GET /api/my-agents", () => {
  it("whitelisted user sees the agent", async () => {
    const res = await request(app)
      .get("/api/my-agents")
      .set("Authorization", `Bearer ${viewerUser.token}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    const found = res.body.find(a => a.address === agentAddress)
    expect(found).toBeDefined()
    expect(found.name).toBe("ViewerTestBot")
  })

  it("non-whitelisted user sees empty list", async () => {
    const otherUser = await createTestUser()
    const res = await request(app)
      .get("/api/my-agents")
      .set("Authorization", `Bearer ${otherUser.token}`)

    expect(res.status).toBe(200)
    expect(res.body.find(a => a.address === agentAddress)).toBeUndefined()
  })

  it("rejects without auth", async () => {
    const res = await request(app).get("/api/my-agents")
    expect(res.status).toBe(401)
  })
})
