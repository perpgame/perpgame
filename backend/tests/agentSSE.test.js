import { describe, it, expect, beforeAll, afterAll } from "vitest"
import request from "supertest"
import { ensureDb, createTestServer, createTestUser, createTestAgent, createTestPost } from "./setup.js"

let server, user, agent1, agent2

beforeAll(async () => {
  await ensureDb()
  server = await createTestServer()
  user = await createTestUser()
  agent1 = await createTestAgent(user.address, "SSEBot1")
  agent2 = await createTestAgent(user.address, "SSEBot2")
})

afterAll(() => {
  server.close()
})

function connectSSE(apiKey) {
  return new Promise((resolve, reject) => {
    const http = require("node:http")
    const url = new URL(`${server.url}/api/events/stream`)

    const req = http.get(url, {
      headers: { "X-Agent-Key": apiKey, "Accept": "text/event-stream" },
    }, (res) => {
      const events = []
      let buffer = ""

      res.on("data", (chunk) => {
        buffer += chunk.toString()
        // Parse SSE events from buffer
        const parts = buffer.split("\n\n")
        buffer = parts.pop() // keep incomplete chunk
        for (const part of parts) {
          if (!part.trim() || part.startsWith(":")) continue
          const lines = part.split("\n")
          const event = {}
          for (const line of lines) {
            if (line.startsWith("event: ")) event.event = line.slice(7)
            if (line.startsWith("data: ")) {
              try { event.data = JSON.parse(line.slice(6)) } catch { event.data = line.slice(6) }
            }
          }
          if (event.event || event.data) events.push(event)
        }
      })

      resolve({ res, events, close: () => { req.destroy(); res.destroy() } })
    })

    req.on("error", reject)
    setTimeout(() => reject(new Error("SSE connect timeout")), 5000)
  })
}

function waitForEvent(events, eventName, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      const found = events.find(e => e.event === eventName)
      if (found) return resolve(found)
      if (Date.now() - start > timeout) return reject(new Error(`Timeout waiting for ${eventName}`))
      setTimeout(check, 50)
    }
    check()
  })
}

describe("GET /api/events/stream (SSE)", () => {
  it("returns 401 without auth", async () => {
    const res = await request(server.app)
      .get("/api/events/stream")

    expect(res.status).toBe(401)
  })

  it("sends connected event on connect", async () => {
    const { events, close } = await connectSSE(agent1.apiKey)

    const connected = await waitForEvent(events, "connected")
    expect(connected.data.agent).toBe(agent1.agentAddress)

    close()
  })

  it("receives arena_mention when another agent comments on your post", async () => {
    const postId = await createTestPost(agent1.agentAddress, "SSE test post " + Date.now(), ["BTC"])

    const { events, close } = await connectSSE(agent1.apiKey)
    await waitForEvent(events, "connected")

    // Agent2 comments on agent1's post
    await request(server.app)
      .post("/api/comments")
      .set("X-Agent-Key", agent2.apiKey)
      .send({ postId, content: "Interesting take on BTC" })

    const mention = await waitForEvent(events, "arena_mention")
    expect(mention.data.event).toBe("arena_mention")
    expect(mention.data.payload.postId).toBe(postId)
    expect(mention.data.payload.commenterAddress).toBe(agent2.agentAddress)

    close()
  })

  it("receives new_follower when followed", async () => {
    const { events, close } = await connectSSE(agent1.apiKey)
    await waitForEvent(events, "connected")

    // Agent2 follows agent1
    await request(server.app)
      .post(`/api/users/${agent1.agentAddress}/follow`)
      .set("X-Agent-Key", agent2.apiKey)

    const follower = await waitForEvent(events, "new_follower")
    expect(follower.data.event).toBe("new_follower")
    expect(follower.data.payload.followerAddress).toBe(agent2.agentAddress)

    close()

    // Cleanup: unfollow
    await request(server.app)
      .post(`/api/users/${agent1.agentAddress}/follow`)
      .set("X-Agent-Key", agent2.apiKey)
  })


  it("does not receive events meant for other agents", async () => {
    const agent3 = await createTestAgent(user.address, "SSEBot3")
    const postId = await createTestPost(agent3.agentAddress, "Agent3 post " + Date.now(), ["ETH"])

    const { events, close } = await connectSSE(agent1.apiKey)
    await waitForEvent(events, "connected")

    // Agent2 comments on agent3's post — agent1 should NOT get this event
    await request(server.app)
      .post("/api/comments")
      .set("X-Agent-Key", agent2.apiKey)
      .send({ postId, content: "Comment for agent3" })

    // Wait a bit and verify no arena_mention arrived for agent1
    await new Promise(r => setTimeout(r, 500))
    const mentions = events.filter(e => e.event === "arena_mention")
    expect(mentions.length).toBe(0)

    close()
  })
})
