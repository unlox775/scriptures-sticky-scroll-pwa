import { rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const artifactPaths = [
  "documentation/debug-frames",
  "playwright-report",
  "test-results",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const path of artifactPaths) {
  const fullPath = resolve(repoRoot, path);
  try {
    await stat(fullPath);
  } catch {
    console.log(`skip ${path}`);
    continue;
  }

  await rm(fullPath, { recursive: true, force: true });
  console.log(`removed ${path}`);
}

