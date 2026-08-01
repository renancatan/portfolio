import test from "node:test";
import assert from "node:assert/strict";
import worker, { PROFILE_CONTEXT, outputText } from "../src/index.js";

const origin = "https://renancatan.github.io";
const baseEnv = {
  ALLOWED_ORIGINS: `${origin},http://127.0.0.1:8000`,
  GEMINI_API_KEY: "test-key",
  GEMINI_MODEL: "gemini-3.5-flash-lite",
  ASK_RATE_LIMITER: { limit: async () => ({ success: true }) },
};

function request(path = "/ask", init = {}) {
  return new Request(`https://worker.example${path}`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", ...init.headers },
    body: JSON.stringify({ question: "Tell me about Renan" }),
    ...init,
  });
}

test("health endpoint does not expose secrets", async () => {
  const response = await worker.fetch(new Request("https://worker.example/health"), baseEnv);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.deepEqual(JSON.parse(body), { ok: true, model: "gemini-3.5-flash-lite" });
  assert.equal(body.includes("test-key"), false);
});

test("rejects unapproved origins", async () => {
  const response = await worker.fetch(request("/ask", { headers: { Origin: "https://evil.example", "Content-Type": "application/json" } }), baseEnv);
  assert.equal(response.status, 403);
});

test("answers CORS preflight", async () => {
  const response = await worker.fetch(new Request("https://worker.example/ask", { method: "OPTIONS", headers: { Origin: origin } }), baseEnv);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
});

test("validates question length", async () => {
  const response = await worker.fetch(request("/ask", { body: JSON.stringify({ question: "x" }) }), baseEnv);
  assert.equal(response.status, 400);
});

test("rejects valid JSON without a question object", async () => {
  const response = await worker.fetch(request("/ask", { body: "null" }), baseEnv);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Use between 3 and 300 characters." });
});

test("rejects oversized streamed bodies without a content-length header", async () => {
  const oversized = JSON.stringify({ question: "x".repeat(2100) });
  const response = await worker.fetch(new Request("https://worker.example/ask", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: oversized,
  }), baseEnv);
  assert.equal(response.status, 413);
});

test("enforces rate limits before calling Gemini", async () => {
  const env = { ...baseEnv, ASK_RATE_LIMITER: { limit: async () => ({ success: false }) } };
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 429);
});

test("rate limits by IP rather than a user-controlled client ID", async (t) => {
  const originalFetch = globalThis.fetch;
  let rateLimitKey;
  globalThis.fetch = async () => Response.json({
    steps: [{ type: "model_output", content: [{ type: "text", text: "Renan builds reliable data platforms." }] }],
  });
  t.after(() => { globalThis.fetch = originalFetch; });

  const env = {
    ...baseEnv,
    ASK_RATE_LIMITER: { limit: async ({ key }) => {
      rateLimitKey = key;
      return { success: true };
    } },
  };
  const response = await worker.fetch(request("/ask", {
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "X-Portfolio-Client": "attacker_can_change_this",
      "CF-Connecting-IP": "203.0.113.42",
    },
  }), env);

  assert.equal(response.status, 200);
  assert.equal(rateLimitKey, "203.0.113.42");
});

test("returns plain model output and sends stateless constrained request", async (t) => {
  const originalFetch = globalThis.fetch;
  let upstreamBody;
  globalThis.fetch = async (_url, init) => {
    upstreamBody = JSON.parse(init.body);
    return Response.json({ steps: [{ type: "model_output", content: [{ type: "text", text: "Renan builds reliable data platforms." }] }] });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(request(), baseEnv);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { answer: "Renan builds reliable data platforms." });
  assert.equal(upstreamBody.store, false);
  assert.equal(upstreamBody.model, "gemini-3.5-flash-lite");
  assert.equal(upstreamBody.generation_config.max_output_tokens, 220);
  assert.match(upstreamBody.system_instruction, /Never invent employers/);
  assert.match(upstreamBody.system_instruction, /When discussing selected work/);
});

test("output parser ignores non-model steps", () => {
  assert.equal(outputText({ steps: [{ type: "thought", content: [{ type: "text", text: "hidden" }] }, { type: "model_output", content: [{ type: "text", text: "answer" }] }] }), "answer");
});

test("profile context contains public facts but no secrets or employer names", () => {
  assert.match(PROFILE_CONTEXT, /Python and SQL/);
  assert.match(PROFILE_CONTEXT, /RudderStack/);
  assert.match(PROFILE_CONTEXT, /E-commerce warehouse challenge solution/);
  assert.match(PROFILE_CONTEXT, /11 automated safeguard checks/);
  assert.match(PROFILE_CONTEXT, /Operational BI walkthrough/);
  assert.doesNotMatch(PROFILE_CONTEXT, /GEMINI_API_KEY|AIza|restorewellness/i);
});
