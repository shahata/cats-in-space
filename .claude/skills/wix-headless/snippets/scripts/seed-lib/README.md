# seed-lib

Reusable seed library for Wix Managed Headless projects. The plumbing
(`wixFetch`, token caching, state persistence, image generation with
Runware → OpenAI fallback) is the same on every site — only the catalog
data spec changes per project.

## Drop into a new project

```bash
SKILL=~/.claude/skills/wix-headless/snippets
mkdir -p seed/lib seed/out
cp "$SKILL/scripts/seed-lib/wix.mjs"   seed/lib/wix.mjs
cp "$SKILL/scripts/seed-lib/state.mjs" seed/lib/state.mjs
cp "$SKILL/scripts/seed-lib/images.mjs" seed/lib/images.mjs
```

Then write `seed/catalog.mjs` (your data spec) and `seed/seed.mjs` (the
orchestrator) using the helpers.

## API

### `seed/lib/wix.mjs`
- `SITE_ID` — read from `wix.config.json`
- `getToken()` — site-scoped OAuth token, cached until expiry
- `getAccountId()` — from the token's payload (needed for Runware)
- `wixFetch(method, path, body?)` — REST client with auth + site-id headers
- `wixFetchAll(items, fn, concurrency=4)` — throttled parallel map. Wix
  rate-limits aggregate writes per app at ~5–10/sec, so default to 4.

### `seed/lib/state.mjs`
- `loadState()` — returns the in-memory state, hydrated from
  `seed/out/state.json` if it exists
- `saveState()` — writes state back to disk; call after every successful
  write so re-runs short-circuit completed work
- `findOrCreate(bucket, key, { search, create, extract? })` — high-level
  helper that searches first, creates on miss, caches the result

### `seed/lib/images.mjs`
- `generateImage(prompt, { width, height })` — Runware first, OpenAI
  fallback. Requires `OPENAI_API_KEY` in env for the fallback path.
- `importImage(url, displayName)` — uploads to Wix Media; returns
  `{ id, url }`. The wixstatic.com `url` is usable immediately.
- `generateAndImport(state, cacheKey, prompt, displayName, opts?)` —
  combined helper that caches in `state.images[cacheKey]`.

## Why this exists

Seed scripts almost always fail on the first run on some shape mismatch
(an enum that's actually a string, a `Color` customization that already
exists from Wix sample data, a 429 mid-loop). The library makes the
inner loop fast:

1. **Find-or-create** means a re-run after a failure doesn't duplicate
   the successful work from the first attempt.
2. **State.json** means you can interrupt a 5-minute image pass at any
   point and resume without regenerating.
3. **Two-stage image gen** (Runware → OpenAI) avoids the most common
   failure mode where the user's Wix site has no Runware credits.

See [PRODUCT_SEEDING.md](../../../references/PRODUCT_SEEDING.md) for the
9-step product seeding workflow and the seeding-coverage matrix every
catalog should hit.
