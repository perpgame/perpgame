import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import { Wallet } from "ethers"
import { ensureDb, createTestApp } from "./setup.js"

const app = createTestApp()

beforeAll(async () => {
  await ensureDb()
})

describe("GET /api/register/nonce", () => {
  it("returns a nonce and message", async () => {
    const res = await request(app).get("/api/register/nonce")

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("nonce")
    expect(res.body).toHaveProperty("message")
    expect(res.body.nonce).toHaveLength(32) // 16 bytes hex
    expect(res.body.message).toContain(res.body.nonce)
  })
})

describe("POST /api/register", () => {
  async function getNonceAndSign(wallet) {
    const nonceRes = await request(app).get("/api/register/nonce")
    const { nonce, message } = nonceRes.body
    const signature = await wallet.signMessage(message)
    return { nonce, signature }
  }

  it("registers an agent with valid signature", async () => {
    const wallet = Wallet.createRandom()
    const { nonce, signature } = await getNonceAndSign(wallet)

    const res = await request(app)
      .post("/api/register")
      .send({
        name: "TestBot",
        hlAddress: wallet.address,
        nonce,
        signature,
      })

    expect(res.status).toBe(201)
    expect(res.body.name).toBe("TestBot")
    expect(res.body.address).toBe(wallet.address.toLowerCase())
    expect(res.body.apiKey).toMatch(/^pgk_/)
    expect(res.body).toHaveProperty("next_steps")
  })

  it("registers with optional fields", async () => {
    const wallet = Wallet.createRandom()
    const { nonce, signature } = await getNonceAndSign(wallet)

    const res = await request(app)
      .post("/api/register")
      .send({
        name: "FullBot",
        bio: "I trade BTC",
        strategyDescription: "Momentum strategy",
        hlAddress: wallet.address,
        nonce,
        signature,
      })

    expect(res.status).toBe(201)
    expect(res.body.name).toBe("FullBot")
  })

  it("rejects missing name", async () => {
    const wallet = Wallet.createRandom()
    const { nonce, signature } = await getNonceAndSign(wallet)

    const res = await request(app)
      .post("/api/register")
      .send({ hlAddress: wallet.address, nonce, signature })

    expect(res.status).toBe(400)
  })

  it("rejects missing hlAddress", async () => {
    const nonceRes = await request(app).get("/api/register/nonce")

    const res = await request(app)
      .post("/api/register")
      .send({ name: "NoAddr", nonce: nonceRes.body.nonce, signature: "0x" })

    expect(res.status).toBe(400)
  })

  it("rejects missing nonce", async () => {
    const wallet = Wallet.createRandom()

    const res = await request(app)
      .post("/api/register")
      .send({ name: "NoNonce", hlAddress: wallet.address, signature: "0x" })

    expect(res.status).toBe(400)
  })

  it("rejects missing signature", async () => {
    const wallet = Wallet.createRandom()
    const nonceRes = await request(app).get("/api/register/nonce")

    const res = await request(app)
      .post("/api/register")
      .send({ name: "NoSig", hlAddress: wallet.address, nonce: nonceRes.body.nonce })

    expect(res.status).toBe(400)
  })

  it("rejects invalid signature", async () => {
    const wallet = Wallet.createRandom()
    const nonceRes = await request(app).get("/api/register/nonce")

    const res = await request(app)
      .post("/api/register")
      .send({
        name: "BadSig",
        hlAddress: wallet.address,
        nonce: nonceRes.body.nonce,
        signature: "0x" + "ab".repeat(65),
      })

    expect(res.status).toBe(400)
  })

  it("rejects signature from wrong wallet", async () => {
    const wallet1 = Wallet.createRandom()
    const wallet2 = Wallet.createRandom()
    const { nonce, signature } = await getNonceAndSign(wallet1)

    const res = await request(app)
      .post("/api/register")
      .send({
        name: "WrongWallet",
        hlAddress: wallet2.address, // different address than signer
        nonce,
        signature,
      })

    expect(res.status).toBe(403)
  })

  it("rejects expired/invalid nonce", async () => {
    const wallet = Wallet.createRandom()
    const fakeNonce = "deadbeef".repeat(4)
    const message = `perpgame.xyz wants you to register on PerpGame. Nonce: ${fakeNonce}`
    const signature = await wallet.signMessage(message)

    const res = await request(app)
      .post("/api/register")
      .send({
        name: "FakeNonce",
        hlAddress: wallet.address,
        nonce: fakeNonce,
        signature,
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/nonce/i)
  })

  it("rejects reusing a nonce", async () => {
    const wallet = Wallet.createRandom()
    const { nonce, signature } = await getNonceAndSign(wallet)

    // First use succeeds
    const res1 = await request(app)
      .post("/api/register")
      .send({ name: "First", hlAddress: wallet.address, nonce, signature })
    expect(res1.status).toBe(201)

    // Second use with same nonce fails
    const wallet2 = Wallet.createRandom()
    const message = `perpgame.xyz wants you to register on PerpGame. Nonce: ${nonce}`
    const sig2 = await wallet2.signMessage(message)

    const res2 = await request(app)
      .post("/api/register")
      .send({ name: "Second", hlAddress: wallet2.address, nonce, signature: sig2 })

    expect(res2.status).toBe(400)
    expect(res2.body.error).toMatch(/nonce/i)
  })

  it("rejects duplicate HL address", async () => {
    const wallet = Wallet.createRandom()

    // Register first time
    const { nonce: n1, signature: s1 } = await getNonceAndSign(wallet)
    const res1 = await request(app)
      .post("/api/register")
      .send({ name: "Original", hlAddress: wallet.address, nonce: n1, signature: s1 })
    expect(res1.status).toBe(201)

    // Try again with same wallet
    const { nonce: n2, signature: s2 } = await getNonceAndSign(wallet)
    const res2 = await request(app)
      .post("/api/register")
      .send({ name: "Duplicate", hlAddress: wallet.address, nonce: n2, signature: s2 })

    expect(res2.status).toBe(409)
  })

  it("rejects invalid Ethereum address format", async () => {
    const nonceRes = await request(app).get("/api/register/nonce")

    const res = await request(app)
      .post("/api/register")
      .send({
        name: "BadAddr",
        hlAddress: "not-an-address",
        nonce: nonceRes.body.nonce,
        signature: "0x",
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/hlAddress/i)
  })
})
