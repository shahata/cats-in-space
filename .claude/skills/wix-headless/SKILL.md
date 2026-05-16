---
name: wix-headless
description: "Use when building or working on Wix managed headless projects — Astro sites powered by the Wix SDK. Covers the full stack: project scaffolding, SDK integration patterns, eCommerce (Stores, cart, checkout, orders), Blog (posts, comments, likes), Bookings, Pricing Plans, Gift Cards, Restaurants, Events (conferences, festivals, classes, screenings, workshops, performances), CMS collections, member dashboard, multilingual/i18n/RTL, media handling, authentication, and deployment. Also use when the user mentions Wix headless, Wix Astro, Wix SDK, Wix CMS, or any Wix business feature in a headless context."
---

# Wix Managed Headless — Developer Guide

This is a routing document. Read the relevant reference guides for implementation details — do not build from memory alone.

---

## How to Use This Skill

1. **Read the feature parity guide and feature checklists below** to understand everything a complete implementation requires
2. **Create tasks for EVERY checklist item** before writing any code — including data seeding steps
3. **Read the relevant reference guides** (linked below) for each feature area
4. **After building, re-read the checklist** line by line and verify every item is implemented

### Work in parallel — don't write the site one file at a time

A Wix headless site is dozens of mostly-independent files: util modules, the Layout, the Nav, multiple page templates, multiple React islands for cart / member tabs / product actions, an API route or two, `translations.json`. Writing them serially with one `Write` tool call per turn turns a 5-minute generation into a 25-minute one.

**Reading phase — load references in parallel.** Before writing code, identify which reference files are actually load-bearing (typically: SETUP, the feature areas the user asked for, SDK_CORE for type conventions, DEPLOYMENT) and `Read` them in a single message with multiple parallel tool calls. Don't read "just in case" — that's how 12 reference reads sneak in.

**Writing phase — batch independent files per turn.** Once you know the file plan, write 3–6 files per message using parallel `Write` tool calls whenever the files don't depend on each other's contents. Examples of safe parallel batches:
- All `src/utils/*.ts` helpers (image, format, appIds, redirects, site, useCart, …) — pure modules, no inter-file references beyond imports
- Multiple sibling page templates (`/store/index.astro`, `/store/[slug].astro`, `/store/cart.astro`, `/store/thank-you.astro`) once the shared Layout + utils exist
- A page template plus the React island it embeds (e.g. `/member/index.astro` plus `MemberTabs.tsx`, `ProfileEditor.tsx`, `PersonalInfoEditor.tsx`, `AccountEditor.tsx`) — the page imports the islands but the islands don't depend on each other

Sequential writes are only justified when a later file needs to see the *exact* contents of an earlier one (rare — usually the prop shape is settled by the page that consumes the island, and you can write both in the same turn with that shape pre-decided). When in doubt, decide on the prop shape up-front and write the page + the island together.

**Probing phase — grep/probe in parallel too.** When investigating an SDK type drift (the gotchas in [SDK_CORE.md](references/SDK_CORE.md#sdk-gotchas--quick-reference) are not exhaustive), run multiple `grep`/`Read` calls against the typings in a single message rather than one at a time.

---

## Snippets — copy first, ask questions later

`snippets/` contains verified, type-checked files for the patterns that repeat across every Wix headless site. **Copy from there in parallel via Bash `cp` instead of re-writing the file with the `Write` tool** — a dozen identical files is a dozen tool calls saved, and the snippets have already passed `astro check`.

| Bucket | Use when |
|---|---|
| [`snippets/universal/`](snippets/universal/) | Every Wix headless site — utils, Layout, Nav, CartSidebar, CartPage, member-area components, profile-photo endpoint |
| [`snippets/store/`](snippets/store/) | Sites with Wix Stores — ProductActions, store listing, [slug] detail, cart route, thank-you page |

See [`snippets/README.md`](snippets/README.md) for the full file index, copy commands, and per-file customization points (brand strings, route paths, copy to swap per site).

The references below explain *why* — read once, then copy the snippet and stop re-deriving.

## Reference Guide Index

Read the guide that matches your current task. Each guide is self-contained with setup, patterns, code examples, and gotchas.

### Foundation (read these first for any new project)
| Guide | When to read |
|-------|-------------|
| [SETUP.md](references/SETUP.md) | Scaffolding, key files, CLI commands, SDK packages, translations setup |
| [FEATURE_PARITY_CHECKLIST.md](references/FEATURE_PARITY_CHECKLIST.md) | Generic Wix integration richness checklist. Read before selecting feature docs for a new site or auditing generated output |
| [SDK_CORE.md](references/SDK_CORE.md) | Astro+Wix SDK integration, data queries, CMS collections, field types, TypeScript conventions, SDK gotchas |
| [MEDIA.md](references/MEDIA.md) | `wix:image://` conversion, media helpers, image/video generation (Runware), upload workflow |
| [SEO.md](references/SEO.md) | SEO tags for dynamic pages — `resolveItemSeoTags`, `seoData`, Layout rendering |
| [DEPLOYMENT.md](references/DEPLOYMENT.md) | The 3-step deploy sequence (`astro check` → `build` → `preview/release`) |
| [AUTHENTICATION.md](references/AUTHENTICATION.md) | Login/logout endpoints, member detection, profile management, file upload |

### Feature Areas
| Guide | When to read |
|-------|-------------|
| [HOMEPAGE_LAYOUT.md](references/HOMEPAGE_LAYOUT.md) | Layout structure, RTL, CSS variables, navigation, cart sidebar, homepage sections |
| [CMS_DATA_PAGES.md](references/CMS_DATA_PAGES.md) | Listing and detail page patterns for CMS collections |
| [ECOMMERCE.md](references/ECOMMERCE.md) | Store listing, product detail, cart, checkout, back-in-stock, member orders |
| [ECOMMERCE_V3.md](references/ECOMMERCE_V3.md) | V3 catalog field mapping, variants, options, modifiers, code examples |
| [PRODUCT_SEEDING.md](references/PRODUCT_SEEDING.md) | 9-step product seeding workflow (images → categories → products → options → info sections) |
| [ECOMMERCE_V1.md](references/ECOMMERCE_V1.md) | Legacy V1 catalog patterns |
| [BLOG_POSTS.md](references/BLOG_POSTS.md) | Posts, tags, writers, rich content (Ricos), premium/paid content |
| [BLOG_ENGAGEMENT.md](references/BLOG_ENGAGEMENT.md) | Likes, comments, replies, views, metrics |
| [BOOKINGS.md](references/BOOKINGS.md) | Services, staff, availability, booking flow |
| [PRICING_PLANS.md](references/PRICING_PLANS.md) | Plans listing, checkout flow, subscriptions |
| [GIFT_CARDS.md](references/GIFT_CARDS.md) | Gift card products, purchase flow, checkout integration |
| [DONATIONS.md](references/DONATIONS.md) | Donation campaigns, cover image import, cart/checkout with `catalogReference`, donor notes via `buyerNote` |
| [EVENTS.md](references/EVENTS.md) | Ticketed events of any kind (conferences, festivals, classes, screenings, performances) — recurring series, ticket definitions, hosted checkout |
| [RESTAURANTS.md](references/RESTAURANTS.md) | Menus, items, modifiers, table reservations, online ordering |
| [MEMBER_AREA.md](references/MEMBER_AREA.md) | Protected routes, tabbed dashboard, profile, orders, subscriptions, payment |
| [SEARCH.md](references/SEARCH.md) | Site-wide search across all content types via `@wix/search` (federated search) — Wix Site Search app install, doc type strings, URL rewriting from Wix routes to Astro routes |
| [EXTENSIONS.md](references/EXTENSIONS.md) | Backend event listeners (webhooks) and dashboard pages registered via `src/extensions.ts` — `export default` requirement, auth context, backoffice/admin UIs with WDS, `dashboard.openMediaManager`, multi-reference write patterns |
| [TRANSLATIONS_STATIC.md](references/TRANSLATIONS_STATIC.md) | `t()` function, interpolation, RTL, language switcher, locale-aware links |
| [TRANSLATIONS_CONTENT_API.md](references/TRANSLATIONS_CONTENT_API.md) | Translating dynamic business data (products, services, blog posts, CMS) via API |

---

## Cross-Cutting Rules

These apply to every feature area.

Before applying the rules below, cross-check [FEATURE_PARITY_CHECKLIST.md](references/FEATURE_PARITY_CHECKLIST.md) for the feature set you are building or auditing. A complete flow includes listing, detail, interaction, checkout/confirmation, thank-you state, and member-dashboard follow-up where the Wix API supports it.

1. **Media conversion is mandatory** — Convert every `wix:image://` / `wix:video://` SDK string through `getImageUrl()` / `getVideoUrl()` before rendering. See [MEDIA.md](references/MEDIA.md).

2. **Type check before deploying** — Run `npx astro check` (not `tsc`) before every build. See [DEPLOYMENT.md](references/DEPLOYMENT.md).

3. **Translations enter only when a second language is added — not at initial generation.** Single-language sites use plain inline strings in templates (`<a href="/">Home</a>`), not `t('nav.home')` calls. Do not enable `translations: true` in `astro.config.mjs`, do not create `src/translations.json`, do not create `.wix/multilingual/`. The snippets in this skill use `t('group.key')` calls as templates — when copying them, substitute each call with its literal English value from `snippets/translations.starter.json` and remove the now-unused `import { i18n }` lines. When the user later asks to add a second language, run the migration recipe in [TRANSLATIONS_STATIC.md → Going Multilingual](references/TRANSLATIONS_STATIC.md#going-multilingual-extracting-strings-to-t-calls). Adding the i18n apparatus speculatively is the #1 source of silent missing-key regressions; the migration is mechanical when it's actually needed.

4. **Use SDK types** — Import from SDK packages (`cart.LineItem`, `productsV3.ProductMedia`). `any` and `as unknown as T` are both banned; for genuine type drift, intersect with `X & { extraField?: T }`. See [SDK_CORE.md → TypeScript Conventions](references/SDK_CORE.md#typescript-conventions).

5. **Use the `frontend-design` skill for styling** — Invoke `frontend-design` for all page layouts. Avoid generic system fonts and default colors.

6. **Use built-in placeholders during seeding; bespoke AI images come last (and only on opt-in).** Every Wix headless site needs visuals from the first release. Bespoke AI image generation stretches initial-build wall time by minutes and produces images the user often wants to redo anyway. The skill ships 10 neutral, editorial-quality placeholder PNGs at `~/.claude/skills/wix-headless/snippets/placeholder-images/` covering every entity type with an image field (apparel, object, dish, event, plan, donation, service, blog, category, avatar). Use `uploadPlaceholder(state, kind)` from `seed/lib/images.mjs` during the seed — it picks the right placeholder per entity, uploads once via the Wix Media `generate-upload-url` flow, and caches the result in `state.images[__placeholder:<kind>]` so the same upload is reused across every entity of that kind. After the initial release lands, **ask the user** whether to swap placeholders for bespoke AI images via Runware/DALL-E (which then becomes a separate `generateAndImport` pass). See [MEDIA.md](references/MEDIA.md) and [PRODUCT_SEEDING.md](references/PRODUCT_SEEDING.md).

7. **Add SEO tags to every dynamic page** — Use `resolveItemSeoTags()` from `@wix/seo` for supported item types (`STORES_PRODUCT`, `BOOKINGS_SERVICE`, `STORES_CATEGORY`). For blog posts, request the `'SEO'` fieldset and pass `post.seoData.tags`. Pass the `seoTags` array to the Layout component. Import the `Tag` type from `@wix/seo` — never define custom SEO tag interfaces. See [SEO.md](references/SEO.md).

8. **Release on initial generation, preview on iterations — and ALWAYS `npm run build` first.** Two parts:
    - **Always rebuild before deploying.** `wix release` / `wix preview` do not run the build — they upload whatever is currently in `dist/`. After ANY `src/` edit (page, component, translation, anything), run `npm run build` before `npm run release` / `npm run preview`. The deploy output looks identical whether the bundle is fresh or stale; only `dist/` mtime tells you. Symptom of skipping: live site continues showing the previous build (missing translation keys, missing styles, etc.) even though the deploy "succeeded." See [DEPLOYMENT.md](references/DEPLOYMENT.md) → "The 4-Step Deploy Sequence".
    - **Initial generation (first-time build of a site):** run `npm run build && npm run release` to publish the site live. Do NOT stop at preview — the user expects a working live URL at the end of the first build.
    - **Subsequent iterations (edits, fixes, additions after the initial build):** run `npm run build && npm run preview` by default. Only run `npm run release` when the user explicitly asks to "release", "publish", or "deploy live". You may proactively *suggest* releasing, but wait for confirmation.

9. **Report URLs after the parallel code+seed build, then ask about bespoke images.** When the parallel code-gen + seeding both finish and `npm run release` succeeds, surface exactly two URLs: (a) the **live site URL** showing the seeded catalog with placeholder visuals; (b) the dashboard URL (`https://manage.wix.com/dashboard/<siteId>`). The site is fully functional at this point — every page, every flow, real custom data, generic-but-aesthetic placeholder images. Immediately after reporting, **ask the user whether to swap placeholders for bespoke AI images** per rule 6 — do not auto-generate. On subsequent iterations, report the new preview URL only. See [DEPLOYMENT.md](references/DEPLOYMENT.md).

10. **Build order: scaffold → install apps → parallelize (code + seed) → release → ask about bespoke images.** For a new site:
    1. **Scaffold and install Wix apps.** Run `npm create @wix/new@latest headless` and `node scripts/install-apps.mjs <features>` — these are prerequisites for both branches below. Read `wix.config.json` for the `siteId`.
    2. **Decide the seed spec.** Either work it out with the user upfront, or pick a reasonable default based on the requested feature set. Write `seed/catalog.mjs` against the data shape your seed orchestrator expects.
    3. **Run code generation and seeding in parallel.** They share zero state — seeding hits Wix REST APIs over the network; code generation is local file writes + `astro check`. Use the `Agent` tool with `run_in_background: true` to dispatch the seed work, then continue with code in the foreground:
       - **Background subagent (seed)** — runs `node seed/seed.mjs` which calls `uploadPlaceholder(state, kind)` for every entity image. No AI calls. Idempotent + state-cached so it can re-run safely.
       - **Main agent (code)** — install npm packages (one batch per the snippets README), copy snippets, customize brand (translations, Layout, Nav, Footer, homepage), pass `npx astro check`.
    4. Wait for both. Verify the seed completed (the agent reports counts) and the code is clean.
    5. Run `npm run release` once — the live site comes up with the storefront + seeded catalog + placeholders already in place.
    6. Report URLs (rule 9). Ask about bespoke images (rule 6). If the user opts in, run a second pass that generates bespoke images via `generateAndImport(state, slug, prompt, displayName)` and PATCHes the result onto each entity (`media.itemsInfo.items` for products, `coverImage` for campaigns, etc.).

    Why this beats the old sequential flow: it saves a full release cycle and a user-confirmation round-trip. The old "release with samples → ask → seed → re-release" path paid that round-trip just to verify the storefront — but the storefront is verifiable against seeded data + placeholders just as well. See [SETUP.md](references/SETUP.md) → "Build order".

11. **Every `redirects.createRedirectSession` flow needs a dedicated thank-you page**, not a member-tab anchor (`/member#orders` and similar). Use the `checkoutCallbacks()` helper in `src/utils/redirects.ts` to centralise paths. The single exception is `/member#bookings` for Wix Bookings. See [ECOMMERCE.md → Redirect callbacks](references/ECOMMERCE.md#redirect-callbacks-always-pass-all-of-them).

12. **Translatable SDK fields (`name`, `title`, `displayName`, `description`, `tagLine`, `optionChoiceNames`, …) are display-only** — never key state, lookup maps, React `key={}`, or `find()` predicates by them. Use the entity's `key` (or `_id` where the API forces UUIDs, like V3 variant matching). See [ECOMMERCE_V3.md → Translatable fields are display-only](references/ECOMMERCE_V3.md#translatable-fields-are-display-only--never-use-them-as-identifiers).

    **One exception:** Wix Events has no per-series ticket entity — picker state across recurring siblings has to key by `td.name` since `_id`s change per occurrence. See [EVENTS.md](references/EVENTS.md).

13. **NEVER `Write` over a snippet to "theme" it — `Edit` only.** This is the rule most easily violated in flow: the snippet ships with a space-cats / cinema / restaurant aesthetic that feels far from the target brand, and the reflex is to write a fresh file. **That reflex is wrong, every time, for these files:** `src/layouts/Layout.astro`, `src/components/Nav.astro`, `src/components/Footer.astro`, `src/components/CartSidebar.tsx`, `src/components/CartPage.tsx`, `src/pages/store/index.astro`, `src/pages/store/[slug].astro`, `src/components/ProductActions.tsx`, `src/pages/member/index.astro`, `src/translations.json`. Each is 300–1000 lines; the brand-customization surface is ~5–25 lines.

    **Pre-Write mental checklist — required before calling `Write` on any file in the list above:**
    1. Open the [per-snippet customization-point manifest in `snippets/README.md`](snippets/README.md#per-snippet-customization-point-manifest) and find the row for this file.
    2. Enumerate the *specific lines or blocks* that need to change for this site (brand strings, link arrays, CSS variables in `:root`, Google Fonts `<link>`, hero copy). If you can't write that list in one sentence per change, you don't yet understand the snippet well enough to replace it — `Read` it instead.
    3. If every change is in the manifest's "Edit targets" column, the answer is `Edit`, not `Write`. The "Don't touch" column lists infrastructure (cart-sidebar `.cs-*` styles, dropdown JS, hash-tab activation script, mobile breakpoints, RTL caret swap, SEO render, member-tab routing) that re-theme automatically via the design tokens — replacing them re-derives correct code at minutes-of-wall-time cost with no net change.
    4. If a change is genuinely outside the manifest (e.g. the cart-sidebar shape language genuinely doesn't fit), replace **only that `<style>` block** via the `frontend-design` skill — keep the markup, JS, and SDK calls. Never replace the whole file to get a different style block.

    **Two layers, two rules:**
    - **Load-bearing code (markup, JS, SDK calls, SEO, cart dispatch, hash-tab routing, mobile toggle, RTL): immutable.** Targeted `Edit` calls only — link arrays, brand strings, hero copy, route lists, eyebrow text.
    - **Design tokens (`:root` in `Layout.astro`): edit freely.** Layout exposes COLOR tokens (`--accent`, `--bg-*`, `--text-*`, `--border-*`, `--accent-glow`, `--danger`, `--success`) and SHAPE tokens (`--radius-card`, `--radius-control`, `--radius-chip`, `--radius-pill`, `--shadow-floating`). The cart sidebar's `.cs-*` styles and the global `.badge` read from these — set the tokens, the components re-theme automatically (color AND shape).
    - **`<style>` blocks at end of page templates: `frontend-design`-replaceable, scoped to one block.** When the snippet's shape language doesn't fit (sharp/industrial vs rounded/glowy, glassy panels, denser layout), invoke `frontend-design` on the `<style>` block alone — the markup, JS, and SDK calls stay untouched.

    **Working example — a florist site starting from the space-cats Layout:** edit ~25 lines total across `Layout.astro` (the `:root` palette: `--accent: #5d6b4a` sage / `--accent-yellow: #c87b75` rose / cream `--bg-*` / charcoal `--text-*`; swap the Google Fonts `<link>` to Cormorant Garamond + Inter; swap `--font-*` token values). The cart sidebar, dropdown menus, badges, and global controls all re-theme automatically. Nav and Footer get `Edit` calls on the link arrays + brand name span — under 10 lines each. `Write` on these files is a self-inflicted minutes-long delay.

    Same principle for `src/translations.json` when a multilingual build does need it (per rule 3): start from `snippets/translations.starter.json`, edit only the brand-voice keys (`home.*`, `nav.*`, `footer.*`, a handful of `member.*`/`store.*`) — every other group is infrastructure copy the snippets reference verbatim. A full rewrite re-derives 200+ keys; the brand subset is ~20.

    **Justified exceptions** — these files don't have snippet equivalents and ARE written fresh: `src/pages/index.astro` (homepage is per-site by design). The member dashboard pruning of `{FEATURE:*}` blocks is `Edit`, not `Write` — block-delete each marker pair, don't rewrite the file. If the pruning feels like too many edits, that's a signal you should rewrite *only* if you've already opened the file twice and confirmed >50% of lines need to change; otherwise stay with `Edit`.

14. **Pre-prune snippet imports BEFORE running `astro check`, not after.** Each snippet bucket ships imports for the full feature set of its bucket; cross-bucket imports and FEATURE-gated blocks in `member/index.astro` need decisions at copy time. When `astro check` reports a missing module, **first** check whether the missing file is a cross-bucket dependency that just needs to be copied — only delete the import as a last resort, and trace what the import was rendering before falling back to a different field.

    **Most common failure mode:** `store/[slug].astro` imports `RichContentViewer` (lives in `snippets/blog/components/`) to render `product.description` and `infoSection.description` — both Ricos rich content. Deleting the import and switching to `plainDescription` *passes `astro check`* but renders empty in production because the seed only populates the rich `description` field. The right fix is to copy `snippets/blog/components/RichContentViewer.tsx` to `src/components/` even on store-only sites — it's a standalone Ricos renderer with no `@wix/blog` runtime dependency.

    **Pre-prune checklist for a store-only site (do this immediately after `cp -R`, before the first `astro check`):**
    - `cp snippets/blog/components/RichContentViewer.tsx src/components/` — stores info sections and product descriptions need it.
    - Remove the `GiftCardActions` import + mount in `store/index.astro` unless installing Wix Gift Vouchers in this build.
    - Remove the `{FEATURE:bookings}` / `{FEATURE:plans}` / `{FEATURE:donations}` / `{FEATURE:restaurant}` / `{FEATURE:events}` blocks from `member/index.astro` and the matching component imports (`CancelSubscription.tsx`, `MyBookings.tsx`). The blocks are grep-able by their `{FEATURE:<name> BEGIN/END}` markers.
    - Delete `src/pages/member/[slug].astro` if not building a public member directory.

    Doing the pre-prune at copy time avoids the two-round check cycle (~1–2 min per round) and prevents the wrong-fix pattern above. See `snippets/README.md` → "Cross-bucket dependencies".

---

## Feature Checklists

Before building any feature area, verify you will implement ALL items from the relevant checklist. Create tasks for every item — including data seeding — before writing code.

### Foundation (applies to every site)

- [ ] `Layout.astro` accepts an optional `seoTags` prop and renders it into `<head>` — required infrastructure for all dynamic-page SEO below. Set up BEFORE building any dynamic page. See [SEO.md](references/SEO.md) → "Rendering SEO Tags in the Layout"
- [ ] **Member Area (`/member`)** — required for every site that has members (which is every Wix headless site). See the [Member Area checklist](#member-area) below for the full list of required tabs and behaviors. Do not skip this, even for non-store sites: visitors register as members to comment on the blog, book services, subscribe to plans, etc., and they need a self-service dashboard to manage their account.

### Store

- [ ] Store listing page (`/store`) — category filtering, product cards, category badges, out-of-stock overlay, pre-order badge, price range display
- [ ] Product detail page (`/store/[slug]`) — image gallery, options (text + swatch), modifiers (free text + text choices + swatch choices), variants, add-to-cart, back-in-stock form, info sections accordion, related products, pre-order badge
- [ ] **SEO on `/store/[slug]`** — call `resolveItemSeoTags({ itemType: 'STORES_PRODUCT', slug, pageUrl })` and pass result to `<Layout seoTags={...}>`. See [SEO.md](references/SEO.md)
- [ ] **SEO on category pages** (if built) — call `resolveItemSeoTags({ itemType: 'STORES_CATEGORY', slug, pageUrl })`
- [ ] Cart sidebar — line item images (via `getImageUrl()`), quantities, checkout
- [ ] Thank you page (`/store/thank-you`)
- [ ] Gift cards integration — build the UI but do NOT install the Gift Cards app by default. The page/component should be in the codebase ready to go (preset amount buttons, custom amount input, variant images, recipient form, buy-now via the Gift Cards catalog reference), and the entry point must self-hide via a live `giftVoucherProducts.queryGiftCardProducts` check (wrap in try/catch — the query fails when the app isn't installed). The site owner installs the app and adds products only when they want to start selling gift cards; until then, visitors see no gift-card surface at all. **Two valid placements**, pick one and stick to it: (a) a dedicated `/store/gift-cards` page with a conditionally-rendered nav link in `Layout.astro`; or (b) integrated into `/store/index.astro` as an extra filter tab alongside category tabs (render the tab only when `giftCardProducts.length > 0`). Pattern (b) is simpler and avoids a dead-end nav link. See [GIFT_CARDS.md](references/GIFT_CARDS.md)
- [ ] Navigation with login/logout state detection
- [ ] Member area Orders tab populated — order history with line item images is a required sub-item of the Member Area checklist for any site that has a store
- [ ] **Data seeding — POST-DEPLOY, gated on user confirmation (rule 10).** Do NOT seed during the initial build — release the site live with Wix's default sample products from the Stores app first, then explicitly ask the user whether to proceed with custom seed. If the user confirms, every UI branch on `/store/[slug]` and `/store` must be exercised by the seed. A "demo" catalog with 8 plain products + one price each silently ships a broken storefront — option pickers, swatch chips, modifier inputs, info-section accordion, ribbon badge, sale-price strikethrough, preorder messaging, back-in-stock form, multi-image gallery all stay invisible. Every store seed MUST cover the full matrix in [PRODUCT_SEEDING.md](references/PRODUCT_SEEDING.md) → "Seeding: exercise every catalog feature": text option, swatch option, multi-option product (Size + Color → many variants), free-text modifier, text-choices modifier, swatch-choices modifier, info sections, ribbon, sale price (compareAt), preorder, fully out-of-stock product, multi-image gallery, plain product, categorized listing. The seed script and the data file BOTH need to express these — a script that consumes only `name + price + image` and ignores `options` / `modifiers` / `infoSections` / `ribbon` / `compareAt` is the single most common cause of a "looks half-finished" launch.
  - [ ] Back-in-stock app installed + collection enabled (see [ECOMMERCE.md](references/ECOMMERCE.md) → Back-in-Stock Notifications)
  - [ ] Inventory created for all new variants after attaching options

### Blog

- [ ] Blog listing page (`/blog`) — tag filtering, cover images, metrics
- [ ] Blog detail page (`/blog/[slug]`) — rich content rendering
- [ ] **SEO on `/blog/[slug]`** — request `'SEO'` fieldset from `posts.getPostBySlug(slug, { fieldsets: [..., 'SEO'] })` and pass `post.seoData?.tags` to `<Layout seoTags={...}>`. Without the fieldset, `seoData` is empty. See [SEO.md](references/SEO.md)
- [ ] Likes — like/unlike toggle on posts AND comments, pre-populated from `queryLikes()` on mount
- [ ] Comments & replies — visitor name input, member identity, nested replies, edit/delete own, like per comment
- [ ] **Disable the default "AI spam moderation" rule** during setup (PATCH `/moderation/v1/rules/{id}` with `enabled: false`) — Wix ships a SMART/NEEDS_MANUAL_APPROVAL rule on every new site that holds every comment in pending state, producing the single most common "comments don't work" symptom (submit succeeds, comment never appears). See [BLOG_ENGAGEMENT.md](references/BLOG_ENGAGEMENT.md) → "One-time setup: disable the default AI spam moderation rule"
- [ ] View tracking — report views on post load via `httpClient.fetchWithAuth` to `/blog/v3/posts/{postId}/view`
- [ ] Premium/paid content — if pricing plans exist, support `post.preview` with paywall overlay and link to plans page

### Pricing Plans / Monetization

- [ ] Plans listing page (`/plans`) — plan cards, perks, pricing, subscribe button
- [ ] Checkout via `redirects.createRedirectSession` (handles login, free, and paid). NOTE: do NOT use `preferences: { checkIfPublish: true }` for plans — only for eCommerce checkout
- [ ] **Thank-you page (`/plans/thank-you`)** — dedicated page, NOT `/member#subscriptions`. The redirect flow needs a real landing page; bouncing back to a member-tab anchor is a confusing UX (the user sees their full dashboard mid-celebration, plus the tab switch is hash-based and easy to miss). See [PRICING_PLANS.md](references/PRICING_PLANS.md)
- [ ] Member Area Subscriptions tab populated — see Member Area checklist
- [ ] Blog post gating — set `pricingPlanIds` on premium posts, render paywall for non-subscribers

### Restaurants / Online Ordering

**For any site with a restaurants menu**, the ordering page is a non-trivial app — it is NOT a simple list-with-add-buttons. Treat the fully featured ordering component pattern in [RESTAURANTS.md](references/RESTAURANTS.md) as the baseline: every item below is required, and a build that ships the lightweight version will fail the restaurants SPI at checkout.

- [ ] **Wix cart is the source of truth from the first click** — every "+", "−", and modal confirm calls `currentCart.addToCurrentCart` / `updateCurrentCartLineItemQuantity` / `removeLineItemsFromCurrentCart` immediately. Never run a local `Record<string, number>` and call `addToCurrentCart` only at checkout — the dispatch race + empty-cart 404 + restaurants SPI validation all break that pattern.
- [ ] **Catalog options shape**: `{ operationId, menuId, menuSectionId, priceVariant?, modifierGroups? }`. Camelcase `menuSectionId`, never `sectionId`. Never invent fields like `fulfillmentType`/`mode` here — they are silently dropped.
- [ ] **Fulfillment on the cart**: after the first add, `currentCart.updateCurrentCart({ cartInfo: { selectedShippingOption: { code }, businessLocationId, contactInfo: { address } } })`. Code format: `"{TYPE}|ASAP"` or `"{TYPE}|{startMs}|{endMs}"`. PICKUP needs the restaurant's address.
- [ ] **Fetch fulfillment methods from the API** — `listFulfillmentMethods()` filtered to `enabled !== false` and `type !== 'DINE_IN'`. The toggle renders from this; never hardcode PICKUP/DELIVERY.
- [ ] **Default dispatch from the operation** — read `operation.defaultFulfillmentType`; don't default to PICKUP for restaurants that default to DELIVERY.
- [ ] **Item modifier modal** (REQUIRED — see RESTAURANTS.md "Item modifier modal UX") — clicking an item with modifier groups OR price variants opens a modal. Inside: hero image, description, variant selector, modifier groups with min/max validation, qty stepper, live total, "Add to order" / "Update" button disabled until required groups satisfied. A flat `+`/`−` on the card alone is incorrect for any item that has modifiers — users cannot specify their selections. Items WITHOUT modifiers/variants can stay as inline `+` cards.
- [ ] **Price variants** — `priceVariants.variants` selector inside the modal, prices shown for each variant, total updates on selection.
- [ ] **Required modifier groups** — `rule.required: true` OR `maxSelections === 1` (single-select implicitly required) blocks the Add button until satisfied. Show inline "(required)" / "(min N)" hints on each group label.
- [ ] **Edit-line mode** — clicking an existing cart line opens the same modal, pre-filled with the saved variant + modifier selections + qty. Submit calls `removeLineItemsFromCurrentCart([oldId])` then `addToCurrentCart` with the new options. NEVER mutate options in place — they're immutable on the line item.
- [ ] **Multiple lines per item** — the same item with different modifiers should produce distinct cart lines. Group by `lineId`, not `catalogItemId`, when rendering qty badges and edit handles.
- [ ] **Section navigation** — sticky side rail (or top tabs on mobile) with section names; IntersectionObserver highlights the section currently in view; clicking jumps to it.
- [ ] **Scheduling button + popover** — when `operation.orderScheduling` allows future orders (`PREORDER` or `ASAP` with `BUSINESS_DAYS_AHEAD_HANDLING`), surface a "Schedule" button next to the dispatch toggle; popover with ASAP/Schedule radio, Day + Time dropdowns. ASAP-only restaurants (`asapFutureHandlingType: NO_FUTURE_HANDLING`) hide the button entirely.
- [ ] **Time-slot probing** — for the Day dropdown, query `availability.queryAvailability` (or `getAvailableSlots` per the SDK in use) for a 7–14 day horizon in parallel; only show days that return at least one slot. Group by **local** day (not UTC) — a slot at 20:45Z may be tomorrow in Tel Aviv.
- [ ] **Hydration race guard** — restore dispatch + selected slot from `cart.selectedShippingOption.code` only on first mount via a `hydratedRef`; subsequent `cart-updated` events refresh items but do not clobber the user's slot choice.
- [ ] **Modifier additional charges** — show `+ $X` next to choices that have an `additionalCharge` so users see the price impact before selecting.
- [ ] **Item labels** (vegetarian, spicy, etc.) — fetch via `itemLabels.listLabels()`, render the label icon (via `getShapeUrl()`) and name on the card.
- [ ] **Data seeding — every UI branch on the ordering page must be exercised by the menu seed.** Same failure mode as the store: a menu of 12 items with just `name + price + image` ships a broken ordering experience because the modal stays empty (no variants, no modifier groups, no required-group enforcement, no labels). The menu seed script and data file BOTH need to express labels, variants, modifier groups, and modifier additional charges. Cover the full matrix in [RESTAURANTS.md](references/RESTAURANTS.md) → "Seeding: exercise every modifier type": required single-choice (radio with preselected default), optional multi-choice (checkbox), free-text modifier, paid modifier (non-zero charge), free modifier (zero charge), variant-priced item (2+ price variants for the size selector), plain item (no variants, no modifiers — proves the modal works empty-shell). Plus dietary labels (icon-bearing — Vegan, Gluten-free, Hot, etc.) on a representative slice of items.

### Donations / Research Funding

See [DONATIONS.md](references/DONATIONS.md) for the full flow — the Donations app is NOT installed by default and must be installed via `apps-installer-service` before any campaign API call will work.

- [ ] Install Wix Donations app (one-time) and `npm install @wix/donations`
- [ ] Seed campaigns with name, `donationFrequencies`, `campaignGoal.targetAmount`, at least one of `customAmountEnabled` / `predefinedDonationAmounts`, plus `commentsEnabled`, `askDonorCoverFee` as appropriate
- [ ] Generate AI cover images, import via `/site-media/v1/files/import`, attach via REST PATCH with `fieldMask.paths: ["coverImage"]` (SDK `coverImage: string` disagrees with runtime object shape)
- [ ] Listing page (e.g. `/donate`) — card per campaign with progress bar (via `getDonationCampaignMetrics`), donor count, and inline donate UI
- [ ] Donate component — preset/custom amount, frequency (if >1), donor-fee opt-in (if `askDonorCoverFee`), note textarea (if `commentsEnabled`); submit adds to cart with donation `catalogReference` → creates checkout → attaches note via `checkout.updateCheckout(id, { buyerNote })` if present → `createRedirectSession` with `preferences: { checkIfPublish: true }`
- [ ] Thank-you page (e.g. `/donate/thank-you`)
- [ ] Graceful "no goal" UI: hide progress bar when `campaignGoal.targetAmount` is missing/0
- [ ] Render-time compatibility: treat `coverImage` as `string | { id, url, ... } | undefined`

### Member Area

**Required for EVERY site, not just stores.** The member area is the site's self-service dashboard — any Wix headless site supports members, and those members need somewhere to manage their own account regardless of whether the site sells products, publishes posts, takes bookings, or just offers a community. Build it even if the site is "just a blog" or "just bookings." A site without a member area leaves its members with no way to update their own profile, change email, or reset password.

Customers must be able to **view AND edit** their own data — a read-only profile is not enough. A complete member area has four tabs:

- [ ] Authentication gate (redirect to `/api/auth/login?returnToUrl=/member` if not logged in)
- [ ] Logout via POST form (not a link — POST endpoint)
- [ ] Hash-based tab state (`/member#profile`, `#personal`, `#orders`, `#account`) so tabs are deep-linkable and survive reload
- [ ] **Profile tab (editable, `client:load` React)** — nickname, title/tagline, profile photo (upload + remove via `/api/profile-photo` server endpoint using `auth.elevate(files.generateFileUploadUrl)`), about/bio (saved as rich content via `membersAbout.updateMemberAbout` / `createMemberAbout`), privacy toggle (use `members.joinCommunity()` / `leaveCommunity()` — `updateMember` silently ignores `privacyStatus`)
- [ ] **Personal Info tab (editable, `client:load` React)** — first/last name, company, job title, birthdate, phone (normalize to E.164 before save), full address (street, line 2, city, state/province, country, postal code)
- [ ] **Orders tab (conditional — only if site has a store, donations, gift cards, or any eCom purchases)** — order history with line item images (via `getImageUrl()`), quantities, prices, status badges (color-coded), totals. Server-rendered. Omit only if NO eCom-backed features exist. Other feature-specific tabs follow the same pattern: Bookings tab if site has bookings, Subscriptions tab if site has pricing plans, etc.
  - **Classify each line item** by `catalogReference.appId` — donations, store, restaurant, gift cards, bookings, pricing plans, and blog flow through `ecomOrders.searchOrders`. Render a color-coded type badge per line item so members can tell donations apart from purchases. Centralize app IDs in `src/utils/appIds.ts` — see [SDK_CORE.md](references/SDK_CORE.md).
  - **Pricing Plan subscriptions appear here too** because they go through eCom checkout. They're visible in both the Orders and Subscriptions tabs (intentionally) — badge them so users aren't confused.
- [ ] **Tickets tab (`client:load` React, conditional — only if site has a `/tickets` page)** — event tickets DO NOT live in `ecomOrders.searchOrders`. `redirects.createRedirectSession({ eventsCheckout })` creates orders in the separate Events system (`@wix/events` → `orders.listOrders`). Render in their own tab — NOT folded into Orders — because each ticket needs ticket-specific actions:
  - **Download PDF** — `eventsOrders.Order.ticketsPdf` URL (request `OrderFieldset.TICKETS` + `OrderFieldset.DETAILS`)
  - **Add to Google Calendar** — `Event.calendarUrls.google` (request `RequestedFields.DETAILS`)
  - **Download .ics** — `Event.calendarUrls.ics`
  - **Event date/location** — pulled from `Event.dateAndTimeSettings.startDate` and `Event.location.name` via parallel `wixEventsV2.getEvent(id)` per distinct eventId
  - **Status badge** — map `Order.status` (FREE/PAID/PENDING/OFFLINE_PENDING/INITIATED/CANCELED/DECLINED) to color-coded badges
  - Filter by `eventsOrders.listOrders({ memberId: [member._id] })` — `contactId` is for guest orders. See [MEMBER_AREA.md](references/MEMBER_AREA.md) → "Tickets Tab".
- [ ] **Subscriptions tab (`client:load` React)** — required if the site has a `/plans` page. Fetch via `pricingPlans.orders.memberListOrders()`, filter out `OrderStatus.DRAFT` and orders with `endDate < today`, then render one card per active subscription with status badge, plan name, price + cycle, start/end dates, and a Cancel auto-renewal button (`orders.requestCancellation(id, CancellationEffectiveAt.NEXT_PAYMENT_DATE)`). DO NOT ship a placeholder paragraph that says "subscriptions also appear in Orders" — that's not a tab, that's an apology. See [MEMBER_AREA.md](references/MEMBER_AREA.md) → "Subscriptions Tab".
- [ ] **Account tab (`client:load` React)** — change login email (`authentication.changeLoginEmail`), **direct change password inline (REQUIRED)** using OAuthStrategy + loginV2 + getMemberTokensForDirectLogin + changePassword, **plus** "send password reset email" as a fallback link. Shipping ONLY the reset-email button with no inline change form is incomplete — users expect to type their current+new password and submit. See [MEMBER_AREA.md](references/MEMBER_AREA.md) → "Change Password Pattern"

---

## Stores V3 SDK

V3 field paths differ from V1. The full mapping (`product.media.main.image`, `actualPriceRange.minValue.amount`, `ribbon.name`, `variantsInfo.variants`, `_id` not `id`, etc.) lives in [ECOMMERCE_V3.md → V3 SDK Field Access Cheat Sheet](references/ECOMMERCE_V3.md#v3-sdk-field-access-cheat-sheet). Categories live in their own package: `@wix/categories`.
