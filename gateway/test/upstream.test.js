import test from "node:test";
import assert from "node:assert/strict";

process.env.ENCRYPTION_KEY ??= "a".repeat(64);
process.env.BOOTSTRAP_ADMIN_API_KEY ??= "test-bootstrap-key";

const { validateSeedServer, validateServerUrl, withTimeout } = await import("../dist/upstream.js");

const validServer = {
  slug: "woocommerce",
  name: "WooCommerce",
  url: "http://localhost:3000/mcp",
};

test("accepts a valid server configuration", () => {
  assert.doesNotThrow(() => validateSeedServer(validServer));
});

test("rejects a server slug containing uppercase letters", () => {
  assert.throws(
    () => validateSeedServer({ ...validServer, slug: "WooCommerce" }),
    /Invalid server slug/,
  );
});

test("rejects a malformed server URL", () => {
  assert.throws(
    () => validateSeedServer({ ...validServer, url: "not a valid URL" }),
  );
});

test("rejects unsupported URL protocols", () => {
  assert.throws(
    () => validateSeedServer({ ...validServer, url: "ftp://example.com/server" }),
    /must use HTTP or HTTPS/,
  );
});

test("rejects URLs containing embedded credentials", () => {
  assert.throws(
    () => validateServerUrl("https://user:password@example.com/mcp"),
    /embedded credentials/,
  );
});

test("accepts HTTP and HTTPS URLs", () => {
  assert.equal(validateServerUrl("http://localhost:3000/mcp").protocol, "http:");
  assert.equal(validateServerUrl("https://example.com/mcp").protocol, "https:");
});

test("resolves an operation that finishes before its timeout", async () => {
  const result = await withTimeout(Promise.resolve("ok"), 100, "timed out");
  assert.equal(result, "ok");
});

test("rejects an operation that exceeds its timeout", async () => {
  await assert.rejects(
    withTimeout(new Promise(() => {}), 10, "test timeout"),
    /test timeout/,
  );
});

test("invokes its cancellation callback on timeout", async () => {
  let cancelled = false;

  await assert.rejects(
    withTimeout(
      new Promise(() => {}),
      10,
      "test timeout",
      () => { cancelled = true; },
    ),
    /test timeout/,
  );

  assert.equal(cancelled, true);
});
