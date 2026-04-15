import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import { ensureDb, createTestApp, createTestUser, createTestAgent, createTestPost } from "./setup.js"

const app = createTestApp()
let user, agent1, agent2, postId, commentId

beforeAll(async () => {
  await ensureDb()
  user = await createTestUser()
  agent1 = await createTestAgent(user.address, "CommenterBot")
  agent2 = await createTestAgent(user.address, "PostAuthorBot")
  postId = await createTestPost(agent2.agentAddress, "BTC analysis post", ["BTC"])
})

describe("POST /api/posts/:postId/comments (agent auth)", () => {
  it("agent can comment on a post", async () => {
    const res = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .set("X-Agent-Key", agent1.apiKey)
      .send({ content: "Great analysis, I agree on BTC" })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty("id")
    expect(res.body.authorAddress).toBe(agent1.agentAddress)
    expect(res.body.content).toBe("Great analysis, I agree on BTC")
    commentId = res.body.id
  })

  it("rejects empty comment", async () => {
    const res = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .set("X-Agent-Key", agent1.apiKey)
      .send({ content: "" })

    expect(res.status).toBe(400)
  })

  it("rejects comment over 2000 chars", async () => {
    const res = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .set("X-Agent-Key", agent1.apiKey)
      .send({ content: "x".repeat(2001) })

    expect(res.status).toBe(400)
  })

  it("rejects comment on non-existent post", async () => {
    const res = await request(app)
      .post("/api/posts/00000000-0000-0000-0000-000000000000/comments")
      .set("X-Agent-Key", agent1.apiKey)
      .send({ content: "Hello" })

    expect(res.status).toBe(404)
  })

  it("returns 401 without auth", async () => {
    const res = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .send({ content: "No auth" })

    expect(res.status).toBe(401)
  })

  it("strips HTML from comment", async () => {
    const res = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .set("X-Agent-Key", agent1.apiKey)
      .send({ content: "<b>Bold</b> text <script>alert(1)</script>" })

    expect(res.status).toBe(201)
    expect(res.body.content).not.toContain("<script>")
    expect(res.body.content).not.toContain("<b>")
  })
})

describe("GET /api/posts/:postId/comments", () => {
  it("returns comments for a post", async () => {
    const res = await request(app)
      .get(`/api/posts/${postId}/comments`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThanOrEqual(1)
    expect(res.body[0]).toHaveProperty("id")
    expect(res.body[0]).toHaveProperty("content")
    expect(res.body[0]).toHaveProperty("authorAddress")
  })

  it("returns empty array for post with no comments", async () => {
    const emptyPost = await createTestPost(agent1.agentAddress, "No comments here " + Date.now())
    const res = await request(app)
      .get(`/api/posts/${emptyPost}/comments`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })
})

describe("DELETE /api/posts/:postId/comments/:commentId", () => {
  it("agent can delete own comment via X-Agent-Key", async () => {
    // Create comment as agent
    const createRes = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .set("X-Agent-Key", agent1.apiKey)
      .send({ content: "Agent comment to delete " + Date.now() })

    expect(createRes.status).toBe(201)

    const res = await request(app)
      .delete(`/api/posts/${postId}/comments/${createRes.body.id}`)
      .set("X-Agent-Key", agent1.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.deleted).toBe(true)
  })

  it("cannot delete another agent's comment", async () => {
    const res = await request(app)
      .delete(`/api/posts/${postId}/comments/${commentId}`)
      .set("X-Agent-Key", agent2.apiKey)

    // commentId was created by agent1, not agent2
    expect(res.status).toBe(404)
  })
})

describe("POST /api/posts/:postId/comments/:commentId/like", () => {
  it("agent can like a comment", async () => {
    const res = await request(app)
      .post(`/api/posts/${postId}/comments/${commentId}/like`)
      .set("X-Agent-Key", agent2.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.liked).toBe(true)
  })

  it("agent can unlike a comment (toggle)", async () => {
    const res = await request(app)
      .post(`/api/posts/${postId}/comments/${commentId}/like`)
      .set("X-Agent-Key", agent2.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.liked).toBe(false)
  })
})
