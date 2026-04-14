import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import { randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
import { getDb } from "../db/index.js"
import { ensureDb, createTestApp, createTestUser } from "./setup.js"

const app = createTestApp()
let user

// Fixed timestamps relative to "now" for period filter tests
const now = new Date()
const t = (offsetMs) => new Date(now.getTime() + offsetMs).toISOString()
const past12h  = t(-12  * 3600_000)
const past36h  = t(-36  * 3600_000)
const past8d   = t(-8   * 24 * 3600_000)
const past35d  = t(-35  * 24 * 3600_000)
const future1d = t(24   * 3600_000)

async function insertPrediction(db, addr, overrides = {}) {
  const defaults = {
    id: randomUUID(),
    author: addr,
    content: "prediction",
    coin: "BTC",
    direction: "bull",
    timeframe: "24h",
    priceAtCall: 65000,
    priceAtExpiry: 68000,
    expiresAt: past36h,
    scored: true,
    outcome: "correct",
    createdAt: past36h,
  }
  const p = { ...defaults, ...overrides }
  await db.execute(sql`
    INSERT INTO posts (id, author_address, content, tags, direction, timeframe,
                       prediction_coin, prediction_price_at_call, prediction_price_at_expiry,
                       prediction_expires_at, prediction_scored, prediction_outcome, created_at)
    VALUES (
      ${p.id}, ${p.author}, ${p.content}, ${JSON.stringify([p.coin])}::jsonb,
      ${p.direction}, ${p.timeframe}, ${p.coin},
      ${p.priceAtCall}, ${p.priceAtExpiry ?? null},
      ${p.expiresAt}::TIMESTAMPTZ, ${p.scored}, ${p.outcome ?? null},
      ${p.createdAt}::TIMESTAMPTZ
    )
  `)
  return p.id
}

beforeAll(async () => {
  await ensureDb()
  user = await createTestUser()
  const db = getDb()
  const addr = user.address

  // ── Scored predictions ────────────────────────────────────────────────────

  // BTC bull correct  (36h ago, falls within 7d + 30d + all)
  await insertPrediction(db, addr, { coin: "BTC", direction: "bull", outcome: "correct", expiresAt: past36h, createdAt: past36h })
  // BTC bull correct  (36h ago)
  await insertPrediction(db, addr, { coin: "BTC", direction: "bull", outcome: "correct", expiresAt: past36h, createdAt: past36h })
  // BTC bull wrong    (36h ago)
  await insertPrediction(db, addr, { coin: "BTC", direction: "bull", outcome: "wrong", expiresAt: past36h, createdAt: past36h })

  // ETH bear correct  (8d ago — outside 7d but inside 30d + all)
  await insertPrediction(db, addr, { coin: "ETH", direction: "bear", outcome: "correct", expiresAt: past8d, createdAt: past8d })
  // ETH bear wrong    (8d ago)
  await insertPrediction(db, addr, { coin: "ETH", direction: "bear", outcome: "wrong", expiresAt: past8d, createdAt: past8d })

  // SOL bull correct  (35d ago — only in all-time)
  await insertPrediction(db, addr, { coin: "SOL", direction: "bull", outcome: "correct", expiresAt: past35d, createdAt: past35d })
  // SOL bull wrong    (35d ago)
  await insertPrediction(db, addr, { coin: "SOL", direction: "bull", outcome: "wrong", expiresAt: past35d, createdAt: past35d })

  // Neutral — should not affect accuracy numerator/denominator
  await insertPrediction(db, addr, { coin: "BTC", direction: "bull", outcome: "neutral", expiresAt: past36h, createdAt: past36h })

  // Unresolvable — should not affect accuracy
  await insertPrediction(db, addr, { coin: "BTC", direction: "bull", outcome: "unresolvable", expiresAt: past36h, createdAt: past36h })

  // Pending (future expiry, not yet scored)
  await insertPrediction(db, addr, {
    coin: "BTC", direction: "bull", outcome: null,
    priceAtExpiry: null, expiresAt: future1d, scored: false, createdAt: past12h,
  })
})

// ─── Response shape ──────────────────────────────────────────────────────────

describe("GET /api/users/:address/prediction-stats — shape", () => {
  it("returns all expected fields", async () => {
    const res = await request(app).get(`/api/users/${user.address}/prediction-stats`)
    expect(res.status).toBe(200)

    expect(res.body).toMatchObject({
      correct: expect.any(Number),
      wrong: expect.any(Number),
      total: expect.any(Number),
      pending: expect.any(Number),
      currentStreak: expect.any(Number),
      recentOutcomes: expect.any(Array),
    })
    // accuracy can be null if no scored predictions
    expect(res.body).toHaveProperty("accuracy")
    expect(res.body).toHaveProperty("accuracy7d")
    expect(res.body).toHaveProperty("accuracy30d")
    expect(res.body).toHaveProperty("bestCoin")
    expect(res.body).toHaveProperty("longAccuracy")
    expect(res.body).toHaveProperty("shortAccuracy")
    expect(res.body).toHaveProperty("bestTimeframe")
    expect(res.body).toHaveProperty("worstTimeframe")
  })

  it("recentOutcomes includes coin and direction", async () => {
    const res = await request(app).get(`/api/users/${user.address}/prediction-stats`)
    expect(res.status).toBe(200)
    expect(res.body.recentOutcomes.length).toBeGreaterThan(0)
    const o = res.body.recentOutcomes[0]
    expect(o).toHaveProperty("outcome")
    expect(o).toHaveProperty("ts")
    expect(o).toHaveProperty("coin")
    expect(o).toHaveProperty("direction")
  })

  it("returns 200 for unknown address with zero stats", async () => {
    const res = await request(app).get("/api/users/0x0000000000000000000000000000000000009999/prediction-stats")
    expect(res.status).toBe(200)
    expect(res.body.correct).toBe(0)
    expect(res.body.wrong).toBe(0)
    expect(res.body.total).toBe(0)
    expect(res.body.accuracy).toBeNull()
  })
})

// ─── Accuracy calculation ────────────────────────────────────────────────────

describe("GET /api/users/:address/prediction-stats — accuracy", () => {
  it("all-time: counts correct and wrong (excludes neutral and unresolvable)", async () => {
    const res = await request(app).get(`/api/users/${user.address}/prediction-stats?period=all`)
    expect(res.status).toBe(200)
    // BTC: 2 correct + 1 wrong; ETH: 1 correct + 1 wrong; SOL: 1 correct + 1 wrong = 4 correct, 3 wrong
    expect(res.body.correct).toBe(4)
    expect(res.body.wrong).toBe(3)
    expect(res.body.total).toBe(7) // correct + wrong only (neutral/unresolvable excluded)
  })

  it("all-time: accuracy = correct / (correct + wrong) * 100", async () => {
    const res = await request(app).get(`/api/users/${user.address}/prediction-stats?period=all`)
    // 4 / 7 ≈ 57.1
    expect(res.body.accuracy).toBeCloseTo(57.1, 0)
  })

  it("pending count is correct", async () => {
    const res = await request(app).get(`/api/users/${user.address}/prediction-stats`)
    expect(res.body.pending).toBe(1)
  })
})

// ─── Period filtering ────────────────────────────────────────────────────────

describe("GET /api/users/:address/prediction-stats — period filter", () => {
  it("24h: only includes predictions from last 24 hours", async () => {
    const res = await request(app).get(`/api/users/${user.address}/prediction-stats?period=24h`)
    expect(res.status).toBe(200)
    // Only BTC 36h-ago predictions are OUTSIDE 24h window — expect 0 scored
    expect(res.body.correct).toBe(0)
    expect(res.body.wrong).toBe(0)
    expect(res.body.accuracy).toBeNull()
  })

  it("7d: includes predictions from last 7 days", async () => {
    const res = await request(app).get(`/api/users/${user.address}/prediction-stats?period=7d`)
    expect(res.status).toBe(200)
    // BTC (36h ago): 2 correct + 1 wrong — within 7d
    // ETH (8d ago): outside 7d
    expect(res.body.correct).toBe(2)
    expect(res.body.wrong).toBe(1)
  })

  it("30d: includes predictions from last 30 days", async () => {
    const res = await request(app).get(`/api/users/${user.address}/prediction-stats?period=30d`)
    expect(res.status).toBe(200)
    // BTC (36h) + ETH (8d) = 3 correct, 2 wrong. SOL (35d) outside 30d
    expect(res.body.correct).toBe(3)
    expect(res.body.wrong).toBe(2)
  })

  it("unknown period falls back to all-time", async () => {
    const res = await request(app).get(`/api/users/${user.address}/prediction-stats?period=invalid`)
    const all = await request(app).get(`/api/users/${user.address}/prediction-stats?period=all`)
    expect(res.status).toBe(200)
    expect(res.body.correct).toBe(all.body.correct)
    expect(res.body.total).toBe(all.body.total)
  })
})

// ─── Streak ──────────────────────────────────────────────────────────────────

describe("GET /api/users/:address/prediction-stats — streak", () => {
  it("streak skips neutral/unresolvable and only breaks on wrong", async () => {
    const db = getDb()
    const streakUser = await createTestUser()
    const addr = streakUser.address
    const past = t(-1 * 3600_000)

    // Insert: correct, neutral, correct, wrong (newest first — DESC order from DB)
    await insertPrediction(db, addr, { outcome: "wrong",       expiresAt: t(-4 * 3600_000), createdAt: t(-4 * 3600_000) })
    await insertPrediction(db, addr, { outcome: "correct",     expiresAt: t(-3 * 3600_000), createdAt: t(-3 * 3600_000) })
    await insertPrediction(db, addr, { outcome: "neutral",     expiresAt: t(-2 * 3600_000), createdAt: t(-2 * 3600_000) })
    await insertPrediction(db, addr, { outcome: "correct",     expiresAt: past,             createdAt: past })

    const res = await request(app).get(`/api/users/${addr}/prediction-stats`)
    expect(res.status).toBe(200)
    // Most recent: correct → streak 1. neutral → skip. correct → streak 2. wrong → stop.
    expect(res.body.currentStreak).toBe(2)
  })

  it("streak is 0 when most recent scored outcome is wrong", async () => {
    const db = getDb()
    const streakUser = await createTestUser()
    await insertPrediction(db, streakUser.address, { outcome: "correct", expiresAt: t(-2 * 3600_000), createdAt: t(-2 * 3600_000) })
    await insertPrediction(db, streakUser.address, { outcome: "wrong",   expiresAt: t(-1 * 3600_000), createdAt: t(-1 * 3600_000) })

    const res = await request(app).get(`/api/users/${streakUser.address}/prediction-stats`)
    expect(res.body.currentStreak).toBe(0)
  })
})

// ─── bestCoin / longAccuracy / shortAccuracy ─────────────────────────────────

describe("GET /api/users/:address/prediction-stats — bestCoin and direction accuracy", () => {
  it("bestCoin requires at least 3 decisive (correct+wrong) predictions", async () => {
    const db = getDb()
    const u = await createTestUser()
    // Only 2 BTC predictions — should not qualify
    await insertPrediction(db, u.address, { coin: "BTC", outcome: "correct" })
    await insertPrediction(db, u.address, { coin: "BTC", outcome: "correct" })

    const res = await request(app).get(`/api/users/${u.address}/prediction-stats`)
    expect(res.body.bestCoin).toBeNull()
  })

  it("bestCoin accuracy excludes neutral/unresolvable from denominator", async () => {
    const db = getDb()
    const u = await createTestUser()
    // 3 correct, 0 wrong, 1 neutral — accuracy should be 100% not 75%
    await insertPrediction(db, u.address, { coin: "BTC", outcome: "correct" })
    await insertPrediction(db, u.address, { coin: "BTC", outcome: "correct" })
    await insertPrediction(db, u.address, { coin: "BTC", outcome: "correct" })
    await insertPrediction(db, u.address, { coin: "BTC", outcome: "neutral" })

    const res = await request(app).get(`/api/users/${u.address}/prediction-stats`)
    expect(res.body.bestCoin?.coin).toBe("BTC")
    expect(res.body.bestCoin?.accuracy).toBe(100)
  })

  it("longAccuracy and shortAccuracy use correct/wrong only", async () => {
    const db = getDb()
    const u = await createTestUser()
    // 2 bull correct, 1 bull neutral → longAccuracy = 100% (not 66%)
    await insertPrediction(db, u.address, { direction: "bull", outcome: "correct" })
    await insertPrediction(db, u.address, { direction: "bull", outcome: "correct" })
    await insertPrediction(db, u.address, { direction: "bull", outcome: "neutral" })
    // 1 bear correct, 1 bear wrong → shortAccuracy = 50%
    await insertPrediction(db, u.address, { direction: "bear", outcome: "correct" })
    await insertPrediction(db, u.address, { direction: "bear", outcome: "wrong"   })

    const res = await request(app).get(`/api/users/${u.address}/prediction-stats`)
    expect(res.body.longAccuracy).toBe(100)
    expect(res.body.shortAccuracy).toBe(50)
  })
})

// ─── recentOutcomes ordering ─────────────────────────────────────────────────

describe("GET /api/users/:address/prediction-stats — recentOutcomes", () => {
  it("recentOutcomes are in chronological order (oldest first)", async () => {
    const res = await request(app).get(`/api/users/${user.address}/prediction-stats`)
    const outcomes = res.body.recentOutcomes
    for (let i = 1; i < outcomes.length; i++) {
      expect(outcomes[i].ts).toBeGreaterThanOrEqual(outcomes[i - 1].ts)
    }
  })

  it("recentOutcomes only contains scored predictions", async () => {
    const res = await request(app).get(`/api/users/${user.address}/prediction-stats`)
    for (const o of res.body.recentOutcomes) {
      expect(o.outcome).not.toBeNull()
    }
  })
})
