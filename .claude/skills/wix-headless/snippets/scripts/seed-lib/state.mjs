// State persistence for idempotent seed runs.
//
// Catalog APIs are pure POSTs with no built-in dedupe. Every seed script must:
//   (a) query before creating
//   (b) persist a local-key → Wix id map so re-runs reuse existing entities
//
// Without this, each retry of a failed seed produces a fresh orphan set in the
// dashboard. Use this module from your seed script:
//
//   import { loadState, saveState } from './lib/state.mjs';
//   const state = loadState();
//   if (!state.categories.apparel) {
//     state.categories.apparel = (await findOrCreateCategory(...))._id;
//     saveState();
//   }

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Locate `seed/out/state.json` relative to the seed/ directory (which is the
// import.meta.url's grandparent when this module lives at seed/lib/state.mjs).
const STATE_PATH_URL = new URL('../out/state.json', import.meta.url);
const STATE_PATH = fileURLToPath(STATE_PATH_URL);

const DEFAULT_STATE = {
  // Add buckets here as your seed grows. Each bucket maps local-key → Wix entity.
  categories: {},
  customizations: {},
  products: {},
  infoSections: {},
  collections: {},
  services: {},
  staff: {},
  campaigns: {},
  plans: {},
  posts: {},
  events: {},
  menus: {},
  images: {},
  flags: {},
};

let state = null;

export function loadState() {
  if (state) return state;
  if (existsSync(STATE_PATH)) {
    state = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
    for (const key of Object.keys(DEFAULT_STATE)) {
      if (!state[key]) state[key] = DEFAULT_STATE[key];
    }
  } else {
    state = JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
  return state;
}

export function saveState() {
  if (!state) return;
  try {
    mkdirSync(dirname(STATE_PATH), { recursive: true });
  } catch {}
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// Higher-level helper: find-or-create. Pass a "search" function that returns
// any matching entity (or null) and a "create" function that creates a new one.
// Persists the result under state[bucket][key] and returns the cached value on
// subsequent calls.
export async function findOrCreate(bucket, key, { search, create, extract = (e) => ({ id: e._id || e.id }) }) {
  const s = loadState();
  if (!s[bucket]) s[bucket] = {};
  if (s[bucket][key]?.id) return s[bucket][key];
  const existing = await search();
  if (existing) {
    s[bucket][key] = extract(existing);
    saveState();
    return s[bucket][key];
  }
  const created = await create();
  s[bucket][key] = extract(created);
  saveState();
  return s[bucket][key];
}
