import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSessionCookieConfig,
  isProductionEnvironment,
  isVercelEnvironment,
  resolveSessionSecret,
  shouldUseSecureSessionCookies,
} from "./session-config";

test("resolveSessionSecret prefers SESSION_SECRET when provided", () => {
  assert.equal(resolveSessionSecret({ SESSION_SECRET: "super-secret" }), "super-secret");
});

test("resolveSessionSecret falls back to the local development secret outside production", () => {
  assert.equal(resolveSessionSecret({ NODE_ENV: "development" }), "school-nexus-secret-key");
});

test("resolveSessionSecret requires SESSION_SECRET on Vercel", () => {
  assert.throws(() => resolveSessionSecret({ NODE_ENV: "production", VERCEL: "1" }), /SESSION_SECRET must be set for Vercel deployments/);
});

test("resolveSessionSecret preserves local production without an injected secret", () => {
  assert.equal(resolveSessionSecret({ NODE_ENV: "production" }), "school-nexus-secret-key");
});

test("buildSessionCookieConfig enables secure cookies only in production", () => {
  assert.equal(buildSessionCookieConfig(false).secure, false);
  assert.equal(buildSessionCookieConfig(true).secure, true);
  assert.equal(buildSessionCookieConfig(true).sameSite, "lax");
});

test("isProductionEnvironment only returns true for production", () => {
  assert.equal(isProductionEnvironment({ NODE_ENV: "production" }), true);
  assert.equal(isProductionEnvironment({ NODE_ENV: "development" }), false);
});

test("isVercelEnvironment detects Vercel runtimes", () => {
  assert.equal(isVercelEnvironment({ VERCEL: "1" }), true);
  assert.equal(isVercelEnvironment({}), false);
});

test("shouldUseSecureSessionCookies only enables secure cookies on Vercel production", () => {
  assert.equal(shouldUseSecureSessionCookies({ NODE_ENV: "production", VERCEL: "1" }), true);
  assert.equal(shouldUseSecureSessionCookies({ NODE_ENV: "production" }), false);
  assert.equal(shouldUseSecureSessionCookies({ NODE_ENV: "development", VERCEL: "1" }), false);
});
