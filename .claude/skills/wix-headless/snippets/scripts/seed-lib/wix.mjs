// Wix REST client for seed scripts.
//
// Resolves the site id from wix.config.json (one directory above wherever you
// drop seed/) and the site-scoped OAuth token from `npx wix token -s <siteId>`.
// Caches the token until its embedded expiration approaches.
//
// Usage:
//   import { wixFetch, SITE_ID } from './lib/wix.mjs';
//   const res = await wixFetch('POST', '/categories/v1/categories/search', {
//     treeReference: { appNamespace: '@wix/stores' },
//   });

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function findConfigPath() {
  // Walk up from this file's directory looking for wix.config.json
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    try {
      readFileSync(join(dir, 'wix.config.json'));
      return join(dir, 'wix.config.json');
    } catch {}
    dir = dirname(dir);
  }
  // Fall back to CWD
  try {
    readFileSync(join(process.cwd(), 'wix.config.json'));
    return join(process.cwd(), 'wix.config.json');
  } catch {}
  throw new Error('Could not find wix.config.json. Run the seed from the project root.');
}

const config = JSON.parse(readFileSync(findConfigPath(), 'utf8'));
export const SITE_ID = config.siteId;

let cachedToken = null;
let tokenExpiresAt = 0;

function decodeJwt(token) {
  const raw = token.startsWith('OauthNG.JWS.') ? token.slice('OauthNG.JWS.'.length) : token;
  const parts = raw.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload.data) return JSON.parse(payload.data);
    return payload;
  } catch {
    return null;
  }
}

export function getToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) return cachedToken;
  cachedToken = execSync(`npx --yes wix token -s ${SITE_ID}`, { encoding: 'utf8' }).trim();
  const data = decodeJwt(cachedToken);
  if (data?.instance?.expirationDate) {
    tokenExpiresAt = Date.parse(data.instance.expirationDate);
  } else {
    tokenExpiresAt = now + 60 * 60 * 1000;
  }
  return cachedToken;
}

export function getAccountId() {
  const data = decodeJwt(getToken());
  return data?.instance?.siteOwnerId || data?.instance?.loginAccountId || null;
}

// REST endpoints under https://www.wixapis.com return entities with `id`
// (camelCase, no underscore). The Wix SDK unwraps the same entities as `_id`.
// Seed scripts talk REST, so use `idOf(entity)` to read the entity id — it
// prefers `id` and falls back to `_id` for the rare endpoint that mirrors the
// SDK shape. Use this for products, customizations, info sections, categories,
// services, plans, posts, campaigns — every V3 REST response.
export const idOf = (entity) => entity?.id ?? entity?._id;

export async function wixFetch(method, path, body, { maxRetries = 5 } = {}) {
  const url = path.startsWith('http') ? path : `https://www.wixapis.com${path}`;
  let attempt = 0;
  for (;;) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: getToken(),
        'Content-Type': 'application/json',
        'wix-site-id': SITE_ID,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }
    if (res.ok) return parsed;

    // Retry on 429 (Wix rate-limits aggregate writes per app) and 5xx with
    // exponential backoff. Both are common during dense seed runs.
    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      const delay = Math.min(1000 * 2 ** attempt, 8000);
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
      continue;
    }

    const err = new Error(
      `${method} ${url} -> ${res.status}: ${typeof parsed === 'object' ? JSON.stringify(parsed) : parsed}`,
    );
    err.status = res.status;
    err.body = parsed;
    throw err;
  }
}

// Parallel + throttled fetch — Wix rate-limits aggregate writes per app, so
// running 50 createX in parallel hits 429. Throttle to ~4 concurrent.
export async function wixFetchAll(items, fn, concurrency = 4) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = { ok: true, value: await fn(items[idx], idx) };
      } catch (e) {
        out[idx] = { ok: false, error: e };
      }
    }
  });
  await Promise.all(workers);
  return out;
}
