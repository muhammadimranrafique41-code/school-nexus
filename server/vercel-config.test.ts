import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

type RewriteRule = {
  source?: string;
  destination?: string;
};

type VercelConfig = {
  rewrites?: RewriteRule[];
};

const config = JSON.parse(
  fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
) as VercelConfig;

test("vercel rewrites preserve API routes before the SPA fallback", () => {
  const rewrites = config.rewrites ?? [];
  const apiRewriteIndex = rewrites.findIndex(
    (rule) => rule.source === "/api/:path*" && rule.destination === "/api/:path*",
  );
  const spaRewriteIndex = rewrites.findIndex(
    (rule) =>
      rule.source === "/((?!api(?:/|$)).*)" &&
      rule.destination === "/index.html",
  );

  assert.notEqual(apiRewriteIndex, -1, "expected an explicit /api passthrough rewrite");
  assert.notEqual(
    spaRewriteIndex,
    -1,
    "expected an SPA fallback rewrite that excludes /api paths",
  );
  assert.ok(apiRewriteIndex < spaRewriteIndex, "expected /api passthrough to run before SPA fallback");
});

test("SPA fallback pattern does not match API routes", () => {
  const spaFallback = config.rewrites?.find(
    (rule) =>
      rule.source === "/((?!api(?:/|$)).*)" &&
      rule.destination === "/index.html",
  );

  assert.ok(spaFallback, "expected to find the SPA fallback rule");

  const spaFallbackRegex = new RegExp("^/((?!api(?:/|$)).*)$");

  assert.match("/dashboard", spaFallbackRegex);
  assert.doesNotMatch("/api/me", spaFallbackRegex);
  assert.doesNotMatch("/api/auth/login", spaFallbackRegex);
});