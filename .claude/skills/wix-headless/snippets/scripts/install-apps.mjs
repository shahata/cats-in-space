#!/usr/bin/env node
/**
 * Idempotent Wix app installer.
 *
 * Usage:
 *   node scripts/install-apps.mjs <feature1> <feature2> ...
 *   node scripts/install-apps.mjs stores blog bookings restaurants
 *
 * Or as a library:
 *   import { installApps, FEATURES } from './install-apps.mjs';
 *   await installApps(['stores', 'donations']);
 *
 * Wix's apps-installer-service is idempotent — re-installing returns the existing
 * appInstance, so it's safe to run on every CI deploy. We also resolve the site
 * id from wix.config.json and the OAuth site token via `npx wix token -s <siteId>`.
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ----- Feature → appDefId map ------------------------------------------------

export const FEATURES = {
  // Core eCommerce
  stores: '215238eb-22a5-4c36-9e7b-e7c08025e04e', // Wix Stores V3
  ecomPlatform: '1380b703-ce81-ff05-f115-39571d94dfcd', // eCom platform (V1 catalogRef + back-in-stock infrastructure)
  giftCards: 'd80111c5-a0f4-47a8-b63a-65b54d774a27', // Wix Gift Vouchers
  backInStock: '16be6c71-d061-4f56-8cda-c6aa911d1832', // Back-in-stock notifications

  // Content
  blog: '14bcded7-0066-7c35-14d7-466cb3f09103', // Wix Blog
  cms: '675bbcef-18d8-41f5-800e-131ec9e08762', // Wix Data / CMS

  // Services & scheduling
  bookings: '13d21c63-b5ec-5912-8397-c3a5ddb27a97', // Wix Bookings
  pricingPlans: '1522827f-c56c-a5c9-2ac9-00f9e6ae12d3', // Wix Pricing Plans

  // Restaurants suite
  restaurantsMenus: 'b278a256-2757-4f19-9313-c05c783bec92', // Wix Restaurants Menus (New)
  restaurantsOrders: '9a5d83fd-8570-482e-81ab-cfa88942ee60', // Wix Restaurants Orders (New)
  tableReservations: 'f9c07de2-5341-40c6-b096-8eb39de391fb', // Wix Table Reservations

  // Events & community
  events: '140603ad-af8d-84a5-2c80-a0f60cb47351', // Wix Events
  donations: '333b456e-dd48-4d6b-b32b-9fd48d74e163', // Wix Donations

  // Site infrastructure
  multilingual: '14d84998-ae09-1abf-c6fc-3f3cace5bf19', // Wix Multilingual
};

// Convenience "groups" — installing the group key installs all its members.
export const GROUPS = {
  ecom: ['stores', 'ecomPlatform', 'backInStock'],
  restaurant: ['restaurantsMenus', 'restaurantsOrders', 'tableReservations'],
  all: Object.keys(FEATURES),
};

// ----- Resolve site id + token -----------------------------------------------

function findConfigPath() {
  const candidates = [
    join(process.cwd(), 'wix.config.json'),
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'wix.config.json'),
  ];
  for (const p of candidates) {
    try {
      readFileSync(p);
      return p;
    } catch {}
  }
  throw new Error('Could not find wix.config.json. Run from the project root.');
}

const config = JSON.parse(readFileSync(findConfigPath(), 'utf8'));
const SITE_ID = config.siteId;

let cachedToken = null;
function getToken() {
  if (cachedToken) return cachedToken;
  cachedToken = execSync(`npx --yes wix token -s ${SITE_ID}`, { encoding: 'utf8' }).trim();
  return cachedToken;
}

// ----- HTTP helper -----------------------------------------------------------

async function wixFetch(method, path, body) {
  const res = await fetch(`https://www.wixapis.com${path}`, {
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
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(parsed)}`);
    err.status = res.status;
    err.body = parsed;
    throw err;
  }
  return parsed;
}

// ----- Installer -------------------------------------------------------------

function expandFeatures(features) {
  const expanded = new Set();
  for (const f of features) {
    if (GROUPS[f]) GROUPS[f].forEach((x) => expanded.add(x));
    else if (FEATURES[f]) expanded.add(f);
    else throw new Error(`Unknown feature/group: "${f}". Known: ${[...Object.keys(FEATURES), ...Object.keys(GROUPS)].join(', ')}`);
  }
  return [...expanded];
}

export async function installApps(features) {
  const list = expandFeatures(features);
  const results = [];
  for (const feature of list) {
    const appDefId = FEATURES[feature];
    try {
      const res = await wixFetch('POST', '/apps-installer-service/v1/app-instance/install', {
        tenant: { id: SITE_ID, tenantType: 'SITE' },
        appInstance: { appDefId },
      });
      results.push({ feature, appDefId, status: 'installed', appInstance: res.appInstance });
      console.log(`✓ ${feature} (${appDefId})`);
    } catch (e) {
      results.push({ feature, appDefId, status: 'failed', error: e.message });
      console.error(`✗ ${feature} (${appDefId}): ${e.message}`);
    }
  }
  return results;
}

// Some apps need an extra one-time "start collecting" / config call after install.
// Add them here so the bootstrap is a single command.
export async function configureBackInStock() {
  try {
    await wixFetch('POST', '/back-in-stock-service/v1/back-in-stock-notification-requests/settings/start-collecting', {
      appId: FEATURES.ecomPlatform,
    });
    console.log('✓ Back-in-stock collection enabled.');
  } catch (e) {
    console.error(`✗ Back-in-stock collection: ${e.message}`);
  }
}

// ----- CLI -------------------------------------------------------------------

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node install-apps.mjs <feature> [<feature>...]');
    console.error('Features: ' + Object.keys(FEATURES).join(', '));
    console.error('Groups: ' + Object.keys(GROUPS).join(', '));
    process.exit(1);
  }
  await installApps(args);
  if (args.includes('backInStock') || args.includes('ecom') || args.includes('all')) {
    await configureBackInStock();
  }
}
