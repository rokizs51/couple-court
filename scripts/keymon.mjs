#!/usr/bin/env node
// Couple Court key monitor. Run on the VM, in YOUR terminal (keys are typed here, never pasted into chat).
//
//   node scripts/keymon.mjs status          Is the judge's API key working? (exit 1 if not: usable from cron)
//   node scripts/keymon.mjs rotate          Replace the Anthropic key: validate it, upload it, re-check
//   node scripts/keymon.mjs setup-admin     One time: create the admin token and upload it to the Worker
//
// Needs for rotate / setup-admin:  export CLOUDFLARE_API_TOKEN=...  (and CLOUDFLARE_ACCOUNT_ID if you have several accounts)
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const BASE = process.env.COUPLE_COURT_URL ?? "https://couple-court.rokizs.site";
const DIR = join(homedir(), ".couple-court");
const TOKEN_FILE = join(DIR, "admin-token");

const adminToken = () => process.env.ADMIN_TOKEN || (existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, "utf8").trim() : "");

/** Reads a line without echoing it. */
function secret(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const w = rl._writeToOutput;
    rl._writeToOutput = (s) => { if (s.includes(prompt)) w.call(rl, s); }; // show the prompt, hide the typing
    rl.question(prompt, (a) => { rl.close(); process.stdout.write("\n"); resolve(a.trim()); });
  });
}

const ago = (t) => (t ? `${Math.round((Date.now() - t) / 60000)} min ago` : "never");
const MSG = {
  auth: "The API key is REJECTED (revoked or wrong). Run: node scripts/keymon.mjs rotate",
  billing: "The Anthropic account is OUT OF CREDIT or over its spend limit. Top up, or use a key from a funded account.",
  rate: "Rate limited by Anthropic. Usually temporary.",
  unavailable: "Anthropic is unreachable or erroring. Usually temporary.",
  unknown: "Unknown model error.",
};

async function status({ quiet = false } = {}) {
  const tok = adminToken();
  if (!tok) { console.error("No admin token. Run: node scripts/keymon.mjs setup-admin"); return 2; }
  let res;
  try { res = await fetch(`${BASE}/api/admin/status?probe=1`, { headers: { authorization: `Bearer ${tok}` } }); }
  catch { console.error("Cannot reach " + BASE + " (on this VM IPv6 is missing; try: export NODE_OPTIONS=--dns-result-order=ipv4first)"); return 2; }
  if (res.status === 404) { console.error("Admin API is off: ADMIN_TOKEN is not set on the Worker. Run setup-admin."); return 2; }
  if (res.status === 401) { console.error("Admin token rejected. Re-run setup-admin."); return 2; }
  if (!res.ok) { console.error("Unexpected HTTP " + res.status); return 2; }
  const j = await res.json();
  if (!quiet) {
    console.log(`Judge key : ${j.ok ? "WORKING" : "NOT WORKING"}  (model: ${j.model})`);
    if (!j.ok && j.probe?.kind) console.log(`Reason    : ${MSG[j.probe.kind] ?? j.probe.kind}`);
    if (j.health) console.log(`Last OK   : ${ago(j.health.lastOkAt)}   Last failure: ${ago(j.health.lastFailAt)} (${j.health.lastKind ?? "-"})   Fails in a row: ${j.health.fails}`);
    console.log(`Today     : ${j.today.calls} / ${j.today.cap} judge calls`);
    if (j.model === "mock") console.log("Note      : the Worker is running the MOCK model, not the real judge.");
  }
  return j.ok ? 0 : 1;
}

function wrangler(args, input, env = {}) {
  return spawnSync("npx", ["wrangler", ...args], { input, encoding: "utf8", env: { ...process.env, ...env } });
}
function needCloudflare() {
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    console.error("Set CLOUDFLARE_API_TOKEN first, typed in this terminal (not in chat).");
    process.exit(2);
  }
}

async function rotate() {
  needCloudflare();
  console.log("Paste the NEW Anthropic API key (typing is hidden). Press Enter.");
  const key = await secret("New key: ");
  if (!/^sk-ant-/.test(key)) { console.error("That does not look like an Anthropic key (should start with sk-ant-). Nothing changed."); return 2; }

  // 1. Validate the key BEFORE replacing the working one.
  process.stdout.write("Checking the new key with Anthropic... ");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5", max_tokens: 5, messages: [{ role: "user", content: "Reply OK" }] }),
  }).catch(() => null);
  if (!r) { console.error("could not reach Anthropic. Nothing changed."); return 2; }
  if (!r.ok) {
    console.error(`rejected (HTTP ${r.status}). Nothing changed, the old key is still in place.`);
    if (r.status === 400 || r.status === 402) console.error("If this says credit balance, the new key's account has no credit.");
    return 2;
  }
  console.log("valid.");

  // 2. Upload it. The key goes through stdin, never through the command line or a file.
  process.stdout.write("Uploading to Cloudflare... ");
  const up = wrangler(["secret", "put", "ANTHROPIC_API_KEY"], key + "\n");
  if (up.status !== 0) { console.error("FAILED. The old key is still active.\n" + (up.stderr || "").replace(key, "***").slice(-400)); return 2; }
  console.log("done.");

  // 3. Confirm end to end through the live Worker.
  await new Promise((s) => setTimeout(s, 3000));
  const code = await status();
  if (code === 0) console.log("\nKey rotated. Remember to REVOKE the old key in the Anthropic console.");
  return code;
}

async function setupAdmin() {
  needCloudflare();
  mkdirSync(DIR, { recursive: true }); chmodSync(DIR, 0o700);
  const tok = randomBytes(32).toString("hex");
  const up = wrangler(["secret", "put", "ADMIN_TOKEN"], tok + "\n");
  if (up.status !== 0) { console.error("Upload failed:\n" + (up.stderr || "").slice(-400)); return 2; }
  writeFileSync(TOKEN_FILE, tok + "\n", { mode: 0o600 });
  console.log(`Admin token saved to ${TOKEN_FILE} (private to you) and set on the Worker.`);
  console.log("Redeploy if the monitor endpoint is not yet live, then run: node scripts/keymon.mjs status");
  return 0;
}

const cmd = process.argv[2];
const run = { status: () => status({ quiet: process.argv.includes("--quiet") }), rotate, "setup-admin": setupAdmin }[cmd];
if (!run) { console.error("Usage: node scripts/keymon.mjs <status|rotate|setup-admin>"); process.exit(2); }
process.exit(await run());
