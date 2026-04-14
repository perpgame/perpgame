import { describe, it, expect, beforeAll, afterAll } from "vitest"
import request from "supertest"
import { randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
import { getDb } from "../db/index.js"
import { ensureDb, createTestApp, createTestUser, createTestAgent, cleanup } from "./setup.js"

const app = createTestApp()
let agent, otherAgent
let scoredPostId, unscoredPostId
const createdAddresses = []

async function createScoredPrediction(authorAddress, { coin = "BTC", direction = "bull", outcome = "correct" } = {}) {
  const db = getDb()
  const id = randomUUID()
  await db.execute(sql`
    INSERT INTO posts (
      id, author_address, content, tags,
      direction, timeframe,
      prediction_coin, prediction_price_at_call, prediction_price_at_expiry,
      prediction_expires_at, prediction_scored, prediction_outcome
    ) VALUES (
      ${id}, ${authorAddress},
      ${`${direction} ${coin} 1h — test`},
      ${JSON.stringify([coin])},
      ${direction}, '1h',
      ${coin}, 65000, 66000,
      NOW() - INTERVAL '1 hour', TRUE, ${outcome}
    )
  `)
  return id
}

async function createUnscoredPrediction(authorAddress) {
  const db = getDb()
  const id = randomUUID()
  await db.execute(sql`
    INSERT INTO posts (
      id, author_address, content, tags,
      direction, timeframe,
      prediction_coin, prediction_price_at_call,
      prediction_expires_at, prediction_scored
    ) VALUES (
      ${id}, ${authorAddress},
      'bull BTC 1h — unscored test',
      ${JSON.stringify(["BTC"])},
      'bull', '1h',
      'BTC', 65000,
      NOW() + INTERVAL '1 hour', FALSE
    )
  `)
  return id
}

beforeAll(async () => {
  await ensureDb()

  const user1 = await createTestUser()
  agent = await createTestAgent(user1.address, "LessonBot")
  createdAddresses.push(user1.address, agent.agentAddress)

  const user2 = await createTestUser()
  otherAgent = await createTestAgent(user2.address, "OtherBot")
  createdAddresses.push(user2.address, otherAgent.agentAddress)

  scoredPostId = await createScoredPrediction(agent.agentAddress, { coin: "BTC", outcome: "wrong" })
  unscoredPostId = await createUnscoredPrediction(agent.agentAddress)
})

afterAll(async () => {
  await cleanup(createdAddresses)
})

describe("PUT /api/predictions/:id/lesson", () => {
  it("returns 401 without key", async () => {
    const res = await request(app)
      .put(`/api/predictions/${scoredPostId}/lesson`)
      .send({ lesson: "test", type: "mistake" })
    expect(res.status).toBe(401)
  })

  it("saves a lesson on a scored prediction", async () => {
    const res = await request(app)
      .put(`/api/predictions/${scoredPostId}/lesson`)
      .set("X-Agent-Key", agent.apiKey)
      .send({ lesson: "Went bull against bearish trend — ignored trend signal", type: "mistake" })

    expect(res.status).toBe(200)
    expect(res.body.saved).toBe(true)
    expect(res.body.predictionId).toBe(scoredPostId)
    expect(res.body.lesson).toBe("Went bull against bearish trend — ignored trend signal")
    expect(res.body.type).toBe("mistake")
  })

  it("replaces existing lesson on update", async () => {
    const res = await request(app)
      .put(`/api/predictions/${scoredPostId}/lesson`)
      .set("X-Agent-Key", agent.apiKey)
      .send({ lesson: "Updated lesson", type: "note" })

    expect(res.status).toBe(200)
    expect(res.body.lesson).toBe("Updated lesson")
    expect(res.body.type).toBe("note")
  })

  it("returns 404 for unscored prediction", async () => {
    const res = await request(app)
      .put(`/api/predictions/${unscoredPostId}/lesson`)
      .set("X-Agent-Key", agent.apiKey)
      .send({ lesson: "some lesson", type: "note" })
    expect(res.status).toBe(404)
  })

  it("returns 404 for another agent's prediction", async () => {
    const res = await request(app)
      .put(`/api/predictions/${scoredPostId}/lesson`)
      .set("X-Agent-Key", otherAgent.apiKey)
      .send({ lesson: "sneaky lesson", type: "note" })
    expect(res.status).toBe(404)
  })

  it("returns 400 for missing lesson", async () => {
    const res = await request(app)
      .put(`/api/predictions/${scoredPostId}/lesson`)
      .set("X-Agent-Key", agent.apiKey)
      .send({ type: "mistake" })
    expect(res.status).toBe(400)
  })

  it("returns 400 for invalid type", async () => {
    const res = await request(app)
      .put(`/api/predictions/${scoredPostId}/lesson`)
      .set("X-Agent-Key", agent.apiKey)
      .send({ lesson: "valid lesson", type: "invalid" })
    expect(res.status).toBe(400)
  })

  it("returns 400 for lesson over 500 chars", async () => {
    const res = await request(app)
      .put(`/api/predictions/${scoredPostId}/lesson`)
      .set("X-Agent-Key", agent.apiKey)
      .send({ lesson: "x".repeat(501), type: "note" })
    expect(res.status).toBe(400)
  })

  it("returns 404 for nonexistent prediction", async () => {
    const res = await request(app)
      .put(`/api/predictions/${randomUUID()}/lesson`)
      .set("X-Agent-Key", agent.apiKey)
      .send({ lesson: "lesson", type: "note" })
    expect(res.status).toBe(404)
  })
})

describe("lesson appears in /home and /predictions/history", () => {
  it("lesson shows in prediction_results in /home", async () => {
    const res = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    const pred = res.body.prediction_results.find(p => p.id === scoredPostId)
    expect(pred).toBeDefined()
    expect(pred.lesson).toBe("Updated lesson")
    expect(pred.lessonType).toBe("note")
  })

  it("recent_lessons is returned in /home", async () => {
    const res = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.recent_lessons)).toBe(true)
    const l = res.body.recent_lessons.find(l => l.predictionId === scoredPostId)
    expect(l).toBeDefined()
    expect(l.lesson).toBe("Updated lesson")
    expect(l.coin).toBe("BTC")
  })

  it("lesson shows in predictions/history", async () => {
    const res = await request(app)
      .get("/api/predictions/history")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    const pred = res.body.find(p => p.id === scoredPostId)
    expect(pred).toBeDefined()
    expect(pred.lesson).toBe("Updated lesson")
    expect(pred.lessonType).toBe("note")
  })

  it("agent with no lessons returns empty recent_lessons", async () => {
    const res = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", otherAgent.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.recent_lessons).toEqual([])
  })
})
