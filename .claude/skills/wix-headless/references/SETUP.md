# Project Setup & Scaffolding

## Build order — code first, seeding last, images last within seeding

When generating a new site, the order you do things in directly affects how long the build takes and how often you have to redo work. Two rules, in priority order:

1. **Build all the code before seeding any data.** Write every page, component, route, layout, and translation first. Run `npx astro check` and get to a clean build with empty (or near-empty) data. Only then seed the business data. The code tells you exactly what the data needs to look like — its shape, its fields, what images it references. If you seed first, every iteration on the code risks invalidating the data (renamed fields, changed collections, different media keys) and you re-seed from scratch. The worst version of this is "write half the code, seed, write the other half" — the second half almost always changes the data contract.

2. **Within seeding: create all the data first, then add images at the very end.** Run through every `createX` call (products, services, plans, campaigns, posts, collection items) with a placeholder image or no image at all. Only after every record exists, loop back and generate/attach images in a second pass. The reasons:
   - **Image generation is the slow part.** A single Runware call is seconds; dozens of them serially is minutes. Decoupling lets you parallelise the image pass without it blocking data creation.
   - **You'll want to iterate on images.** A product might get renamed, a campaign's tone might change — regenerating images is cheap if images are a separate pass; expensive if they're baked into each create call that also does 10 other things.
   - **Image uploads fail differently than data writes.** If a record already exists, an image retry is a clean PATCH; if it's part of the create call, a Runware hiccup leaves you with a half-created record you have to clean up.

   **Exception — add images inline when there's a real benefit.** If attaching the image later costs significantly more than attaching it during create (e.g. the SDK requires the image to be set before another field will accept its value, or the "add image" path goes through a slower/weirder API than the "create with image" path), do it inline for that entity. The rule is "images last by default," not "images last absolutely." If you're making the exception, note why in the seeding script so the next reader doesn't revert it.

Both rules apply even when the user asks for "a quick site" — they're not process overhead, they're what makes generation fast.

## Scaffolding a New Project

Before scaffolding, list the working directory to check for existing folders and pick a `--project-name` that doesn't conflict.

**Non-interactive (preferred):**
```bash
npm create @wix/new@latest headless -- \
  --business-name "My Business" \
  --project-name myfolder \
  --site-template-id 212b41cb-0da6-4401-9c72-7c579e6477a2
```

| Flag | Description |
|------|-------------|
| `--business-name` | Name shown in your Wix sites list |
| `--project-name` | Local directory name (3-20 chars, lowercase letters and numbers only — rename after creation if needed) |
| `--site-template-id` | Template UUID |

**Interactive:**
```bash
npm create @wix/new@latest headless
```

The scaffold creates an **Astro** project with Wix integrations pre-configured.

## Post-Scaffold: Upgrade @wix/essentials

⛔ **Breaks at runtime** — The scaffold ships `@wix/essentials` ~0.1.x which does NOT have `i18n.getTranslationFunction()`. This causes a runtime `TypeError` that build does NOT catch.

```bash
npm install @wix/essentials@latest
npm install --save-dev @types/node
```

You must upgrade to >= 1.0.6 before using translations. Install `@types/node` because the scaffold's `astro.config.mjs` uses `process.env.NODE_ENV` — without it, `npx astro check` reports a type error.

## Post-Scaffold: Set Up ESLint Type-Safety Rules

⛔ **Do this immediately after scaffolding every new project, before writing any application code.** Two rules together prevent the most common forms of SDK-type laundering — `any` and `as unknown as T`. The `no-explicit-any` rule alone is not enough: `as unknown as` is the more common escape hatch, and ESLint won't catch it without an explicit `no-restricted-syntax` rule. Set both up at once.

**Install:**
```bash
npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-astro
```

**Create `eslint.config.mjs`:**
```js
import eslintPluginAstro from 'eslint-plugin-astro';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

// Shared rules — applied to both .ts/.tsx and Astro frontmatter.
const sharedRules = {
  '@typescript-eslint/no-explicit-any': 'error',
  'no-restricted-syntax': [
    'error',
    {
      // Bans `x as unknown as T` (the standard double-cast laundering)
      selector:
        'TSAsExpression[expression.type="TSAsExpression"][expression.typeAnnotation.type="TSUnknownKeyword"]',
      message:
        'Do not launder SDK types with `as unknown as T`. Use the real SDK type, intersect (`X & { extraField?: Y }`) for runtime drift, or fix the underlying type mismatch.',
    },
    {
      // Bans `<unknown>x as T` (the angle-bracket form of the same thing)
      selector:
        'TSAsExpression[expression.type="TSTypeAssertion"][expression.typeAnnotation.type="TSUnknownKeyword"]',
      message:
        'Do not launder SDK types with `<unknown>x as T`. Use the real SDK type or intersect for runtime drift.',
    },
  ],
};

export default [
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: sharedRules,
  },
  ...eslintPluginAstro.configs.recommended.map(config => ({
    ...config,
    ...(config.files?.[0]?.includes('astro') ? {
      plugins: {
        ...config.plugins,
        '@typescript-eslint': tseslint,
      },
      rules: {
        ...config.rules,
        ...sharedRules,
      },
    } : {}),
  })),
];
```

**Add scripts to `package.json`:**
```json
{
  "scripts": {
    "lint": "eslint src/",
    "check": "npx astro check && eslint src/"
  }
}
```

Now `npm run check` is the single command that catches type errors, explicit `any` usage, AND `as unknown as T` laundering.

### Why `as unknown as T` needs its own rule

`@typescript-eslint/no-explicit-any` only catches the literal `any` keyword. The much more common escape hatch is the double cast:

```typescript
// Both lanes are the SAME violation in spirit — but only the first is caught
// by no-explicit-any. The second sails through every default ESLint rule.
const items: MyShape[] = sdkResult.items as any;          // ❌ caught
const items: MyShape[] = sdkResult.items as unknown as MyShape[];  // ❌ NOT caught by default
```

In practice the double-cast pattern is what shows up in agent-generated code — it silences the type checker cleanly enough to feel safe, while completely erasing the SDK type and any future type-drift signals. The `no-restricted-syntax` rule above closes that loophole at lint time.

### Right replacements for `as unknown as T`

When the rule fires, the fix is almost always one of:

1. **Use the real SDK type.** `result.items as Department[]` (single cast, allowed) when `Department extends WixDataItem`.
2. **Intersect for runtime drift.** When the SDK type genuinely lacks a field that runtime returns: `type Widened = SdkType & { extraField?: T }`. Use this for things like `DonationCampaign.coverImage` (typed `string`, returned as object) or `Event.mainImage` (same pattern).
3. **Use the existing boundary helper.** `getCmsImageUrl(input: unknown)` already accepts the messy SDK→REST shape variation for image fields — pass the field through it instead of widening at the call site.
4. **Fix the underlying type contract.** If the SDK type is just wrong and you control the file, file an upstream issue and add the intersection in the meantime.

Never reach for `as unknown as` to "make TypeScript happy" — every instance buries a real shape mismatch that will surface as a runtime crash or silent feature gap when locale switches, when a field is renamed, or when a sibling SDK call returns an unexpected variant.

## Key Files

| File | Purpose |
|------|---------|
| `wix.config.json` | Contains `appId` and `siteId` — links local project to Wix |
| `astro.config.mjs` | Astro config with `wix()`, `wixPages()`, `react()` integrations |
| `.env.local` | Client ID, secret, public key, cloud provider setting |
| `.wix/topology.json` | Production URLs |

## CLI Commands

```bash
npm run dev        # wix dev — local dev server with hot reload
npm run build      # wix build — production build
npm run preview    # wix preview — deploy a preview (unique URL each time)
npm run release    # wix release — deploy to production
npm run generate   # wix generate — code generation
```

## SDK Packages

Install only what you need:

```bash
npm install @wix/data        # CMS data operations
npm install @wix/members     # Members API
npm install @wix/stores      # Stores API (products, NOT categories)
npm install @wix/categories  # Categories API (for store categories)
npm install @wix/blog        # Blog API
npm install @wix/comments    # Comments API
npm install @wix/ecom        # Cart, checkout, orders
npm install @wix/redirects   # Redirect sessions (checkout, plans)
npm install @wix/donations   # Donation campaigns
npm install @wix/restaurants            # Menus, Online Ordering (requires app install)
npm install @wix/table-reservations     # Reservations (requires app install)
npm install @wix/bookings               # Services, staff, slots
```

⛔ **Some SDK packages require a corresponding Wix app install on the site.** The CLI starter only installs a minimal set; adding the npm package isn't enough. If REST calls return `404` (Wix error HTML page) and SDK calls silently return `undefined`, the app probably isn't installed. Affected packages include `@wix/table-reservations`, `@wix/restaurants`, parts of `@wix/bookings`, plus most newer features. Use the **Apps Installer API**:

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

### Silencing `data-island_submit_button_registered` hydration warnings

⛔ **React 19 logs `Warning: Extra attributes from the server: data-island_submit_button_registered` on every `<button>` inside a `client:load` island.** Wix's headless framework injects this attribute server-side to register form/CTA buttons for analytics, but the client React render doesn't reproduce it — every mount of a hydrated component with `<button>` triggers a noisy warning in dev. The button still works; the attribute is harmless. Suppress it on the offending buttons:

```tsx
<button onClick={...} suppressHydrationWarning>
  Click me
</button>
```

`suppressHydrationWarning` only silences attribute mismatches on that one element — it does NOT mask actual children/text mismatches. Apply it to every button in interactive islands (tab bars, submit buttons, qty steppers) — never globally. The warning is purely cosmetic, but a console full of them hides real warnings; clean it up at component-creation time, not as a debugging step later.

### Excluding a file from Astro routing

Files whose name starts with `_` under `src/pages/` are **not** routed — useful for shared components or ad-hoc helpers. If a temporary seeding/admin endpoint needs to be reachable, don't prefix it with `_`. Conversely, prefix one-off dev endpoints with `_` to keep them out of the route table without deleting the file.

## Translations Setup

Enable in `astro.config.mjs`:
```js
wix({ essentials: true, translations: true })
```

Without these flags, `i18n.getTranslationFunction()` throws `"Host translation resources are not available"` at runtime.

**Required files** (build fails without all three when `translations: true`):
1. `src/translations.json` — flat key-value pairs
2. `.wix/multilingual/metadata.json` — must contain `{"primaryLanguageCode": "en"}`
3. `.wix/multilingual/translations/` — directory must exist (can be empty for single-language)

**Git**: The scaffold gitignores `.wix/` entirely. Add `!.wix/multilingual/` to `.gitignore` so metadata and translations are committed.
