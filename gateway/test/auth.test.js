import test from "node:test";
import assert from "node:assert/strict";

process.env.ENCRYPTION_KEY ??= "a".repeat(64);
process.env.BOOTSTRAP_ADMIN_API_KEY ??= "test-bootstrap-key";

const { requireAuth, requireAdmin } = await import("../dist/auth.js");

function mockResponse() {
  const response = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  return response;
}

test("rejects a request without an Authorization header", async () => {
  const req = { headers: {} };
  const res = mockResponse();
  let nextCalled = false;

  await requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, "Missing bearer API key");
  assert.equal(nextCalled, false);
});

test("rejects an empty bearer API key", async () => {
  const req = { headers: { authorization: "Bearer   " } };
  const res = mockResponse();
  let nextCalled = false;

  await requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, "Missing bearer API key");
  assert.equal(nextCalled, false);
});

test("denies a member access to admin-only routes", () => {
  const req = {
    auth: {
      user: { id: "member-1", email: "member@example.com", role: "member" },
      apiKey: { id: "key-1", name: "member-key" },
    },
  };

  const res = mockResponse();
  let nextCalled = false;

  requireAdmin(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, "Admin access required");
  assert.equal(nextCalled, false);
});

test("allows an authenticated admin through admin authorization", () => {
  const req = {
    auth: {
      user: { id: "admin-1", email: "admin@example.com", role: "admin" },
      apiKey: { id: "key-2", name: "admin-key" },
    },
  };

  const res = mockResponse();
  let nextCalled = false;

  requireAdmin(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});
