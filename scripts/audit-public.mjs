import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { inflateSync } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const excludedDirectories = new Set([
  ".git",
  ".output",
  ".wxt",
  "Wicklapse-Unpacked",
  "coverage",
  "node_modules",
  "release",
]);
const textExtensions = new Set([
  "",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".py",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const forbiddenFilenames = new Set([".DS_Store", "Thumbs.db"]);
const forbiddenExtensions = new Set([".key", ".p12", ".pem", ".pfx"]);
const rules = [
  ["email address", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ["local home-directory path", /(?:\/Users\/[^/\s"']+|\/home\/[^/\s"']+|[A-Z]:\\Users\\[^\\\s"']+)/i],
  ["private-key block", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["GitHub token", /\bgh[oprsu]_[A-Za-z0-9]{20,}\b/],
  ["Google API key", /\bAIza[A-Za-z0-9_-]{30,}\b/],
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ["JSON Web Token", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
];
const binaryRules = rules.slice(0, 3);
const wrappedSolMint = "So11111111111111111111111111111111111111112";
const base58Literal = /["'`]([1-9A-HJ-NP-Za-km-z]{32,44})["'`]/g;
const signatureLiteral = /["'`]([1-9A-HJ-NP-Za-km-z]{64,96})["'`]/g;

const findings = [];

function synchsafeInteger(buffer, offset) {
  return ((buffer[offset] ?? 0) << 21)
    | ((buffer[offset + 1] ?? 0) << 14)
    | ((buffer[offset + 2] ?? 0) << 7)
    | (buffer[offset + 3] ?? 0);
}

function decodeId3Text(buffer) {
  const encoding = buffer[0];
  const payload = buffer.subarray(1);
  if (encoding === 1 || encoding === 2) return payload.toString("utf16le").replaceAll("\0", " ");
  return payload.toString(encoding === 0 ? "latin1" : "utf8").replaceAll("\0", " ");
}

function mp3Metadata(buffer) {
  if (buffer.subarray(0, 3).toString("ascii") !== "ID3") return "";
  const version = buffer[3];
  const tagEnd = Math.min(buffer.length, 10 + synchsafeInteger(buffer, 6));
  const values = [];
  let offset = 10;
  while (offset + 10 <= tagEnd) {
    const frameId = buffer.subarray(offset, offset + 4).toString("ascii");
    if (!/^[A-Z0-9]{4}$/.test(frameId)) break;
    const size = version === 4 ? synchsafeInteger(buffer, offset + 4) : buffer.readUInt32BE(offset + 4);
    if (size <= 0 || offset + 10 + size > tagEnd) break;
    const frame = buffer.subarray(offset + 10, offset + 10 + size);
    if (frameId.startsWith("T") || frameId === "COMM") values.push(decodeId3Text(frame));
    if (frameId.startsWith("W")) values.push(frame.toString("latin1"));
    offset += 10 + size;
  }
  return values.join("\n");
}

function pngMetadata(buffer) {
  const values = [];
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const size = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    if (offset + 12 + size > buffer.length) break;
    const data = buffer.subarray(offset + 8, offset + 8 + size);
    if (type === "tEXt" || type === "iTXt") values.push(data.toString(type === "tEXt" ? "latin1" : "utf8"));
    if (type === "zTXt") {
      const separator = data.indexOf(0);
      if (separator >= 0 && separator + 2 < data.length) {
        values.push(data.subarray(0, separator).toString("latin1"));
        try {
          values.push(inflateSync(data.subarray(separator + 2)).toString("utf8"));
        } catch {
          values.push("unreadable compressed PNG metadata");
        }
      }
    }
    offset += 12 + size;
  }
  return values.join("\n");
}

function binaryMetadata(extension, buffer) {
  if (extension === ".mp3") return mp3Metadata(buffer);
  if (extension === ".png") return pngMetadata(buffer);
  return "";
}

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const absolutePath = resolve(directory, entry.name);
    const displayPath = relative(root, absolutePath);
    if (entry.isDirectory()) {
      await walk(absolutePath);
      continue;
    }
    if (!entry.isFile()) continue;
    if (forbiddenFilenames.has(entry.name)) findings.push(`${displayPath}: private operating-system metadata`);
    if (forbiddenExtensions.has(extname(entry.name).toLowerCase())) findings.push(`${displayPath}: private key or certificate file`);
    if (entry.name.startsWith(".env") && entry.name !== ".env.example") findings.push(`${displayPath}: environment file`);
    const extension = extname(entry.name).toLowerCase();
    const isText = textExtensions.has(extension);
    const buffer = await readFile(absolutePath);
    const contents = isText ? buffer.toString("utf8") : binaryMetadata(extension, buffer);
    for (const [label, pattern] of isText ? rules : binaryRules) {
      if (pattern.test(contents)) findings.push(`${displayPath}: ${label}`);
    }
    if (!isText) continue;
    for (const match of contents.matchAll(base58Literal)) {
      if (match[1] !== wrappedSolMint) findings.push(`${displayPath}: literal Solana-like address; use a generated synthetic fixture`);
    }
    for (const _match of contents.matchAll(signatureLiteral)) {
      findings.push(`${displayPath}: literal transaction-signature-like value; use a generated synthetic fixture`);
    }
  }
}

await walk(root);

if (process.argv.includes("--history")) {
  try {
    const emails = execFileSync("git", ["log", "--all", "--format=%ae"], { cwd: root, encoding: "utf8" })
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    const nonPrivateEmails = emails.filter((email) => !email.endsWith("@users.noreply.github.com"));
    if (nonPrivateEmails.length) findings.push(`Git history: ${nonPrivateEmails.length} commit author email occurrence(s) are not GitHub no-reply addresses`);
  } catch {
    findings.push("Git history: unable to inspect commit metadata");
  }
}

if (findings.length) {
  console.error("Public-release audit failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log(`Public-release audit passed${process.argv.includes("--history") ? " (source and history)" : " (source)"}.`);
}
