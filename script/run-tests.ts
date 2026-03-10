import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { spawn } from "node:child_process";

async function collectTests(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return collectTests(fullPath);
    if (entry.isFile() && entry.name.endsWith(".test.ts")) return [relative(process.cwd(), fullPath)];
    return [] as string[];
  }));
  return files.flat().sort();
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

  if (!tests.length) {
    console.error("No test files found under server/ or client/src/");
    process.exit(1);
  }

  const args = ["--experimental-test-module-mocks", "--import", "tsx", "--test", ...tests];
  const child = spawn(process.execPath, args, { cwd: process.cwd(), env: process.env, stdio: "inherit" });
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) process.exit(exitCode);
}

void main();