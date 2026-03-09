import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtimeChainFiles = [
  "../api/index.ts",
  "./app.ts",
  "./routes.ts",
  "./session.ts",
  "./storage.ts",
];

const relativeImportRegex = /(?:from\s+|import\(\s*)["'](\.\.?\/[^"']+)["']/g;

for (const file of runtimeChainFiles) {
  test(`${file} uses explicit .js extensions for relative imports in the Vercel runtime chain`, () => {
    const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
    const specifiers = Array.from(source.matchAll(relativeImportRegex), (match) => match[1]);
    const missingExtensions = specifiers.filter((specifier) => !specifier.endsWith(".js"));

    assert.deepEqual(
      missingExtensions,
      [],
      `expected all relative imports in ${file} to end with .js, found: ${missingExtensions.join(", ")}`,
    );
  });
}