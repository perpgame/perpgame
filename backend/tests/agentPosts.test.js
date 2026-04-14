import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import { ensureDb, createTestApp, createTestUser, createTestAgent } from "./setup.js"

const app = createTestApp()
let user, agent
const createdAddresses = []

beforeAll(async () => {
  await ensureDb()
  user = await createTestUser()
  agent = await createTestAgent(user.address, "PostBot")
  createdAddresses.push(user.address, agent.agentAddress)
})

describe("POST /api/posts (agent auth)", () => {
  it("returns 401 without any auth", async () => {
    const res = await request(app)
      .post("/api/posts")
      .send({ content: "Hello world" })

    expect(res.status).toBe(401)
  })

  it("returns 401 with invalid agent key", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", "pgk_invalid")
      .send({ content: "Hello world" })

    expect(res.status).toBe(401)
  })

  it("creates a post with Authorization: Bearer pgk_...", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${agent.apiKey}`)
      .send({ content: "Posted via Bearer header", tags: ["ETH"] })

    expect(res.status).toBe(201)
    expect(res.body.authorAddress).toBe(agent.agentAddress)
  })

  it("creates a post with agent key", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent.apiKey)
      .send({ content: "Longing $BTC at 65k, breakout confirmed", tags: ["BTC"] })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty("id")
    expect(res.body.authorAddress).toBe(agent.agentAddress)
    expect(res.body.content).toBe("Longing $BTC at 65k, breakout confirmed")
    expect(res.body.tags).toEqual(["BTC"])
  })

  it("creates a post with tags", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent.apiKey)
      .send({ content: "Closed my $ETH short", tags: ["ETH"] })

    expect(res.status).toBe(201)
    expect(res.body.tags).toEqual(["ETH"])
  })

  it("creates a post without tags", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent.apiKey)
      .send({ content: "General market thoughts for today" })

    expect(res.status).toBe(201)
    expect(res.body.tags).toEqual([])
  })

  it("rejects empty content", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent.apiKey)
      .send({ content: "" })

    expect(res.status).toBe(400)
  })

  it("rejects missing content", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent.apiKey)
      .send({})

    expect(res.status).toBe(400)
  })

  it("rejects content over 2000 chars", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent.apiKey)
      .send({ content: "x".repeat(2001) })

    expect(res.status).toBe(400)
  })

  it("rejects non-array tags", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent.apiKey)
      .send({ content: "Non-array tags test " + Date.now(), tags: "BTC" })

    expect(res.status).toBe(400)
  })

  it("rejects more than 10 tags", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent.apiKey)
      .send({ content: "Too many tags test " + Date.now(), tags: Array(11).fill("BTC") })

    expect(res.status).toBe(400)
  })


  it("strips HTML from content", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent.apiKey)
      .send({ content: "<script>alert('xss')</script>Clean text here" })

    expect(res.status).toBe(201)
    expect(res.body.content).not.toContain("<script>")
    expect(res.body.content).toContain("Clean text here")
  })

  it("agent post appears in arena feed", async () => {
    const postRes = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent.apiKey)
      .send({ content: "Feed visibility test $SOL", tags: ["SOL"] })

    expect(postRes.status).toBe(201)

    const feedRes = await request(app)
      .get("/api/feed")
      .set("X-Agent-Key", agent.apiKey)

    expect(feedRes.status).toBe(200)
    const found = feedRes.body.posts.find((p) => p.id === postRes.body.id)
    expect(found).toBeDefined()
    expect(found.content).toBe("Feed visibility test $SOL")
  })

  it("agent post is retrievable by id", async () => {
    const postRes = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent.apiKey)
      .send({ content: "Retrievable post test" })

    expect(postRes.status).toBe(201)

    const getRes = await request(app)
      .get(`/api/posts/${postRes.body.id}`)

    expect(getRes.status).toBe(200)
    expect(getRes.body.content).toBe("Retrievable post test")
    expect(getRes.body.authorAddress).toBe(agent.agentAddress)
  })
})

describe("POST /api/posts (security)", () => {
  it("rejects duplicate content within 30s", async () => {
    const content = "Dedup test " + Date.now()

    const res1 = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent.apiKey)
      .send({ content })

    expect(res1.status).toBe(201)

    const res2 = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent.apiKey)
      .send({ content })

    expect(res2.status).toBe(429)
    expect(res2.body.error).toMatch(/Duplicate/)
  })

  it("strips Cyrillic homoglyph tags", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent.apiKey)
      .send({ content: "Homoglyph test " + Date.now(), tags: ["\u0412\u0422\u0421"] }) // Cyrillic ВТС

    expect(res.status).toBe(201)
    // Cyrillic chars should be filtered out (not ASCII after NFKC)
    expect(res.body.tags).toEqual([])
  })

  it("normalizes fullwidth tags to ASCII", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent.apiKey)
      .send({ content: "Fullwidth test " + Date.now(), tags: ["\uFF22\uFF34\uFF23"] }) // Fullwidth ＢＴＣ

    expect(res.status).toBe(201)
    expect(res.body.tags).toEqual(["BTC"])
  })
})
