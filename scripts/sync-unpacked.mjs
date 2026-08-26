import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const buildDirectory = resolve(projectRoot, ".output", "chrome-mv3");
const unpackedDirectory = resolve(projectRoot, "Wicklapse-Unpacked");

await mkdir(unpackedDirectory, { recursive: true });

for (const entry of await readdir(unpackedDirectory)) {
  await rm(resolve(unpackedDirectory, entry), { recursive: true, force: true });
}

await cp(buildDirectory, unpackedDirectory, { recursive: true });

console.log(`Synced Chrome extension to ${unpackedDirectory}`);
