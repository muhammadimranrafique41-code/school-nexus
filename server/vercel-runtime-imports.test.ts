import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtimeChainFiles = [
  "../api/index.ts",
  "../shared/routes.ts",
  "../shared/schema.ts",
  "./app.ts",
  "./db.ts",
  "./default-users.ts",
  "./routes.ts",
  "./session.ts",
  "./settings-service.ts",
  "./storage.ts",
];

const relativeImportRegex = /(?:from\s+|import\(\s*)["'](\.\.?\/[^"']+)["']/g;
const sharedAliasImportRegex = /(?:from\s+|import\(\s*)["'](@shared\/[^"']+)["']/g;

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

  test(`${file} does not rely on @shared aliases in the serverless runtime chain`, () => {
    const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
    const aliasedSpecifiers = Array.from(source.matchAll(sharedAliasImportRegex), (match) => match[1]);

    assert.deepEqual(
      aliasedSpecifiers,
      [],
      `expected no @shared imports in ${file}, found: ${aliasedSpecifiers.join(", ")}`,
    );
  });
}
