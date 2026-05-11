# Deployment

## Preview vs Release — When to Use Each

The right command depends on where you are in the project lifecycle.

| Command | When | Effect |
|---------|------|--------|
| `npm run release` | **Initial generation only** — the first build that ships the user's requested pages | Publishes to the public site URL. Visible to all visitors. Required for features bound to the published origin (change-password, change-email via `loginV2`). |
| `npm run preview` | **All iterations after initial generation** — edits, fixes, feature additions, content updates | Deploys to a unique preview URL (new URL each run). Safe — does not touch the public site. |
| `npm run release` (iteration) | **Only when the user explicitly asks to "release", "publish", or "deploy live"** during iteration | Republishes to the public site URL. |

### Initial generation

When you finish the first build of a new site, run `npm run release` directly — do not stop at preview. The user expects a working live URL at the end of the first build.

### Iterations

For any change after the initial generation, default to `npm run preview`. A preview URL is reversible, free, and lets the user inspect before committing. Only run `npm run release` when the user explicitly asks to release/publish/deploy live.

💡 **You may proactively suggest releasing** once an iteration is complete and tested — e.g., "The changes look good in preview. Want me to release them?" — but wait for a yes before running `npm run release` during iteration.

## First-Time Generation: Release + Report Live URL + Dashboard URL

When you complete the **initial generation** of a Wix headless site (the first build that ships all the user's requested pages):

1. Run `npm run release` — not `npm run preview`. See the "Preview vs Release" table above for why.
2. Surface exactly two URLs to the user:
    - **Live site URL** — from the `release` output (or `.wix/topology.json` / `wix.config.json`). This is the public URL visitors see.
    - **Dashboard URL** — `https://manage.wix.com/dashboard/<siteId>` (siteId from `wix.config.json`). Where the user manages products, bookings, members, content, etc.

Do NOT report a preview URL on initial generation — it supersedes the live URL and confuses the handoff.

**Why both URLs:** The user needs the live URL to inspect the site, and the dashboard URL to manage business data (add products, approve comments, etc.).

## Subsequent Updates

For every change after the initial generation:

1. Default to `npm run preview` — emits a fresh preview URL; share that.
2. Do not repeat the dashboard URL unless the user asks — they already have it from the first handoff.
3. Only run `npm run release` on explicit user request. When release runs, share the live URL (not the preview URL).

## The 4-Step Deploy Sequence

All four steps are mandatory, in this order. Do not skip any.

```bash
# Step 1: Type check (catches type errors that Vite ignores)
npx astro check

# Step 2: Build — MANDATORY. `wix release` does NOT rebuild.
npm run build

# Step 3: Commit
git add <files> && git commit -m "description of changes"

# Step 4: Deploy
# - Initial generation of a new site: npm run release  (publish live)
# - Iterations after initial generation: npm run preview  (unless user explicitly asks to release)
npm run release   # OR: npm run preview — see "Preview vs Release" above for which one
```

⛔ **`wix release` / `wix preview` do NOT build.** They upload whatever is currently in `dist/`. If you've edited any file in `src/` (a page, a component, a translation, anything) and skipped `npm run build`, the deploy ships the previous build and your changes are invisible on the live site — silently. The output of `wix release` looks identical whether the build is fresh or stale; only `dist/` mtime tells you.

Always run `npm run build` between any `src/` edit and any `wix release` / `wix preview` / `npx wix release`. If you've changed nothing in `src/` and you're re-shipping the existing build (e.g. publishing a preview as live), you can skip the rebuild — but when in doubt, rebuild.

### Why all steps matter

`npm run build` uses Vite which does **not** do strict type checking — it bundles `any`-typed code without complaint. `npx astro check` is the type-checking gate.

⛔ **Never use `any` to silence type errors.** When `astro check` reports a type error, fix the code to match the SDK types — don't cast to `any`, `any[]`, or `as any`. A type error is a bug report: the code is accessing a field that doesn't exist, which will crash at runtime. The default scaffold's `tsconfig.json` extends `astro/tsconfigs/strictest`, which is strict enough to catch most of these. ESLint with `@typescript-eslint/no-explicit-any` is an optional extra layer — see [SETUP.md](SETUP.md) → "Optional: ESLint for `any` enforcement" — but it's not required for the deploy pipeline.

Skipping step 1 has repeatedly led to deploying broken code — for example, accessing `cat._id` when the REST API returns `cat.id`, or using V1 field paths on a V3 catalog. These errors are invisible to Vite but crash at runtime.

Install `@astrojs/check` if not present.

⛔ Use `npx astro check`, **not** `tsc --noEmit`. `tsc` does not check `.astro` files at all.

## What `astro check` Catches

- Wrong field names from REST responses vs SDK responses (e.g., `.id` vs `._id`)
- Wrong method signatures (e.g., `searchOrders` takes `OrderSearch` directly, not `{ search: OrderSearch }`)
- Wrong return shapes (e.g., `createCheckoutFromCurrentCart` returns `{ checkoutId }`, not `{ _id }`)
- Missing properties on types
- Type mismatches in Astro template expressions

## What `astro check` Does NOT Catch

⚠️ **Rendering SDK objects in Astro templates.** Astro allows `{expr}` where `expr` is any value — including objects. It silently calls `.toString()` producing `[object Object]`. Neither `astro check`, `tsc`, nor ESLint flags this. React JSX would reject objects as children, but Astro does not.

**You must manually ensure** that every `{expr}` in Astro templates resolves to a string or number — never an SDK object. Always access the primitive field: `{product.ribbon.name}` not `{product.ribbon}`, `{price.amount}` not `{price}`. See [SDK_CORE.md](SDK_CORE.md) → "Never render SDK objects directly in Astro templates" for the full list of common object fields.
