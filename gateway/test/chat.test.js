import test from "node:test";
import assert from "node:assert/strict";

process.env.ENCRYPTION_KEY ??= "a".repeat(64);
process.env.BOOTSTRAP_ADMIN_API_KEY ??= "test-bootstrap-key";
process.env.GEMINI_MODEL = "gemini-3.6-flash";

const { requestGemini } = await import("../dist/chat.js");

function networkError() {
  const cause = new Error("sensitive transport detail");
  cause.code = "ECONNRESET";
  return new TypeError("fetch failed", { cause });
}

test("retries a transient fetch failure before succeeding", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const logs = [];
  let attempts = 0;

  t.after(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  });

  console.warn = (...args) => logs.push(args);
  globalThis.fetch = async () => {
    attempts++;
    if (attempts < 3) throw networkError();
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }),
    };
  };

  const result = await requestGemini({}, "must-not-be-logged");

  assert.equal(attempts, 3);
  assert.equal(result.candidates[0].content.parts[0].text, "ok");
  assert.equal(logs.length, 2);
  assert.deepEqual(logs[0], [
    "[chat] Gemini request failed",
    {
      stage: "gemini_generate",
      model: "gemini-3.6-flash",
      errorName: "TypeError",
      errorCode: "ECONNRESET",
    },
  ]);
  assert.equal(JSON.stringify(logs).includes("must-not-be-logged"), false);
  assert.equal(JSON.stringify(logs).includes("sensitive transport detail"), false);
});

test("exhausts retries and proceeds through configured fallback models", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const logs = [];
  const requestedUrls = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  });

  console.warn = (...args) => logs.push(args);
  globalThis.fetch = async (input) => {
    requestedUrls.push(String(input));
    throw networkError();
  };

  await assert.rejects(
    requestGemini({}, "must-not-be-logged"),
    (error) => {
      assert.equal(error.name, "GeminiRequestError");
      assert.equal(error.availabilityExhausted, true);
      assert.equal(error.model, "gemini-3.5-flash-lite");
      return true;
    },
  );

  assert.equal(requestedUrls.length, 9);
  assert.equal(logs.length, 9);
  assert.ok(requestedUrls[0].includes("gemini-3.6-flash"));
  assert.ok(requestedUrls[3].includes("gemini-3.5-flash"));
  assert.ok(requestedUrls[6].includes("gemini-3.5-flash-lite"));
  assert.equal(JSON.stringify(logs).includes("must-not-be-logged"), false);
  assert.equal(JSON.stringify(logs).includes("sensitive transport detail"), false);
});
