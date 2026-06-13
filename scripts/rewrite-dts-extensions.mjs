import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const targetRoot = process.argv[2];

if (!targetRoot) {
  throw new Error("Usage: node scripts/rewrite-dts-extensions.mjs <directory>");
}

for await (const file of walk(path.resolve(process.cwd(), targetRoot))) {
  if (!file.endsWith(".d.ts")) continue;

  const original = await readFile(file, "utf8");
  const rewritten = original.replace(
    /(from\s+["'])(\.[^"']+?)(["'])/gu,
    (_match, prefix, specifier, suffix) =>
      `${prefix}${specifierWithJsExtension(specifier)}${suffix}`,
  );

  if (rewritten !== original) {
    await writeFile(file, rewritten);
  }
}

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(entryPath);
    } else if (entry.isFile()) {
      yield entryPath;
    }
  }
}

function specifierWithJsExtension(specifier) {
  if (path.extname(specifier) !== "") {
    return specifier;
  }

  return `${specifier}.js`;
}
