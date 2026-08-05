import test from "node:test";
import assert from "node:assert/strict";
import worker, { PROFILE_CONTEXT, PROFILE_DATA, isPrioritySkillsQuestion, outputText, prioritySkillsAnswer } from "../src/index.js";

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
  assert.match(upstreamBody.system_instruction, /profile JSON/);
  assert.match(upstreamBody.system_instruction, /When discussing selected work/);
  assert.match(upstreamBody.system_instruction, /exactly six short lines/);
});

test("output parser ignores non-model steps", () => {
  assert.equal(outputText({ steps: [{ type: "thought", content: [{ type: "text", text: "hidden" }] }, { type: "model_output", content: [{ type: "text", text: "answer" }] }] }), "answer");
});

test("returns a deterministic six-line priority list without calling Gemini", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Gemini should not be called"); };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(request("/ask", {
    body: JSON.stringify({ question: "List Renan's skills by priority." }),
  }), baseEnv);
  const { answer } = await response.json();

  assert.equal(response.status, 200);
  assert.equal(answer, prioritySkillsAnswer());
  assert.equal(answer.split("\n").length, 6);
  assert.match(answer, /^1\. Applied AI and LLM workflows:/);
  assert.equal(isPrioritySkillsQuestion("What does Renan build?"), false);
});

test("profile context contains the prioritized public career facts", () => {
  assert.match(PROFILE_CONTEXT, /Python and SQL/);
  assert.match(PROFILE_CONTEXT, /AI agent workflows/);
  assert.match(PROFILE_CONTEXT, /Medallion architecture/);
  assert.match(PROFILE_CONTEXT, /Google BigQuery/);
  assert.match(PROFILE_CONTEXT, /RudderStack/);
  assert.match(PROFILE_CONTEXT, /E-commerce warehouse challenge/);
  assert.match(PROFILE_CONTEXT, /more than 70%/);
  assert.match(PROFILE_CONTEXT, /20\+ competitors/);
  assert.match(PROFILE_CONTEXT, /Operational BI walkthrough/);
  assert.match(PROFILE_CONTEXT, /Kantar IBOPE Media/);
  assert.match(PROFILE_CONTEXT, /Mara/);
  assert.deepEqual(PROFILE_DATA.prioritySkills.map(({ priority }) => priority), [1, 2, 3, 4, 5, 6]);
});

test("public profile context excludes private and confidential data", () => {
  assert.doesNotMatch(PROFILE_CONTEXT, /GEMINI_API_KEY|AIza|restorewellness|renancatan@gmail\.com|96443-9935/i);
  assert.doesNotMatch(PROFILE_CONTEXT, /São Paulo/i);
  assert.doesNotMatch(PROFILE_CONTEXT, /\$\s?\d|USD\s?\d|compensation package/i);
});
