import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import { ensureDb, createTestApp, createTestUser, createTestAgent } from "./setup.js"

const app = createTestApp()
let user, agent1, agent2

// Helper: valid state with all required fields
const validState = (overrides = {}) => ({
  lastCheck: "2026-03-25T10:00:00Z",
  lessons: [],
  wrongStreak: 0,
  ...overrides,
})

beforeAll(async () => {
  await ensureDb()
  user = await createTestUser()
  agent1 = await createTestAgent(user.address, "StateBot")
  agent2 = await createTestAgent(user.address, "OtherStateBot")
})

describe("GET /api/state", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/state")
    expect(res.status).toBe(401)
  })

  it("returns empty state for new agent", async () => {
    const res = await request(app)
      .get("/api/state")
      .set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("state")
    expect(res.body.state).toEqual({})
    expect(res.body.updatedAt).toBeNull()
  })
})

describe("PUT /api/state", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app)
      .put("/api/state")
      .send({ state: validState() })
    expect(res.status).toBe(401)
  })

  it("saves and retrieves state", async () => {
    const testState = validState({
      trustWeights: { "0xabc": 0.8 },
    })

    const putRes = await request(app)
      .put("/api/state")
      .set("X-Agent-Key", agent1.apiKey)
      .send({ state: testState })

    expect(putRes.status).toBe(200)
    expect(putRes.body.saved).toBe(true)

    const getRes = await request(app)
      .get("/api/state")
      .set("X-Agent-Key", agent1.apiKey)

    expect(getRes.status).toBe(200)
    expect(getRes.body.state.trustWeights).toEqual({ "0xabc": 0.8 })
    expect(getRes.body.state.wrongStreak).toBe(0)
    expect(getRes.body.updatedAt).not.toBeNull()
  })

  it("merges scalars — overwrites existing value", async () => {
    const putRes = await request(app)
      .put("/api/state")
      .set("X-Agent-Key", agent1.apiKey)
      .send({ state: { wrongStreak: 3 } })

    expect(putRes.status).toBe(200)
    expect(putRes.body.state.wrongStreak).toBe(3)
    // trustWeights from previous save should still be there
    expect(putRes.body.state.trustWeights).toEqual({ "0xabc": 0.8 })
  })

  it("merges arrays — appends new items", async () => {
    const putRes = await request(app)
      .put("/api/state")
      .set("X-Agent-Key", agent1.apiKey)
      .send({ state: { lessons: [{ coin: "BTC", type: "mistake", lesson: "test lesson", date: "2026-03-25" }] } })

    expect(putRes.status).toBe(200)
    expect(putRes.body.state.lessons).toHaveLength(1)

    // Append another
    const putRes2 = await request(app)
      .put("/api/state")
      .set("X-Agent-Key", agent1.apiKey)
      .send({ state: { lessons: [{ coin: "ETH", type: "pattern", lesson: "another lesson", date: "2026-03-25" }] } })

    expect(putRes2.status).toBe(200)
    expect(putRes2.body.state.lessons).toHaveLength(2)
    expect(putRes2.body.state.lessons[0].coin).toBe("BTC")
    expect(putRes2.body.state.lessons[1].coin).toBe("ETH")
  })

  it("merges objects — adds new keys, overwrites existing", async () => {
    const putRes = await request(app)
      .put("/api/state")
      .set("X-Agent-Key", agent1.apiKey)
      .send({ state: { trustWeights: { "0xdef": 0.5 } } })

    expect(putRes.status).toBe(200)
    // Both old and new keys should exist
    expect(putRes.body.state.trustWeights["0xabc"]).toBe(0.8)
    expect(putRes.body.state.trustWeights["0xdef"]).toBe(0.5)
  })

  it("isolates state between agents", async () => {
    await request(app)
      .put("/api/state")
      .set("X-Agent-Key", agent2.apiKey)
      .send({ state: validState({ agent2Only: true }) })

    const res1 = await request(app)
      .get("/api/state")
      .set("X-Agent-Key", agent1.apiKey)

    const res2 = await request(app)
      .get("/api/state")
      .set("X-Agent-Key", agent2.apiKey)

    expect(res1.body.state).not.toHaveProperty("agent2Only")
    expect(res2.body.state.agent2Only).toBe(true)
  })

  it("rejects non-object state", async () => {
    const res = await request(app)
      .put("/api/state")
      .set("X-Agent-Key", agent1.apiKey)
      .send({ state: "not an object" })

    expect(res.status).toBe(400)
  })

  it("rejects array state", async () => {
    const res = await request(app)
      .put("/api/state")
      .set("X-Agent-Key", agent1.apiKey)
      .send({ state: [1, 2, 3] })

    expect(res.status).toBe(400)
  })

  it("rejects missing state field", async () => {
    const res = await request(app)
      .put("/api/state")
      .set("X-Agent-Key", agent1.apiKey)
      .send({ data: { foo: "bar" } })

    expect(res.status).toBe(400)
  })

  it("rejects state that would result in missing required fields", async () => {
    // New agent with no existing state — must provide required fields
    const newAgent = await createTestAgent(user.address, "EmptyStateBot")
    const res = await request(app)
      .put("/api/state")
      .set("X-Agent-Key", newAgent.apiKey)
      .send({ state: { trustWeights: { "0xabc": 0.8 } } })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing required fields/)
  })

  it("accepts partial update when existing state has required fields", async () => {
    // agent1 already has required fields from earlier tests
    const res = await request(app)
      .put("/api/state")
      .set("X-Agent-Key", agent1.apiKey)
      .send({ state: { lastCheck: "2024-01-01" } })

    expect(res.status).toBe(200)
    // Required fields still present from previous saves
    expect(res.body.state.lastCheck).toBeDefined()
    expect(res.body.state.wrongStreak).toBeDefined()
  })

  it("ignores insights key — notes are not saved to state", async () => {
    const res = await request(app)
      .put("/api/state")
      .set("X-Agent-Key", agent1.apiKey)
      .send({ state: { insights: ["this should be dropped"], lastCheck: "2024-01-01" } })

    expect(res.status).toBe(200)
    expect(res.body.state.insights).toBeUndefined()
  })

  it("rejects state exceeding 64KB", async () => {
    const res = await request(app)
      .put("/api/state")
      .set("X-Agent-Key", agent1.apiKey)
      .send({ state: { bigField: "x".repeat(65 * 1024) } })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/too large/)
  })
})
