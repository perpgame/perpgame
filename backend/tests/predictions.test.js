import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import { randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
import { getDb } from "../db/index.js"
import { ensureDb, createTestApp, createTestUser, createTestAgent } from "./setup.js"

const app = createTestApp()
let user, agent1, agent2, agent3

beforeAll(async () => {
  await ensureDb()
  user = await createTestUser()
  agent1 = await createTestAgent(user.address, "PredictorBot")
  agent2 = await createTestAgent(user.address, "OtherBot")
  agent3 = await createTestAgent(user.address, "ThirdBot")

  // Create some prediction posts directly in DB with known outcomes
  const db = getDb()
  const now = new Date()
  const past = new Date(now.getTime() - 86400000) // 24h ago

  // Correct BTC bull prediction
  await db.execute(sql`
    INSERT INTO posts (id, author_address, content, tags, direction, timeframe,
                       prediction_coin, prediction_price_at_call, prediction_price_at_expiry,
                       prediction_expires_at, prediction_scored, prediction_outcome, created_at)
    VALUES (${randomUUID()}, ${agent1.agentAddress}, ${"BTC going up"}, ${JSON.stringify(["BTC"])}::jsonb,
            ${"bull"}, ${"24h"}, ${"BTC"}, ${65000}, ${68000},
            ${past.toISOString()}::TIMESTAMPTZ, TRUE, ${"correct"}, ${past.toISOString()}::TIMESTAMPTZ)
  `)

  // Wrong ETH bear prediction
  await db.execute(sql`
    INSERT INTO posts (id, author_address, content, tags, direction, timeframe,
                       prediction_coin, prediction_price_at_call, prediction_price_at_expiry,
                       prediction_expires_at, prediction_scored, prediction_outcome, created_at)
    VALUES (${randomUUID()}, ${agent1.agentAddress}, ${"ETH dumping"}, ${JSON.stringify(["ETH"])}::jsonb,
            ${"bear"}, ${"24h"}, ${"ETH"}, ${3500}, ${3800},
            ${past.toISOString()}::TIMESTAMPTZ, TRUE, ${"wrong"}, ${past.toISOString()}::TIMESTAMPTZ)
  `)

  // Correct BTC bull prediction (second)
  await db.execute(sql`
    INSERT INTO posts (id, author_address, content, tags, direction, timeframe,
                       prediction_coin, prediction_price_at_call, prediction_price_at_expiry,
                       prediction_expires_at, prediction_scored, prediction_outcome, created_at)
    VALUES (${randomUUID()}, ${agent1.agentAddress}, ${"BTC breakout"}, ${JSON.stringify(["BTC"])}::jsonb,
            ${"bull"}, ${"7d"}, ${"BTC"}, ${64000}, ${72000},
            ${past.toISOString()}::TIMESTAMPTZ, TRUE, ${"correct"}, ${past.toISOString()}::TIMESTAMPTZ)
  `)

  // Pending prediction (not yet scored)
  await db.execute(sql`
    INSERT INTO posts (id, author_address, content, tags, direction, timeframe,
                       prediction_coin, prediction_price_at_call,
                       prediction_expires_at, prediction_scored, created_at)
    VALUES (${randomUUID()}, ${agent1.agentAddress}, ${"SOL moon"}, ${JSON.stringify(["SOL"])}::jsonb,
            ${"bull"}, ${"7d"}, ${"SOL"}, ${180},
            ${new Date(now.getTime() + 86400000).toISOString()}::TIMESTAMPTZ, FALSE, ${now.toISOString()}::TIMESTAMPTZ)
  `)

  // Agent2: 3 correct BTC predictions (for agreement + predictable coins tests)
  for (let i = 0; i < 3; i++) {
    await db.execute(sql`
      INSERT INTO posts (id, author_address, content, tags, direction, timeframe,
                         prediction_coin, prediction_price_at_call, prediction_price_at_expiry,
                         prediction_expires_at, prediction_scored, prediction_outcome, created_at)
      VALUES (${randomUUID()}, ${agent2.agentAddress}, ${"BTC bull " + i}, ${JSON.stringify(["BTC"])}::jsonb,
              ${"bull"}, ${"24h"}, ${"BTC"}, ${60000 + i * 1000}, ${63000 + i * 1000},
              ${past.toISOString()}::TIMESTAMPTZ, TRUE, ${"correct"}, ${past.toISOString()}::TIMESTAMPTZ)
    `)
  }

  // Agent3: recent bull BTC prediction (for agreement)
  await db.execute(sql`
    INSERT INTO posts (id, author_address, content, tags, direction, timeframe,
                       prediction_coin, prediction_price_at_call,
                       prediction_expires_at, prediction_scored, created_at)
    VALUES (${randomUUID()}, ${agent3.agentAddress}, ${"BTC up soon"}, ${JSON.stringify(["BTC"])}::jsonb,
            ${"bull"}, ${"24h"}, ${"BTC"}, ${70000},
            ${new Date(now.getTime() + 86400000).toISOString()}::TIMESTAMPTZ, FALSE, ${now.toISOString()}::TIMESTAMPTZ)
  `)
})

describe("GET /api/predictions", () => {
  it("returns predictions for an author", async () => {
    const res = await request(app)
      .get(`/api/predictions?author=${agent1.agentAddress}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBe(4)
    expect(res.body[0]).toHaveProperty("coin")
    expect(res.body[0]).toHaveProperty("direction")
    expect(res.body[0]).toHaveProperty("priceAtCall")
    expect(res.body[0]).toHaveProperty("outcome")
    expect(res.body[0]).toHaveProperty("authorAddress")
    expect(res.body[0]).toHaveProperty("authorUsername")
  })

  it("returns all predictions without author filter", async () => {
    const res = await request(app).get("/api/predictions")

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    // Should include predictions from all agents
    expect(res.body.length).toBeGreaterThanOrEqual(7)
  })

  it("filters by coin", async () => {
    const res = await request(app)
      .get(`/api/predictions?coin=BTC&author=${agent1.agentAddress}`)

    expect(res.status).toBe(200)
    for (const p of res.body) {
      expect(p.coin).toBe("BTC")
    }
    expect(res.body.length).toBe(2)
  })

  it("filters by outcome", async () => {
    const res = await request(app)
      .get(`/api/predictions?outcome=correct&author=${agent1.agentAddress}`)

    expect(res.status).toBe(200)
    for (const p of res.body) {
      expect(p.outcome).toBe("correct")
    }
    expect(res.body.length).toBe(2)
  })

  it("respects limit", async () => {
    const res = await request(app)
      .get(`/api/predictions?limit=2&author=${agent1.agentAddress}`)

    expect(res.status).toBe(200)
    expect(res.body.length).toBe(2)
  })

  it("returns predictions for another agent", async () => {
    const res = await request(app)
      .get(`/api/predictions?author=${agent2.agentAddress}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    // agent2 has 3 BTC predictions from seed data
    expect(res.body.length).toBe(3)
  })

  it("no auth required", async () => {
    const res = await request(app).get("/api/predictions")
    expect(res.status).toBe(200)
  })

  it("rejects invalid status", async () => {
    const res = await request(app).get("/api/predictions?status=invalid")
    expect(res.status).toBe(400)
  })

  it("rejects invalid outcome", async () => {
    const res = await request(app).get("/api/predictions?outcome=invalid")
    expect(res.status).toBe(400)
  })
})

describe("GET /api/agents/:address/accuracy", () => {
  it("returns accuracy breakdown", async () => {
    const res = await request(app)
      .get(`/api/agents/${agent1.agentAddress}/accuracy`)
      .set("X-Agent-Key", agent2.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.address).toBe(agent1.agentAddress)

    // Overall: 2 correct, 1 wrong out of 3 scored
    expect(res.body.overall.correct).toBe(2)
    expect(res.body.overall.wrong).toBe(1)
    expect(res.body.overall.accuracy).toBeCloseTo(66.7, 0)

    // By coin
    expect(res.body.byCoin.length).toBeGreaterThanOrEqual(2)
    const btc = res.body.byCoin.find(c => c.coin === "BTC")
    expect(btc.correct).toBe(2)
    expect(btc.wrong).toBe(0)
    expect(btc.accuracy).toBe(100)

    const eth = res.body.byCoin.find(c => c.coin === "ETH")
    expect(eth.correct).toBe(0)
    expect(eth.wrong).toBe(1)
    expect(eth.accuracy).toBe(0)

    // By timeframe
    expect(res.body.byTimeframe.length).toBeGreaterThanOrEqual(1)

    // By direction
    expect(res.body.byDirection.length).toBeGreaterThanOrEqual(1)
    const bull = res.body.byDirection.find(d => d.direction === "bull")
    expect(bull.correct).toBe(2)

    // Streak
    expect(res.body.streak).toHaveProperty("count")
    expect(res.body.streak).toHaveProperty("type")
  })

  it("returns 404 for non-existent agent", async () => {
    const res = await request(app)
      .get("/api/agents/0x0000000000000000000000000000000000000000/accuracy")
      .set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(404)
  })

  it("returns 401 without auth", async () => {
    const res = await request(app)
      .get(`/api/agents/${agent1.agentAddress}/accuracy`)

    expect(res.status).toBe(401)
  })

  it("agent can check own accuracy", async () => {
    const res = await request(app)
      .get(`/api/agents/${agent1.agentAddress}/accuracy`)
      .set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.overall.correct).toBe(2)
  })
})

describe("GET /api/agents/leaderboard?sort=predictions", () => {
  it("returns prediction leaderboard", async () => {
    const res = await request(app)
      .get("/api/agents/leaderboard?sort=predictions&min=1")

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThanOrEqual(1)

    const entry = res.body[0]
    expect(entry).toHaveProperty("rank")
    expect(entry).toHaveProperty("address")
    expect(entry).toHaveProperty("name")
    expect(entry).toHaveProperty("correct")
    expect(entry).toHaveProperty("wrong")
    expect(entry).toHaveProperty("total")
    expect(entry).toHaveProperty("accuracy")
    expect(entry.rank).toBe(1)
  })

  it("filters by coin", async () => {
    const res = await request(app)
      .get("/api/agents/leaderboard?sort=predictions&coin=BTC&min=1")

    expect(res.status).toBe(200)
    // agent1 has 2 correct BTC predictions
    const agent = res.body.find(e => e.address === agent1.agentAddress)
    if (agent) {
      expect(agent.correct).toBe(2)
      expect(agent.accuracy).toBe(100)
    }
  })

  it("filters by timeframe", async () => {
    const res = await request(app)
      .get("/api/agents/leaderboard?sort=predictions&timeframe=24h&min=1")

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it("respects min predictions threshold", async () => {
    const res = await request(app)
      .get("/api/agents/leaderboard?sort=predictions&min=100")

    expect(res.status).toBe(200)
    // No agent has 100 predictions
    expect(res.body.length).toBe(0)
  })

  it("no auth required", async () => {
    const res = await request(app)
      .get("/api/agents/leaderboard?sort=predictions&min=1")

    expect(res.status).toBe(200)
  })
})

// ─── Network Stats ──────────────────────────────────────────────────────────

describe("GET /api/agents/network-stats", () => {
  it("returns all-time stats", async () => {
    const res = await request(app).get("/api/agents/network-stats").set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("totalPredictions")
    expect(res.body).toHaveProperty("totalCorrect")
    expect(res.body).toHaveProperty("totalWrong")
    expect(res.body).toHaveProperty("pendingPredictions")
    expect(res.body).toHaveProperty("networkAccuracy")
    expect(res.body).toHaveProperty("totalAgents")
    expect(res.body).toHaveProperty("activeToday")
    expect(res.body).toHaveProperty("totalLikes")
    expect(res.body.totalPredictions).toBeGreaterThanOrEqual(3)
    expect(res.body.totalCorrect).toBeGreaterThanOrEqual(2)
    expect(typeof res.body.networkAccuracy).toBe("number")
  })

  it("returns 24h filtered stats", async () => {
    const res = await request(app).get("/api/agents/network-stats?period=24h").set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("totalPredictions")
    expect(res.body).toHaveProperty("networkAccuracy")
    // 24h stats should be <= all-time
    const allRes = await request(app).get("/api/agents/network-stats").set("X-Agent-Key", agent1.apiKey)
    expect(res.body.totalPredictions).toBeLessThanOrEqual(allRes.body.totalPredictions)
  })

  it("is public (no auth required)", async () => {
    const res = await request(app).get("/api/agents/network-stats")
    expect(res.status).toBe(200)
  })
})

// ─── Prediction Feed ────────────────────────────────────────────────────────

describe("GET /api/agents/prediction-feed", () => {
  it("returns recent scored predictions", async () => {
    const res = await request(app).get("/api/agents/prediction-feed").set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("recentScored")
    expect(Array.isArray(res.body.recentScored)).toBe(true)

    if (res.body.recentScored.length > 0) {
      const p = res.body.recentScored[0]
      expect(p).toHaveProperty("agentAddress")
      expect(p).toHaveProperty("agentName")
      expect(p).toHaveProperty("coin")
      expect(p).toHaveProperty("direction")
      expect(p).toHaveProperty("outcome")
      expect(p).toHaveProperty("priceDelta")
    }
  })

  it("returns velocity data", async () => {
    const res = await request(app).get("/api/agents/prediction-feed").set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("velocity")
    expect(Array.isArray(res.body.velocity)).toBe(true)

    if (res.body.velocity.length > 0) {
      expect(res.body.velocity[0]).toHaveProperty("date")
      expect(res.body.velocity[0]).toHaveProperty("count")
      expect(typeof res.body.velocity[0].count).toBe("number")
    }
  })

  it("returns win streaks", async () => {
    const res = await request(app).get("/api/agents/prediction-feed").set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("winStreaks")
    expect(Array.isArray(res.body.winStreaks)).toBe(true)

    if (res.body.winStreaks.length > 0) {
      const s = res.body.winStreaks[0]
      expect(s).toHaveProperty("agentAddress")
      expect(s).toHaveProperty("agentName")
      expect(s).toHaveProperty("streak")
      expect(s.streak).toBeGreaterThanOrEqual(2)
    }
  })

  it("is publicly accessible", async () => {
    const res = await request(app).get("/api/agents/prediction-feed")
    expect(res.status).toBe(200)
  })
})

// ─── Prediction Overview ────────────────────────────────────────────────────

describe("GET /api/agents/prediction-overview", () => {
  it("returns accuracy trend", async () => {
    const res = await request(app).get("/api/agents/prediction-overview").set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("accuracyTrend")
    expect(Array.isArray(res.body.accuracyTrend)).toBe(true)

    if (res.body.accuracyTrend.length > 0) {
      const d = res.body.accuracyTrend[0]
      expect(d).toHaveProperty("date")
      expect(d).toHaveProperty("accuracy")
      expect(d).toHaveProperty("correct")
      expect(d).toHaveProperty("total")
      expect(typeof d.accuracy).toBe("number")
    }
  })

  it("returns coverage data", async () => {
    const res = await request(app).get("/api/agents/prediction-overview").set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("coverage")
    expect(res.body.coverage).toHaveProperty("activeCoins")
    expect(res.body.coverage).toHaveProperty("totalCoins")
    expect(typeof res.body.coverage.activeCoins).toBe("number")
  })

  it("returns predictable coins", async () => {
    const res = await request(app).get("/api/agents/prediction-overview").set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("predictableCoins")
    expect(Array.isArray(res.body.predictableCoins)).toBe(true)

    if (res.body.predictableCoins.length > 0) {
      const c = res.body.predictableCoins[0]
      expect(c).toHaveProperty("coin")
      expect(c).toHaveProperty("accuracy")
      expect(c).toHaveProperty("correct")
      expect(c).toHaveProperty("total")
      expect(c).toHaveProperty("agents")
      expect(typeof c.accuracy).toBe("number")
    }
  })

  it("is publicly accessible", async () => {
    const res = await request(app).get("/api/agents/prediction-overview")
    expect(res.status).toBe(200)
  })
})

// ─── Agreement Scores ───────────────────────────────────────────────────────

describe("GET /api/agents/agreement", () => {
  it("returns agreement scores per coin", async () => {
    const res = await request(app).get("/api/agents/agreement").set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(200)
    expect(typeof res.body).toBe("object")

    const coins = Object.keys(res.body)
    if (coins.length > 0) {
      const data = res.body[coins[0]]
      expect(data).toHaveProperty("bullPct")
      expect(data).toHaveProperty("bearPct")
      expect(data).toHaveProperty("bullCount")
      expect(data).toHaveProperty("bearCount")
      expect(data).toHaveProperty("totalAgents")
      expect(data.bullPct + data.bearPct).toBe(100)
    }
  })

  it("only includes coins with 2+ predictions", async () => {
    const res = await request(app).get("/api/agents/agreement").set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(200)
    for (const [, data] of Object.entries(res.body)) {
      expect(data.totalAgents).toBeGreaterThanOrEqual(2)
    }
  })

  it("is public (no auth required)", async () => {
    const res = await request(app).get("/api/agents/agreement")
    expect(res.status).toBe(200)
  })
})

// ─── Creating prediction posts via API ──────────────────────────────────────

describe("POST /api/posts (predictions)", () => {
  it("creates a prediction post with direction and timeframe", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent3.apiKey)
      .send({
        content: "AVAX breaking out above resistance $AVAX",
        tags: ["AVAX"],
        direction: "bull",
        timeframe: "24h",
      })

    expect(res.status).toBe(201)
    expect(res.body.direction).toBe("bull")
    expect(res.body.timeframe).toBe("24h")
  })

  it("rejects invalid direction", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent3.apiKey)
      .send({
        content: "test invalid direction $ETH",
        tags: ["ETH"],
        direction: "sideways",
        timeframe: "24h",
      })

    expect(res.status).toBe(400)
  })

  it("rejects invalid timeframe", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent3.apiKey)
      .send({
        content: "test invalid timeframe $ETH",
        tags: ["ETH"],
        direction: "bull",
        timeframe: "2h",
      })

    expect(res.status).toBe(400)
  })

  it("prediction fields are included in post response", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent3.apiKey)
      .send({
        content: "SOL looking strong $SOL",
        tags: ["SOL"],
        direction: "bull",
        timeframe: "4h",
      })

    expect(res.status).toBe(201)
    expect(res.body.direction).toBe("bull")
    expect(res.body.timeframe).toBe("4h")
  })
})
