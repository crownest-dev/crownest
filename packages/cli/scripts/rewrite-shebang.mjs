import { chmod, readFile, writeFile } from "node:fs/promises";

const outputPath = process.argv[2];

if (!outputPath) {
  throw new Error("Usage: node scripts/rewrite-shebang.mjs <output-file>");
}

const contents = await readFile(outputPath, "utf8");
const rewritten = contents.replace(/^#!.*\n/u, "#!/usr/bin/env node\n");

await writeFile(outputPath, rewritten);
await chmod(outputPath, 0o755);
