import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

async function collectTests(directory: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const { relative } = await import("node:path");
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return collectTests(fullPath);
    if (entry.isFile() && entry.name.endsWith(".test.ts")) return [relative(process.cwd(), fullPath)];
    return [] as string[];
  }));
  return files.flat().sort();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function main() {
  const roots = ["server", join("client", "src")];
  const tests = (
    await Promise.all(
      roots.map(async (root) => collectTests(join(process.cwd(), root))),
    )
  )
    .flat()
    .sort();

  const args = [
    "--experimental-test-module-mocks",
    "--experimental-test-coverage",
    "--test-coverage-include=server/qr-attendance-routes.ts",
    "--test-coverage-include=server/qr-service.ts",
    "--test-coverage-include=client/src/lib/qr-attendance-offline.ts",
    "--import",
    "tsx",
    "--test",
    ...tests,
  ];

  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk: Buffer | string) => {
    const text = chunk.toString();
    stdout += text;
    process.stdout.write(text);
  });

  child.stderr.on("data", (chunk: Buffer | string) => {
    const text = chunk.toString();
    stderr += text;
    process.stderr.write(text);
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });

  const coverageDir = join(process.cwd(), "coverage");
  const coverageHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>School Nexus Test Coverage</title>
    <style>
      body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; margin: 2rem; background: #0f172a; color: #e2e8f0; }
      h1 { font-family: ui-sans-serif, system-ui, sans-serif; }
      pre { white-space: pre-wrap; background: #111827; padding: 1rem; border-radius: 12px; border: 1px solid #334155; }
    </style>
  </head>
  <body>
    <h1>School Nexus Coverage Report</h1>
    <pre>${escapeHtml(`${stdout}${stderr}`)}</pre>
  </body>
</html>`;

  await mkdir(coverageDir, { recursive: true });
  await writeFile(join(coverageDir, "index.html"), coverageHtml, "utf8");

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

void main();