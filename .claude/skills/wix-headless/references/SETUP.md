# Project Setup & Scaffolding

## Quickstart

After scaffolding (below), copy the universal snippets in one Bash batch and you have a working Layout + Nav + cart sidebar + member area + utils without writing a line:

```bash
SKILL=~/.claude/skills/wix-headless/snippets
mkdir -p src/utils src/components src/layouts src/pages/api src/pages/member
cp -R "$SKILL/universal/utils/." src/utils/
cp -R "$SKILL/universal/components/." src/components/
cp -R "$SKILL/universal/layouts/." src/layouts/
cp -R "$SKILL/universal/pages/." src/pages/
```

Then customize the brand strings flagged in each snippet's header comment. See [`snippets/README.md`](../snippets/README.md) for the full list.


## Build order — scaffold → install apps → parallelize (code + seed) → release → ask about bespoke images

The order you sequence the work in directly affects how long the build takes. The right pipeline runs code generation and seeding in parallel, uses built-in placeholders so the first release is already complete, and only invests in bespoke AI images after the user has clicked through the live site.

1. **Scaffold and install Wix apps first** — both prerequisites for everything after. `npm create @wix/new@latest headless` to scaffold; `node scripts/install-apps.mjs <features>` to install the Wix apps your feature set needs (`stores`, `bookings`, `blog`, …). Read `wix.config.json` for the `siteId` once the scaffold completes.

2. **Decide the seed spec now, not after release.** Either work the catalog out with the user upfront, or pick a reasonable default for the requested feature set. Write `seed/catalog.mjs` against the snippet seed-lib's expected data shape. Doing this *before* spawning parallel work means both branches have a stable contract.

3. **Run code generation and seeding in parallel.** They share zero state — seeding hits Wix REST APIs over the network; code generation is local file writes + `astro check`. Dispatch the seed in a background `Agent` (subagent_type: general-purpose, `run_in_background: true`) and continue with code generation in the foreground:

   - **Background (seed)** — `node seed/seed.mjs` calls `uploadPlaceholder(state, kind)` from `seed/lib/images.mjs` for every entity image field. No AI calls during this pass. The seed-lib is idempotent + state-cached, so it can re-run safely if anything fails mid-way.
   - **Foreground (code)** — install npm packages in one batch (see [snippets/README.md](../snippets/README.md) for the per-feature lists), copy snippets, customize brand strings (translations, Layout, Nav, Footer, homepage), pass `npx astro check`.

   Why parallel: seeding takes 30–90 seconds for a typical 10–20 entity catalog (network-bound). Code generation takes 60–120 seconds (CPU + filesystem). Sequential adds these up; parallel hides the smaller behind the larger.

4. **Release once, after both branches complete.** `npm run release` ships the storefront *and* the seeded catalog *and* the placeholder visuals in a single live build. No "release with samples → ask → seed → re-release" loop. Report URLs (the live site URL + dashboard URL).

5. **Ask about bespoke AI images after release.** Now that the user has a working URL to click through, ask whether to swap placeholders for bespoke AI-generated images. If the user agrees, run a second pass:
   - For each entity, call `generateAndImport(state, slug, prompt, displayName)` from `seed/lib/images.mjs` (Runware → DALL-E fallback)
   - PATCH the result onto the entity (`media.itemsInfo.items` for products, `coverImage` for donation campaigns, etc.)
   - Re-release when done. Report the new live URL.

   Most users either accept the placeholders (they're aesthetic enough to ship) or ask for changes that would have made the first-pass bespoke generation a waste. The ask-after-release gating is what makes the bespoke pass cheap.

**The defaults to avoid.** Don't release with Wix sample data as a checkpoint (it's noise the user has to mentally filter past). Don't generate bespoke images during the first seed (the pre-release wall time it adds rarely earns back its cost). Don't seed serially after the code is done (the seed has no dependencies on the code).

## Scaffolding a New Project

Before scaffolding, list the working directory to check for existing folders and pick a `--project-name` that doesn't conflict.

**Non-interactive (preferred):**
```bash
npm create @wix/new@latest headless -- \
  --business-name "My Business" \
  --project-name myfolder \
  --site-template blank
```

| Flag | Description |
|------|-------------|
| `--business-name` | Name shown in your Wix sites list |
| `--project-name` | Local directory name (3-20 chars, lowercase letters and numbers only — rename after creation if needed) |
| `--site-template` | Template name (e.g. `blank`) |

**Interactive:**
```bash
npm create @wix/new@latest headless
```

The scaffold creates an **Astro** project with Wix integrations pre-configured.

## Post-Scaffold: Upgrade @wix/essentials

Translations need `@wix/essentials >= 1.0.6` for `i18n.getTranslationFunction()`. Run after scaffolding:

```bash
npm install @wix/essentials@latest
npm install --save-dev @types/node
```

`@types/node` is needed because the scaffold's `astro.config.mjs` reads `process.env.NODE_ENV`.

## Optional: ESLint for `any` enforcement

The default scaffold's `astro/tsconfigs/strictest` already catches most SDK type-laundering, and `npx astro check` is the deploy-pipeline gate. ESLint is opt-in.

Add it when you want a hard CI gate against `any` and `as unknown as T` across team contributions. Two rules cover both leaks:

- `@typescript-eslint/no-explicit-any` for the literal `any` keyword
- `no-restricted-syntax` matching `TSAsExpression[expression.type="TSAsExpression"][expression.typeAnnotation.type="TSUnknownKeyword"]` for the double-cast (which `no-explicit-any` doesn't catch)

When the double-cast rule fires, the fix is one of: use the SDK's real type, intersect for genuine runtime drift (`X & { extraField?: T }` — e.g. `DonationCampaign.coverImage`, `Event.mainImage`, `Post.metrics` under specific fieldsets), or use a boundary helper like `getCmsImageUrl()`. `as unknown as` should never be the answer — every instance buries a real shape mismatch.

## Key Files

| File | Purpose |
|------|---------|
| `wix.config.json` | Contains `appId` and `siteId` — links local project to Wix |
| `astro.config.mjs` | Astro config with `wix()`, `wixPages()`, `react()` integrations |
| `.env.local` | Client ID, secret, public key, cloud provider setting |
| `.wix/topology.json` | Production URLs |

## CLI Commands

The scaffold's `package.json` already wires up `dev`, `build`, `preview`, `release`, and `generate` — see scripts there. `wix dev` (npm run dev) is the local hot-reload server; `wix preview` deploys a unique-URL preview; `wix release` publishes live.

## SDK Packages

Install per-feature (`@wix/data`, `@wix/members`, `@wix/stores`, `@wix/categories`, `@wix/blog`, `@wix/comments`, `@wix/ecom`, `@wix/redirects`, `@wix/donations`, `@wix/restaurants`, `@wix/table-reservations`, `@wix/bookings`, `@wix/events`, `@wix/pricing-plans`, `@wix/identity`, `@wix/seo`, `@wix/business-tools`).

Several apps (`@wix/table-reservations`, `@wix/restaurants`, parts of `@wix/bookings`, most newer features) need the corresponding Wix app installed on the site too — npm install alone leaves SDK calls returning `undefined` and REST calls returning a generic 404 HTML page. Use the Apps Installer API:

```javascript
// scripts/install-apps.mjs — idempotent (returns existing instance on re-run)
import { wixFetch, SITE_ID } from './lib/wix.mjs';

const APPS = [
  { name: 'Table Reservations', appDefId: 'f9c07de2-5341-40c6-b096-8eb39de391fb' },
  // Wix Stores: 215238eb-22a5-4c36-9e7b-e7c08025e04e
  // Wix Bookings: 13d21c63-b5ec-5912-8397-c3a5ddb27a97
  // Wix Restaurants Menus (New): b278a256-2757-4f19-9313-c05c783bec92
  // Wix Restaurants Orders (New): 9a5d83fd-8570-482e-81ab-cfa88942ee60
  // Wix Blog: 14bcded7-0066-7c35-14d7-466cb3f09103
  // Wix Events: 140603ad-af8d-84a5-2c80-a0f60cb47351
  // Wix Pricing Plans: 1522827f-c56c-a5c9-2ac9-00f9e6ae12d3
];
for (const app of APPS) {
  await wixFetch('/apps-installer-service/v1/app-instance/install', {
    method: 'POST',
    body: JSON.stringify({
      tenant: { tenantType: 'SITE', id: SITE_ID },
      appInstance: { appDefId: app.appDefId },
    }),
  });
}
```

To resolve an unknown app's `appDefId`: `POST /devcenter/app-market-listing/v1/market-listings/search` with `{ "searchTerm": "Wix Table Reservations" }`. Match on `basicInfo.name` to confirm before installing — the search returns many third-party apps with similar keywords.

## Dev Workflow Tips

### Viewing the dev server on a phone / remote device

`wix dev` binds to `localhost` only, so LAN access and tunnels are not available out of the box. Two things are needed:

1. **Run a tunnel.** Quickest option with no signup:
   ```bash
   brew install cloudflared
   cloudflared tunnel --url http://localhost:4321
   ```
   Prints a random `https://<slug>.trycloudflare.com` URL that forwards to your dev server.

2. **Allow the tunnel host in Vite.** The Astro/Vite dev server rejects requests with `Blocked request. This host ("<slug>.trycloudflare.com") is not allowed.` Add the hostname to `vite.server.allowedHosts` in `astro.config.mjs`:
   ```js
   vite: {
     server: {
       allowedHosts: [".trycloudflare.com"],
     },
   },
   ```
   A leading dot matches any subdomain, so the config survives new tunnel URLs. Restart the dev server after editing `astro.config.mjs` for the change to take effect.

### `data-island_submit_button_registered` hydration warning

If React 19 logs `Warning: Extra attributes from the server: data-island_submit_button_registered` on `<button>` inside a `client:load` island, add `suppressHydrationWarning` on that button. Wix's framework injects the attribute server-side for analytics; the client render doesn't, so React flags the mismatch. The attribute is harmless and the button still works.

```tsx
<button onClick={...} suppressHydrationWarning>
  Click me
</button>
```

Apply per-button (tab bars, submit buttons, qty steppers) — never globally. `suppressHydrationWarning` silences only attribute mismatches on that one element, not children/text mismatches.

⛔ **Only on React JSX inside `.tsx` files.** `suppressHydrationWarning` is a React-specific prop, not an HTML attribute. Putting it on an Astro `<button>` inside an Astro template fails `astro check` with `Property 'suppressHydrationWarning' does not exist on type 'ButtonHTMLAttributes'`. Astro template elements never hydrate (they're SSR-only HTML), so they have nothing to suppress. If you want a button-handled-by-inline-`<script>` on an Astro page, the inline script just runs against the SSR'd DOM — no warning to suppress in the first place.

### Excluding a file from Astro routing

Files whose name starts with `_` under `src/pages/` are **not** routed — useful for shared components or ad-hoc helpers. If a temporary seeding/admin endpoint needs to be reachable, don't prefix it with `_`. Conversely, prefix one-off dev endpoints with `_` to keep them out of the route table without deleting the file.

## Translations Setup

⛔ **Skip this section for single-language sites.** See [TRANSLATIONS_STATIC.md → When to introduce translations at all](TRANSLATIONS_STATIC.md#when-to-introduce-translations-at-all). The default `astro.config.mjs` uses `wix()` (no translation flags), no `src/translations.json` exists, and snippets get their `t('key')` calls substituted with literal English values during copy.

When the site needs a second language, enable in `astro.config.mjs`:
```js
wix({ essentials: true, translations: true })
```

Without these flags, `i18n.getTranslationFunction()` throws `"Host translation resources are not available"` at runtime — which is why single-language sites don't enable them at all.

**Required files** (build fails without all three when `translations: true`):
1. `src/translations.json` — flat key-value pairs
2. `.wix/multilingual/metadata.json` — must contain `{"primaryLanguageCode": "en"}`
3. `.wix/multilingual/translations/` — directory must exist (can be empty for single-language)

**Git**: The scaffold gitignores `.wix/` entirely. Add `!.wix/multilingual/` to `.gitignore` so metadata and translations are committed.
