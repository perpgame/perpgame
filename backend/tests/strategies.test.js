import { describe, it, expect, beforeAll, afterAll } from "vitest"
import request from "supertest"
import { sql } from "drizzle-orm"
import { getDb } from "../db/index.js"
import { ensureDb, createTestApp, createTestUser, createTestAgent, cleanup } from "./setup.js"

const app = createTestApp()

let agent, agentToken
let otherAgent, otherToken
const createdAddresses = []

beforeAll(async () => {
  await ensureDb()

  const user = await createTestUser()
  agent = await createTestAgent(user.address, "StrategyBot")
  agentToken = (await createTestUser(agent.agentAddress)).token
  createdAddresses.push(user.address, agent.agentAddress)

  const user2 = await createTestUser()
  otherAgent = await createTestAgent(user2.address, "OtherStrategyBot")
  otherToken = (await createTestUser(otherAgent.agentAddress)).token
  createdAddresses.push(user2.address, otherAgent.agentAddress)
})

afterAll(async () => {
  const db = getDb()
  for (const addr of createdAddresses) {
    await db.execute(sql`DELETE FROM strategies WHERE agent_address = ${addr}`).catch(() => {})
    await db.execute(sql`DELETE FROM coin_edge_profiles WHERE agent_address = ${addr}`).catch(() => {})
  }
  await cleanup(createdAddresses)
})

const auth = (token) => ({ Authorization: `Bearer ${token}` })
const strategiesUrl = (addr) => `/api/agents/${addr}/strategies`
const strategyUrl = (addr, id) => `/api/agents/${addr}/strategies/${id}`

const validConditions = [{ path: "rsi", operator: "<", value: 35 }]

// ─── GET /api/agents/:address/strategies ─────────────────────────────────────

describe("GET /api/agents/:address/strategies", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get(strategiesUrl(agent.agentAddress))
    expect(res.status).toBe(401)
  })

  it("returns 403 for another agent", async () => {
    const res = await request(app)
      .get(strategiesUrl(agent.agentAddress))
      .set(auth(otherToken))
    expect(res.status).toBe(403)
  })

  it("returns empty list for new agent", async () => {
    const res = await request(app)
      .get(strategiesUrl(agent.agentAddress))
      .set(auth(agentToken))
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("strategies")
    expect(Array.isArray(res.body.strategies)).toBe(true)
    expect(res.body.strategies).toHaveLength(0)
  })
})

// ─── POST /api/agents/:address/strategies ────────────────────────────────────

describe("POST /api/agents/:address/strategies", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app)
      .post(strategiesUrl(agent.agentAddress))
      .send({ conditions: validConditions, direction: "bull", timeframe: "1h", coin: "BTC" })
    expect(res.status).toBe(401)
  })

  it("returns 403 for another agent", async () => {
    const res = await request(app)
      .post(strategiesUrl(agent.agentAddress))
      .set(auth(otherToken))
      .send({ conditions: validConditions, direction: "bull" })
    expect(res.status).toBe(403)
  })

  it("returns 400 when conditions missing", async () => {
    const res = await request(app)
      .post(strategiesUrl(agent.agentAddress))
      .set(auth(agentToken))
      .send({ direction: "bull", timeframe: "1h", coin: "BTC" })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/conditions/)
  })

  it("returns 400 when conditions is empty array", async () => {
    const res = await request(app)
      .post(strategiesUrl(agent.agentAddress))
      .set(auth(agentToken))
      .send({ conditions: [], direction: "bull" })
    expect(res.status).toBe(400)
  })

  it("returns 400 for invalid direction", async () => {
    const res = await request(app)
      .post(strategiesUrl(agent.agentAddress))
      .set(auth(agentToken))
      .send({ conditions: validConditions, direction: "sideways" })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/direction/)
  })

  it("returns 400 for invalid condition (bad operator)", async () => {
    const res = await request(app)
      .post(strategiesUrl(agent.agentAddress))
      .set(auth(agentToken))
      .send({ conditions: [{ path: "rsi", operator: "!=", value: 50 }], direction: "bull" })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/condition/i)
  })

  it("creates a strategy hypothesis", async () => {
    const res = await request(app)
      .post(strategiesUrl(agent.agentAddress))
      .set(auth(agentToken))
      .send({ conditions: validConditions, direction: "bull", timeframe: "1h", coin: "BTC" })
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty("id")
    expect(res.body.id).toMatch(/^s_/)
    expect(res.body.status).toBe("hypothesis")
    expect(res.body.agent_address).toBe(agent.agentAddress)
    expect(res.body.direction).toBe("bull")
    expect(res.body.consecutive_losses).toBe(0)
  })

  it("strategy appears in GET list after creation", async () => {
    const res = await request(app)
      .get(strategiesUrl(agent.agentAddress))
      .set(auth(agentToken))
    expect(res.status).toBe(200)
    expect(res.body.strategies.length).toBeGreaterThanOrEqual(1)
    expect(res.body.strategies[0]).toHaveProperty("id")
    expect(res.body.strategies[0]).toHaveProperty("status")
  })

  it("filters strategies by status query param", async () => {
    const res = await request(app)
      .get(`${strategiesUrl(agent.agentAddress)}?status=active`)
      .set(auth(agentToken))
    expect(res.status).toBe(200)
    // No active strategies yet — all hypothesis
    expect(res.body.strategies.every(s => s.status === "active")).toBe(true)
  })
})

// ─── PATCH /api/agents/:address/strategies/:id/status ────────────────────────

describe("PATCH /api/agents/:address/strategies/:id/status", () => {
  let strategyId

  beforeAll(async () => {
    const res = await request(app)
      .post(strategiesUrl(agent.agentAddress))
      .set(auth(agentToken))
      .send({ conditions: validConditions, direction: "bear", timeframe: "4h", coin: "ETH" })
    strategyId = res.body.id
  })

  it("returns 401 without auth", async () => {
    const res = await request(app)
      .patch(`${strategyUrl(agent.agentAddress, strategyId)}/status`)
      .send({ status: "candidate" })
    expect(res.status).toBe(401)
  })

  it("returns 403 for another agent", async () => {
    const res = await request(app)
      .patch(`${strategyUrl(agent.agentAddress, strategyId)}/status`)
      .set(auth(otherToken))
      .send({ status: "candidate" })
    expect(res.status).toBe(403)
  })

  it("returns 400 for invalid status", async () => {
    const res = await request(app)
      .patch(`${strategyUrl(agent.agentAddress, strategyId)}/status`)
      .set(auth(agentToken))
      .send({ status: "promoted" })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Invalid status/)
  })

  it("returns 404 for unknown strategy id", async () => {
    const res = await request(app)
      .patch(`${strategyUrl(agent.agentAddress, "s_notexist")}/status`)
      .set(auth(agentToken))
      .send({ status: "candidate" })
    expect(res.status).toBe(404)
  })

  it("promotes strategy to candidate", async () => {
    const res = await request(app)
      .patch(`${strategyUrl(agent.agentAddress, strategyId)}/status`)
      .set(auth(agentToken))
      .send({ status: "candidate" })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.status).toBe("candidate")
    expect(res.body.id).toBe(strategyId)
  })

  it("promotes strategy to active", async () => {
    const res = await request(app)
      .patch(`${strategyUrl(agent.agentAddress, strategyId)}/status`)
      .set(auth(agentToken))
      .send({ status: "active" })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe("active")
  })

  it("suspends a strategy", async () => {
    const res = await request(app)
      .patch(`${strategyUrl(agent.agentAddress, strategyId)}/status`)
      .set(auth(agentToken))
      .send({ status: "suspended" })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe("suspended")
  })
})

// ─── POST /api/agents/:address/strategies/:id/evaluate ───────────────────────

describe("POST /api/agents/:address/strategies/:id/evaluate", () => {
  let strategyId

  beforeAll(async () => {
    // Create strategy to evaluate
    const res = await request(app)
      .post(strategiesUrl(agent.agentAddress))
      .set(auth(agentToken))
      .send({ conditions: validConditions, direction: "bull", timeframe: "1h", coin: "BTC" })
    strategyId = res.body.id
  })

  it("returns 401 without auth", async () => {
    const res = await request(app)
      .post(`${strategyUrl(agent.agentAddress, strategyId)}/evaluate`)
    expect(res.status).toBe(401)
  })

  it("returns 403 for another agent", async () => {
    const res = await request(app)
      .post(`${strategyUrl(agent.agentAddress, strategyId)}/evaluate`)
      .set(auth(otherToken))
    expect(res.status).toBe(403)
  })

  it("returns 404 for unknown strategy", async () => {
    const res = await request(app)
      .post(`${strategyUrl(agent.agentAddress, "s_notexist")}/evaluate`)
      .set(auth(agentToken))
    expect(res.status).toBe(404)
  })

  it("rejects holdout access on hypothesis-status strategy", async () => {
    const res = await request(app)
      .post(`${strategyUrl(agent.agentAddress, strategyId)}/evaluate`)
      .set(auth(agentToken))
      .send({ useHoldout: true })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/dev_validated/)
  })

  it("evaluates strategy on dev set (empty predictions — agent has no predictions)", async () => {
    const res = await request(app)
      .post(`${strategyUrl(agent.agentAddress, strategyId)}/evaluate`)
      .set(auth(agentToken))
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("strategyId", strategyId)
    expect(res.body).toHaveProperty("stats")
    expect(res.body).toHaveProperty("walkForward")
    expect(res.body).toHaveProperty("promotionGate")
    expect(res.body).toHaveProperty("hasRegimeEdge")
    expect(res.body).toHaveProperty("matchedSignals")
    expect(res.body).toHaveProperty("totalPredictions")
    expect(res.body).toHaveProperty("gate", "devValidated")
    expect(typeof res.body.stats.signals).toBe("number")
  })

  it("evaluate returns promotion gate failures for empty prediction set", async () => {
    const res = await request(app)
      .post(`${strategyUrl(agent.agentAddress, strategyId)}/evaluate`)
      .set(auth(agentToken))
    expect(res.status).toBe(200)
    // No predictions = fails all promotion gates
    expect(res.body.promotionGate.passes).toBe(false)
    expect(Array.isArray(res.body.promotionGate.failures)).toBe(true)
    expect(res.body.promotionGate.failures.length).toBeGreaterThan(0)
  })

  it("persists stats back to strategy after evaluate", async () => {
    await request(app)
      .post(`${strategyUrl(agent.agentAddress, strategyId)}/evaluate`)
      .set(auth(agentToken))

    const listRes = await request(app)
      .get(strategiesUrl(agent.agentAddress))
      .set(auth(agentToken))

    const s = listRes.body.strategies.find(s => s.id === strategyId)
    expect(s).toBeDefined()
    // dev_stats should now be populated (even if signals = 0)
    expect(s.dev_stats).not.toBeNull()
  })
})

// ─── GET /api/agents/:address/strategies/:id/coin-profiles ───────────────────

describe("GET /api/agents/:address/strategies/:id/coin-profiles", () => {
  let strategyId

  beforeAll(async () => {
    const res = await request(app)
      .post(strategiesUrl(agent.agentAddress))
      .set(auth(agentToken))
      .send({ conditions: validConditions, direction: "bull", timeframe: "1h" })
    strategyId = res.body.id
  })

  it("returns 401 without auth", async () => {
    const res = await request(app).get(`${strategyUrl(agent.agentAddress, strategyId)}/coin-profiles`)
    expect(res.status).toBe(401)
  })

  it("returns empty profiles for new agent", async () => {
    const res = await request(app)
      .get(`${strategyUrl(agent.agentAddress, strategyId)}/coin-profiles`)
      .set(auth(agentToken))
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("profiles")
    expect(res.body).toHaveProperty("suppressedCoins")
    expect(Array.isArray(res.body.profiles)).toBe(true)
    expect(Array.isArray(res.body.suppressedCoins)).toBe(true)
  })
})

// ─── Multiple strategies and status filter ────────────────────────────────────

describe("Strategy list and status filtering", () => {
  let filterAgent, filterToken, stratA, stratB

  beforeAll(async () => {
    const user = await createTestUser()
    filterAgent = await createTestAgent(user.address, "FilterBot")
    filterToken = (await createTestUser(filterAgent.agentAddress)).token
    createdAddresses.push(user.address, filterAgent.agentAddress)

    const resA = await request(app)
      .post(strategiesUrl(filterAgent.agentAddress))
      .set(auth(filterToken))
      .send({ conditions: validConditions, direction: "bull", timeframe: "1h", coin: "BTC" })
    stratA = resA.body.id

    const resB = await request(app)
      .post(strategiesUrl(filterAgent.agentAddress))
      .set(auth(filterToken))
      .send({ conditions: [{ path: "rsi", operator: ">", value: 70 }], direction: "bear", timeframe: "4h", coin: "ETH" })
    stratB = resB.body.id

    // Promote stratA to active
    await request(app)
      .patch(`${strategyUrl(filterAgent.agentAddress, stratA)}/status`)
      .set(auth(filterToken))
      .send({ status: "active" })
  })

  it("returns all strategies without filter", async () => {
    const res = await request(app)
      .get(strategiesUrl(filterAgent.agentAddress))
      .set(auth(filterToken))
    expect(res.status).toBe(200)
    expect(res.body.strategies.length).toBeGreaterThanOrEqual(2)
  })

  it("returns only active strategies when filtered by status=active", async () => {
    const res = await request(app)
      .get(`${strategiesUrl(filterAgent.agentAddress)}?status=active`)
      .set(auth(filterToken))
    expect(res.status).toBe(200)
    expect(res.body.strategies.length).toBeGreaterThanOrEqual(1)
    expect(res.body.strategies.every(s => s.status === "active")).toBe(true)
    expect(res.body.strategies.some(s => s.id === stratA)).toBe(true)
  })

  it("returns only hypothesis strategies when filtered by status=hypothesis", async () => {
    const res = await request(app)
      .get(`${strategiesUrl(filterAgent.agentAddress)}?status=hypothesis`)
      .set(auth(filterToken))
    expect(res.status).toBe(200)
    expect(res.body.strategies.every(s => s.status === "hypothesis")).toBe(true)
    expect(res.body.strategies.some(s => s.id === stratB)).toBe(true)
  })
})
