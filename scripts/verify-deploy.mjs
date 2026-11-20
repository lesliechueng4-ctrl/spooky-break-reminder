#!/usr/bin/env node
// Verifies a deployed GitHub Pages build (Requirements 26.5 and 26.6).
//
// Usage: node scripts/verify-deploy.mjs <live-url> [expected-script-path]
//
// 1. Requests the Live_URL until it returns HTTP 200 with an HTML page that
//    references the main module script, for up to 3 minutes.
// 2. Requests that main script until it returns HTTP 200, for up to 3 minutes.
// Exits 0 when both pass and 1 otherwise.
//
// The expected script path is the main script that the build job emitted, for
// example "/spooky-break-reminder/assets/index-abc123.js". The page must
// reference that exact script, so a stale page from an earlier deployment keeps
// the check retrying. Without the argument, the first module script in the
// HTML is used, which makes `npm.cmd run verify:deploy -- <url>` work locally.
//
// Optional environment overrides, for local fixtures only:
//   VERIFY_DEPLOY_WINDOW_MS    retry window per request (default 180000)
//   VERIFY_DEPLOY_INTERVAL_MS  pause between attempts (default 5000)

import { pathToFileURL } from 'node:url';

export const DEFAULT_WINDOW_MS = 3 * 60 * 1000;
export const DEFAULT_INTERVAL_MS = 5_000;
const REQUEST_TIMEOUT_MS = 15_000;
const USAGE = 'usage: node scripts/verify-deploy.mjs <live-url> [expected-script-path]';

export class VerifyError extends Error {}

/** Parses the CLI arguments. Only absolute http(s) URLs are accepted. */
export function parseArgs(argv) {
  const [url, expectedScript, ...rest] = argv;
  if (!url || rest.length > 0) throw new VerifyError(USAGE);
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new VerifyError(`not an absolute URL: ${url}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new VerifyError(`unsupported URL scheme in ${url}`);
  }
  if (expectedScript !== undefined && expectedScript.trim() === '') {
    throw new VerifyError('expected script path is empty');
  }
  return {
    url: parsed.href,
    expectedScript: expectedScript === undefined ? null : expectedScript.trim(),
  };
}

function parseAttributes(text) {
  const attrs = new Map();
  const pattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of text.matchAll(pattern)) {
    attrs.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

/** Returns the src values of every `<script type="module" src=...>` in the HTML, in order. */
export function findModuleScriptSources(html) {
  const sources = [];
  for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attrs = parseAttributes(match[1]);
    if (attrs.get('type')?.toLowerCase() === 'module' && attrs.has('src')) {
      sources.push(attrs.get('src'));
    }
  }
  return sources;
}

function resolveUrl(reference, base) {
  try {
    return new URL(reference, base).href;
  } catch {
    return null;
  }
}

/**
 * Checks the fetched page. Returns the absolute URL of the main script, or a failure reason.
 * With an expected script, the page must reference exactly that script.
 */
export function checkPage(html, pageUrl, expectedScript) {
  const found = findModuleScriptSources(html)
    .map((src) => resolveUrl(src, pageUrl))
    .filter((href) => href !== null);
  if (found.length === 0) {
    return { ok: false, reason: 'HTML references no module script' };
  }
  if (expectedScript === null) {
    return { ok: true, value: found[0], detail: `page references ${found[0]}` };
  }
  const wanted = resolveUrl(expectedScript, pageUrl);
  if (wanted === null) {
    return { ok: false, reason: `expected script path is not a valid URL: ${expectedScript}` };
  }
  if (!found.includes(wanted)) {
    return { ok: false, reason: `page does not reference ${wanted} (found ${found.join(', ')})` };
  }
  return { ok: true, value: wanted, detail: `page references ${wanted}` };
}

async function get(fetchImpl, url) {
  const response = await fetchImpl(url, {
    redirect: 'follow',
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return {
    status: response.status,
    url: response.url || url,
    text: await response.text(),
  };
}

/**
 * Runs `attempt` until it succeeds or the window closes. Thrown errors count as
 * failed attempts. The last failure becomes the VerifyError message.
 */
async function retryUntil(label, attempt, { windowMs, intervalMs, now, sleep, log }) {
  const deadline = now() + windowMs;
  for (let n = 1; ; n += 1) {
    let result;
    try {
      result = await attempt();
    } catch (error) {
      result = { ok: false, reason: `request failed: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (result.ok) {
      log(`OK ${label}: ${result.detail}`);
      return result.value;
    }
    if (now() + intervalMs > deadline) {
      throw new VerifyError(`${label} not ready after ${n} attempt(s): ${result.reason}`);
    }
    log(`${label} attempt ${n} failed (${result.reason}); retrying in ${intervalMs / 1000} s`);
    await sleep(intervalMs);
  }
}

/**
 * Verifies the deployment. Resolves with the Live_URL and the main script URL,
 * or rejects with a VerifyError.
 */
export async function verifyDeploy({
  url,
  expectedScript = null,
  fetchImpl = fetch,
  windowMs = DEFAULT_WINDOW_MS,
  intervalMs = DEFAULT_INTERVAL_MS,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = console.log,
}) {
  const options = { windowMs, intervalMs, now, sleep, log };

  const scriptUrl = await retryUntil('Live_URL', async () => {
    const page = await get(fetchImpl, url);
    if (page.status !== 200) {
      return { ok: false, reason: `HTTP ${page.status}` };
    }
    return checkPage(page.text, page.url, expectedScript);
  }, options);

  await retryUntil('main script', async () => {
    const script = await get(fetchImpl, scriptUrl);
    if (script.status !== 200) {
      return { ok: false, reason: `HTTP ${script.status}` };
    }
    return { ok: true, value: scriptUrl, detail: `${scriptUrl} returned 200` };
  }, options);

  return { url, scriptUrl };
}

function envMs(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new VerifyError(`${name} must be a non-negative integer of milliseconds`);
  }
  return value;
}

async function main() {
  let args;
  let windowMs;
  let intervalMs;
  try {
    args = parseArgs(process.argv.slice(2));
    windowMs = envMs('VERIFY_DEPLOY_WINDOW_MS', DEFAULT_WINDOW_MS);
    intervalMs = envMs('VERIFY_DEPLOY_INTERVAL_MS', DEFAULT_INTERVAL_MS);
  } catch (error) {
    console.error(error.message);
    return 1;
  }
  try {
    const result = await verifyDeploy({ ...args, windowMs, intervalMs });
    console.log(`Deployment verified: ${result.url} serves ${result.scriptUrl}`);
    return 0;
  } catch (error) {
    console.error(`Deployment verification failed: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
