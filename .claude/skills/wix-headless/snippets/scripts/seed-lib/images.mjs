// AI image generation + Wix Media import for seed scripts.
//
// Tries Wix Runware first (site-scoped, free if the site has credits). Falls
// back to OpenAI DALL-E 3 if Runware returns REQUIRED/NOT_ELIGIBLE or any
// credit-related error. Requires OPENAI_API_KEY in the env when falling back.
//
// `generateAndImport(prompt, displayName)` returns `{ id, url }` from Wix Media.
// The url is a wixstatic.com URL usable immediately.
//
// `uploadPlaceholder(state, kind)` uploads a built-in skill placeholder image
// (no AI call, no API cost). Use this during seeding so the site goes live
// looking finished. Replace with bespoke AI images in a second pass after
// release. See `KINDS` below for the catalog.

import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_ID, getToken, getAccountId, wixFetch } from './wix.mjs';

let runwareUseFallback = false;

async function tryRunware(prompt, width, height) {
  const accountId = getAccountId();
  if (!accountId) throw new Error('No accountId from token');
  const body = [
    {
      taskType: 'imageInference',
      taskUUID: randomUUID(),
      outputType: 'URL',
      outputFormat: 'jpg',
      positivePrompt: prompt,
      height,
      width,
      model: 'google:4@2',
      numberResults: 1,
    },
  ];
  const res = await fetch('https://www.wixapis.com/runwareschemaless/v1/request', {
    method: 'POST',
    headers: {
      Authorization: getToken(),
      'Content-Type': 'application/json',
      'wix-site-id': SITE_ID,
      'wix-account-id': accountId,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Runware ${res.status}: ${text}`);
  const json = JSON.parse(text);
  const url = json?.data?.[0]?.imageURL;
  if (!url) throw new Error(`No imageURL in response: ${text}`);
  return url;
}

async function tryOpenAI(prompt, size) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Runware unavailable and OPENAI_API_KEY not set');
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size,
      quality: 'standard',
      response_format: 'url',
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${text}`);
  const json = JSON.parse(text);
  const url = json?.data?.[0]?.url;
  if (!url) throw new Error(`No url in OpenAI response: ${text}`);
  return url;
}

export async function generateImage(prompt, { width = 1024, height = 1024 } = {}) {
  if (!runwareUseFallback) {
    try {
      return await tryRunware(prompt, width, height);
    } catch (e) {
      const msg = String(e.message);
      if (msg.includes('REQUEST_NOT_ELIGIBLE') || msg.includes('credits') || msg.includes('Permission denied')) {
        console.warn('  Runware unavailable, falling back to OpenAI for remaining images.');
        runwareUseFallback = true;
      } else {
        throw e;
      }
    }
  }
  // DALL-E 3 supports 1024x1024, 1792x1024, 1024x1792
  let size = '1024x1024';
  if (width > height) size = '1792x1024';
  else if (height > width) size = '1024x1792';
  return await tryOpenAI(prompt, size);
}

export async function importImage(url, displayName) {
  const res = await wixFetch('POST', '/site-media/v1/files/import', {
    url,
    mimeType: 'image/jpeg',
    displayName,
  });
  const file = res.file;
  if (!file?.url) throw new Error(`Import returned no url: ${JSON.stringify(res)}`);
  return { id: file.id, url: file.url };
}

// Convenience: generate + import in one call, cached in state.images[cacheKey].
export async function generateAndImport(state, cacheKey, prompt, displayName, opts) {
  if (state.images[cacheKey]) return state.images[cacheKey];
  const generated = await generateImage(prompt, opts);
  const uploaded = await importImage(generated, displayName);
  state.images[cacheKey] = uploaded;
  return uploaded;
}

// -----------------------------------------------------------------------------
// Built-in placeholder images
// -----------------------------------------------------------------------------

// The 10 placeholder kinds shipped with the skill. Each maps to a 1024×1024 PNG
// in `placeholder-images/<kind>.png`. Use the kind that best matches the entity
// you're seeding — the visuals are neutral cream/oatmeal tones so they don't
// clash with any brand palette.
export const PLACEHOLDER_KINDS = [
  'product-apparel',    // flat-lay folded grey shirt
  'product-object',     // generic ceramic mug on pedestal
  'service-appointment', // open planner + pen + coffee
  'event-gathering',    // silhouette crowd at golden hour
  'plan-membership',    // matte black premium card on linen
  'donation-cause',     // soft sunlight through window
  'blog-article',       // open notebook + pencil + dried flower
  'restaurant-dish',    // plated meal on cream ceramic
  'category-generic',   // folded textile texture
  'member-avatar',      // abstract warm gradient
];

// Resolve where the placeholder PNGs live. Three locations, first match wins:
//   1. process.env.WIX_HEADLESS_PLACEHOLDERS — explicit override
//   2. <seed-lib-dir>/placeholder-images — bundled into the project
//   3. ~/.claude/skills/wix-headless/snippets/placeholder-images — Claude's
//      installed skill (the default during a fresh `claude generate` flow)
function findPlaceholdersDir() {
  if (process.env.WIX_HEADLESS_PLACEHOLDERS) {
    const p = process.env.WIX_HEADLESS_PLACEHOLDERS;
    if (existsSync(p)) return p;
  }
  const localBundle = join(dirname(fileURLToPath(import.meta.url)), 'placeholder-images');
  if (existsSync(localBundle)) return localBundle;
  const skillDefault = join(homedir(), '.claude/skills/wix-headless/snippets/placeholder-images');
  if (existsSync(skillDefault)) return skillDefault;
  throw new Error(
    'Could not find placeholder-images directory. Set WIX_HEADLESS_PLACEHOLDERS, ' +
    'or copy the skill\'s placeholder-images/ next to images.mjs in seed/lib/.',
  );
}

// Upload a local file to Wix Media via generate-upload-url + PUT.
// Returns { id, url } — the url is a wixstatic.com CDN URL usable immediately.
export async function uploadFile(localPath, { mimeType, fileName } = {}) {
  const bytes = readFileSync(localPath);
  const guessedMime =
    mimeType ??
    (localPath.endsWith('.png') ? 'image/png'
      : localPath.endsWith('.webp') ? 'image/webp'
      : localPath.endsWith('.gif') ? 'image/gif'
      : 'image/jpeg');
  const guessedName = fileName ?? localPath.split('/').pop();

  // Step 1 — get an upload URL from Wix Media. Note the REST path is
  // `generate-upload-url` (no `file` segment) even though the SDK calls the
  // equivalent method `files.generateFileUploadUrl()`. SDK ↔ REST naming drift.
  const urlRes = await wixFetch('POST', '/site-media/v1/files/generate-upload-url', {
    mimeType: guessedMime,
    fileName: guessedName,
  });
  const uploadUrl = urlRes.uploadUrl;
  if (!uploadUrl) {
    throw new Error(`generate-upload-url returned no uploadUrl: ${JSON.stringify(urlRes)}`);
  }

  // Step 2 — PUT the bytes to the upload URL. The upload service returns the
  // final file descriptor (not the generate-upload-url response).
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': guessedMime },
    body: bytes,
  });
  const putText = await putRes.text();
  if (!putRes.ok) {
    throw new Error(`Upload PUT ${putRes.status}: ${putText}`);
  }
  let descriptor;
  try {
    descriptor = JSON.parse(putText);
  } catch {
    throw new Error(`Upload PUT returned non-JSON: ${putText}`);
  }
  const file = descriptor.file ?? descriptor;
  const id = file?.id ?? file?._id;
  const url = file?.url;
  if (!id || !url) {
    throw new Error(`Upload PUT returned no { id, url }: ${putText}`);
  }
  return { id, url };
}

// Build an N-item gallery from a single uploaded image. Stores guidelines
// require 3+ images per product so the storefront's image gallery and
// thumbnail strip render correctly. For placeholders, repeating the same
// upload three times is the right shape — bespoke pass will replace each
// slot with a distinct shot.
export function galleryFrom(uploaded, count = 3) {
  return Array.from({ length: count }, () => ({ url: uploaded.url }));
}

// Upload a built-in placeholder, cached per-kind in state.images so re-runs
// reuse the same uploaded asset. Cache key uses the `__placeholder:` prefix to
// avoid colliding with bespoke generated images keyed by entity slug.
export async function uploadPlaceholder(state, kind) {
  if (!PLACEHOLDER_KINDS.includes(kind)) {
    throw new Error(
      `Unknown placeholder kind "${kind}". Valid: ${PLACEHOLDER_KINDS.join(', ')}`,
    );
  }
  const cacheKey = `__placeholder:${kind}`;
  if (state.images[cacheKey]) return state.images[cacheKey];

  const dir = findPlaceholdersDir();
  const localPath = join(dir, `${kind}.png`);
  if (!existsSync(localPath)) {
    throw new Error(`Placeholder file missing: ${localPath}`);
  }
  const uploaded = await uploadFile(localPath, {
    mimeType: 'image/png',
    fileName: `placeholder-${kind}.png`,
  });
  state.images[cacheKey] = uploaded;
  return uploaded;
}
