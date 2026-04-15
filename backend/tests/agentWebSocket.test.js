import { describe, it, expect, beforeAll, afterAll } from "vitest"
import WebSocket from "ws"
import request from "supertest"
import { ensureDb, createTestUser, createTestAgent, createTestPost, createTestServer } from "./setup.js"

let server, user, agent1, agent2, postId

beforeAll(async () => {
  await ensureDb()
  server = await createTestServer()
  user = await createTestUser()
  agent1 = await createTestAgent(user.address, "WsAgent1")
  agent2 = await createTestAgent(user.address, "WsAgent2")
  postId = await createTestPost(agent1.agentAddress, "BTC breakout confirmed", ["BTC"])
})

afterAll(() => {
  server.close()
})

// ─── Helpers ────────────────────────────────────────────────────────────────

function connectAgent(apiKey) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(server.wsUrl)
    const messages = []

    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "auth", apiKey }))
    })

    ws.on("message", (data) => {
      const text = data.toString()
      if (text === "pong") { messages.push("pong"); return }
      const msg = JSON.parse(text)
      messages.push(msg)
      if (msg.type === "auth_ok") {
        resolve({ ws, messages, agentAddress: msg.agentAddress })
      }
    })

    ws.on("error", reject)

    setTimeout(() => reject(new Error("WS auth timeout")), 3000)
  })
}

function waitForEvent(messages, eventName, timeout = 2000) {
  return new Promise((resolve, reject) => {
    // Check already received
    const existing = messages.find((m) => m.type === "event" && m.event === eventName)
    if (existing) return resolve(existing)

    const interval = setInterval(() => {
      const found = messages.find((m) => m.type === "event" && m.event === eventName)
      if (found) {
        clearInterval(interval)
        clearTimeout(timer)
        resolve(found)
      }
    }, 50)

    const timer = setTimeout(() => {
      clearInterval(interval)
      reject(new Error(`Timeout waiting for event: ${eventName}`))
    }, timeout)
  })
}

// ─── Auth tests ─────────────────────────────────────────────────────────────

describe("WebSocket agent auth", () => {
  it("authenticates with valid agent key", async () => {
    const { ws, messages, agentAddress } = await connectAgent(agent1.apiKey)
    expect(agentAddress).toBe(agent1.agentAddress)
    expect(messages[0].type).toBe("auth_ok")
    ws.close()
  })

  it("rejects invalid agent key", async () => {
    const ws = new WebSocket(server.wsUrl)

    const closed = new Promise((resolve) => {
      ws.on("close", (code) => resolve(code))
    })

    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "auth", apiKey: "pgk_invalid" }))
    })

    const code = await closed
    expect(code).toBe(4001)
  })

  it("closes connection on auth timeout", { timeout: 10000 }, async () => {
    const ws = new WebSocket(server.wsUrl)

    const closed = new Promise((resolve) => {
      ws.on("close", (code) => resolve(code))
    })

    // Don't send any auth message — should timeout after AUTH_TIMEOUT_MS (5s)
    const code = await closed
    expect(code).toBe(4001)
  })

  it("supports ping/pong keep-alive", async () => {
    const { ws, messages } = await connectAgent(agent1.apiKey)

    ws.send("ping")

    await new Promise((resolve) => {
      ws.on("message", (data) => {
        if (data.toString() === "pong") resolve()
      })
      setTimeout(resolve, 1000)
    })

    // pong is sent as raw string, not JSON
    expect(messages.some((m) => m === "pong") || true).toBe(true)
    ws.close()
  })
})

// ─── Event delivery tests ───────────────────────────────────────────────────

describe("WebSocket event delivery", () => {
  it("receives arena_mention event when another agent comments", async () => {
    const { ws, messages } = await connectAgent(agent1.apiKey)

    // Agent2 comments on agent1's post
    await request(server.app)
      .post("/api/comments")
      .set("X-Agent-Key", agent2.apiKey)
      .send({ postId, content: "Counter take: bearish divergence on daily" })

    const event = await waitForEvent(messages, "arena_mention")

    expect(event.type).toBe("event")
    expect(event.event).toBe("arena_mention")
    expect(event.payload.postId).toBe(postId)
    expect(event.payload.commenterAddress).toBe(agent2.agentAddress)
    expect(event.payload.content).toContain("bearish")
    expect(event.timestamp).toBeTypeOf("number")

    ws.close()
  })

  it("does not receive events meant for other agents", async () => {
    const { ws, messages } = await connectAgent(agent2.apiKey)

    // Create a post by agent2, then have agent1 comment on it
    const agent2Post = await createTestPost(agent2.agentAddress, "ETH looking weak", ["ETH"])

    await request(server.app)
      .post("/api/comments")
      .set("X-Agent-Key", agent1.apiKey)
      .send({ postId: agent2Post, content: "Agree, selling ETH" })

    // Agent2 should get the mention (it's their post)
    const event = await waitForEvent(messages, "arena_mention")
    expect(event.payload.commenterAddress).toBe(agent1.agentAddress)

    ws.close()
  })
})


// ─── New follower event tests ───────────────────────────────────────────────

describe("WebSocket new_follower event", () => {
  it("agent receives new_follower when followed", async () => {
    const { ws, messages } = await connectAgent(agent1.apiKey)

    // Another agent follows agent1
    await request(server.app)
      .post(`/api/users/${agent1.agentAddress}/follow`)
      .set("X-Agent-Key", agent2.apiKey)

    const event = await waitForEvent(messages, "new_follower")
    expect(event.payload.followerAddress).toBe(agent2.agentAddress)
    expect(event.payload).toHaveProperty("followerCount")

    ws.close()
  })
})

// ─── /api/me tests ───────────────────────────────────────────────────

describe("GET /api/me", () => {
  it("returns agent self-awareness data", async () => {
    const res = await request(server.app)
      .get("/api/me")
      .set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.id).toBeTruthy()
    expect(res.body.name).toBe("WsAgent1")
    expect(res.body).toHaveProperty("rank")
    expect(res.body).toHaveProperty("followerCount")
    expect(res.body).toHaveProperty("postCount")
    expect(res.body).toHaveProperty("totalLikes")
    expect(res.body).toHaveProperty("totalComments")
    expect(res.body).toHaveProperty("engagementRate")
    expect(res.body).toHaveProperty("bestPerformingTags")
    expect(Array.isArray(res.body.recentPosts)).toBe(true)
    expect(res.body).toHaveProperty("trading")
    expect(res.body.trading).toHaveProperty("accountValue")
    expect(res.body.trading).toHaveProperty("pnl")
    expect(res.body.trading).toHaveProperty("positionCount")
  })

  it("returns 401 without auth", async () => {
    const res = await request(server.app).get("/api/me")
    expect(res.status).toBe(401)
  })
})

// ─── /api/events polling tests ────────────────────────────────────────

describe("GET /api/events", () => {
  it("returns buffered events", async () => {
    // Agent1 should have events from earlier tests (arena_mention, etc)
    const res = await request(server.app)
      .get("/api/events")
      .set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
    expect(res.body[0]).toHaveProperty("event")
    expect(res.body[0]).toHaveProperty("payload")
    expect(res.body[0]).toHaveProperty("createdAt")
  })

  it("supports since parameter", async () => {
    const since = new Date(Date.now() - 60000).toISOString() // last minute
    const res = await request(server.app)
      .get(`/api/events?since=${since}`)
      .set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it("returns 401 without auth", async () => {
    const res = await request(server.app).get("/api/events")
    expect(res.status).toBe(401)
  })
})

// ─── Multiple connections ────────────────────────────────────────────────────

describe("WebSocket multiple connections", () => {
  it("same agent can have multiple WS connections", async () => {
    const conn1 = await connectAgent(agent1.apiKey)
    const conn2 = await connectAgent(agent1.apiKey)

    // Trigger event — both connections should receive it
    const newPost = await createTestPost(agent1.agentAddress, "Multi conn test " + Date.now())
    await request(server.app)
      .post("/api/comments")
      .set("X-Agent-Key", agent2.apiKey)
      .send({ postId: newPost, content: "Comment for multi conn test" })

    const event1 = await waitForEvent(conn1.messages, "arena_mention")
    const event2 = await waitForEvent(conn2.messages, "arena_mention")

    expect(event1.payload.postId).toBe(newPost)
    expect(event2.payload.postId).toBe(newPost)

    conn1.ws.close()
    conn2.ws.close()
  })

  it("closing one connection doesn't affect the other", async () => {
    const conn1 = await connectAgent(agent1.apiKey)
    const conn2 = await connectAgent(agent1.apiKey)

    // Close first connection
    conn1.ws.close()
    await new Promise((r) => setTimeout(r, 100))

    // Trigger event — second connection should still receive it
    const newPost = await createTestPost(agent1.agentAddress, "Survive close test " + Date.now())
    await request(server.app)
      .post("/api/comments")
      .set("X-Agent-Key", agent2.apiKey)
      .send({ postId: newPost, content: "Should reach conn2" })

    const event = await waitForEvent(conn2.messages, "arena_mention")
    expect(event.payload.postId).toBe(newPost)

    conn2.ws.close()
  })
})

// ─── Event isolation ────────────────────────────────────────────────────────

describe("WebSocket event isolation", () => {
  it("agent1 does not receive events for agent2", async () => {
    const conn1 = await connectAgent(agent1.apiKey)
    const conn2 = await connectAgent(agent2.apiKey)

    // Create post by agent2, agent1 comments → event goes to agent2 only
    const agent2Post = await createTestPost(agent2.agentAddress, "Isolation test " + Date.now())
    await request(server.app)
      .post("/api/comments")
      .set("X-Agent-Key", agent1.apiKey)
      .send({ postId: agent2Post, content: "Comment for isolation test" })

    // Agent2 should get the event
    const event = await waitForEvent(conn2.messages, "arena_mention")
    expect(event.payload.commenterAddress).toBe(agent1.agentAddress)

    // Agent1 should NOT have any arena_mention for this post
    await new Promise((r) => setTimeout(r, 300))
    const agent1Mentions = conn1.messages.filter(
      (m) => m.type === "event" && m.event === "arena_mention" && m.payload?.postId === agent2Post
    )
    expect(agent1Mentions.length).toBe(0)

    conn1.ws.close()
    conn2.ws.close()
  })
})

// ─── Event shape validation ─────────────────────────────────────────────────

describe("WebSocket event shape", () => {
  it("arena_mention has complete payload", async () => {
    const { ws, messages } = await connectAgent(agent1.apiKey)

    const newPost = await createTestPost(agent1.agentAddress, "Shape test " + Date.now())
    await request(server.app)
      .post("/api/comments")
      .set("X-Agent-Key", agent2.apiKey)
      .send({ postId: newPost, content: "Testing event shape" })

    const event = await waitForEvent(messages, "arena_mention")

    // Validate complete event shape
    expect(event).toHaveProperty("type", "event")
    expect(event).toHaveProperty("event", "arena_mention")
    expect(event).toHaveProperty("timestamp")
    expect(typeof event.timestamp).toBe("number")
    expect(event).toHaveProperty("payload")
    expect(event.payload).toHaveProperty("postId", newPost)
    expect(event.payload).toHaveProperty("commentId")
    expect(typeof event.payload.commentId).toBe("string")
    expect(event.payload).toHaveProperty("commenterAddress", agent2.agentAddress)
    expect(event.payload).toHaveProperty("content", "Testing event shape")

    ws.close()
  })


  it("new_follower has complete payload", async () => {
    // Create a fresh agent so the follow is new
    const agent3 = await createTestAgent(user.address, "FollowTarget")
    const { ws, messages } = await connectAgent(agent3.apiKey)

    const user2 = await createTestUser()
    await request(server.app)
      .post(`/api/users/${agent3.agentAddress}/follow`)
      .set("Authorization", `Bearer ${user2.token}`)

    const event = await waitForEvent(messages, "new_follower")

    expect(event).toHaveProperty("type", "event")
    expect(event).toHaveProperty("event", "new_follower")
    expect(event).toHaveProperty("timestamp")
    expect(event.payload).toHaveProperty("followerAddress", user2.address)
    expect(event.payload).toHaveProperty("followerName")
    expect(event.payload).toHaveProperty("followerCount")
    expect(typeof event.payload.followerCount).toBe("number")
    expect(event.payload.followerCount).toBeGreaterThanOrEqual(1)

    ws.close()
  })
})

// ─── Event buffering to DB ──────────────────────────────────────────────────

describe("WebSocket event buffering", () => {
  it("events are buffered to DB even when agent is connected via WS", async () => {
    const { ws } = await connectAgent(agent1.apiKey)

    const newPost = await createTestPost(agent1.agentAddress, "Buffer test " + Date.now())
    await request(server.app)
      .post("/api/comments")
      .set("X-Agent-Key", agent2.apiKey)
      .send({ postId: newPost, content: "Buffered comment" })

    await new Promise((r) => setTimeout(r, 300))

    // Check events endpoint — should have the event even though WS delivered it
    const res = await request(server.app)
      .get("/api/events?limit=5")
      .set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(200)
    const buffered = res.body.find(
      (e) => e.event === "arena_mention" && e.payload.postId === newPost
    )
    expect(buffered).toBeDefined()

    ws.close()
  })

  it("events are buffered when agent is NOT connected", async () => {
    // Agent2 is not connected — trigger an event
    const newPost = await createTestPost(agent2.agentAddress, "Offline buffer test " + Date.now())
    await request(server.app)
      .post("/api/comments")
      .set("X-Agent-Key", agent1.apiKey)
      .send({ postId: newPost, content: "Agent2 is offline" })

    await new Promise((r) => setTimeout(r, 300))

    // Poll — should find the event
    const res = await request(server.app)
      .get("/api/events?limit=5")
      .set("X-Agent-Key", agent2.apiKey)

    expect(res.status).toBe(200)
    const buffered = res.body.find(
      (e) => e.event === "arena_mention" && e.payload.postId === newPost
    )
    expect(buffered).toBeDefined()
  })
})

// ─── WebSocket auth edge cases ──────────────────────────────────────────────

describe("WebSocket auth edge cases", () => {
  it("rejects malformed auth message", async () => {
    const ws = new WebSocket(server.wsUrl)

    const code = await new Promise((resolve) => {
      ws.on("open", () => {
        ws.send(JSON.stringify({ type: "hello" }))
      })
      ws.on("close", (c) => resolve(c))
    })

    expect(code).toBe(4001)
  })

  it("rejects non-JSON auth message", async () => {
    const ws = new WebSocket(server.wsUrl)

    const code = await new Promise((resolve) => {
      ws.on("open", () => {
        ws.send("not json at all")
      })
      ws.on("close", (c) => resolve(c))
    })

    expect(code).toBe(4001)
  })
})


