# Snippets

Verified, copy-paste-ready files for Wix Managed Headless sites. Every file in this directory was generated and type-checked clean under `astro/tsconfigs/strictest` with `npx astro check`, against current `@wix/*` SDK versions.

**Use over hand-writing.** Copying a snippet is faster than re-deriving the file from the references, and the snippets are guaranteed to compile. The references explain *why* the patterns are correct; the snippets are the *what*.

## How to use

```bash
SKILL=~/.claude/skills/wix-headless/snippets

# 1. Install the Wix apps this site will use. The installer is idempotent —
#    safe to re-run on every CI deploy.
cp "$SKILL/scripts/install-apps.mjs" scripts/install-apps.mjs
node scripts/install-apps.mjs stores blog bookings   # or `ecom`, `restaurant`, `all`, …

# 2. Universal — every Wix headless site gets these.
mkdir -p src/utils src/components src/layouts src/pages/api src/pages/member
cp -R "$SKILL/universal/utils/." src/utils/
cp -R "$SKILL/universal/components/." src/components/
cp -R "$SKILL/universal/layouts/." src/layouts/
cp -R "$SKILL/universal/pages/." src/pages/

# 3. For each feature the site enables, drop the matching bucket on top:
cp -R "$SKILL/store/." src/                # Wix Stores V3
cp -R "$SKILL/blog/." src/                 # Wix Blog
cp -R "$SKILL/bookings/." src/             # Wix Bookings
cp -R "$SKILL/events/." src/               # Wix Events
cp -R "$SKILL/donations/." src/            # Wix Donations
cp -R "$SKILL/plans/." src/                # Wix Pricing Plans
cp -R "$SKILL/gift-cards/." src/           # Wix Gift Vouchers
cp -R "$SKILL/restaurants/." src/          # Wix Restaurants
cp -R "$SKILL/cms/." src/                  # @wix/data collections

# 4. Translations — SKIP unless this site needs multiple languages.
#    The snippets use t('group.key') calls as TEMPLATES. For a single-language
#    site, substitute each t() call with the literal value from
#    translations.starter.json before saving — see TRANSLATIONS_STATIC.md.
#    Only run this copy when the user actually adds a second language:
# cp "$SKILL/translations.starter.json" src/translations.json

# 5. Seed library — drop into seed/lib/, then write seed/catalog.mjs and
#    seed/seed.mjs against the helpers.
mkdir -p seed/lib
cp -R "$SKILL/scripts/seed-lib/." seed/lib/

# 6. One-shot install of npm packages the copied snippets import. Pick the
#    line that matches the buckets you copied. Doing this once is much
#    faster than letting `astro check` discover missing packages one at a
#    time and installing five times.
#
# Universal-only (every site):
npm i @wix/seo @wix/members @wix/ecom @wix/redirects @wix/payments \
      @wix/identity @wix/business-tools @astrojs/check && \
npm i -D @types/node country-list @types/country-list image-size

# Universal + store:
npm i @wix/seo @wix/members @wix/ecom @wix/redirects @wix/payments \
      @wix/identity @wix/business-tools @wix/stores @wix/categories \
      @wix/gift-vouchers @astrojs/check && \
npm i -D @types/node country-list @types/country-list image-size

# Add packages for additional features as needed:
#   Blog          → @wix/blog @wix/comments
#   Bookings      → @wix/bookings
#   Events        → @wix/events
#   Donations     → @wix/donations
#   Pricing Plans → @wix/pricing-plans
#   Restaurants   → @wix/restaurants @wix/table-reservations
#   CMS           → @wix/data
#
# Even on a feature-light build, the universal `member/index.astro` snippet
# imports `@wix/pricing-plans`, `@wix/bookings`, and `@wix/blog`-derived
# components — install all three to avoid astro check noise. Easier rule:
# install every package any snippet you copied imports, in one batch.
```

Each bucket lays out a feature-area subtree (`src/components/`, `src/pages/<feature>/`, occasionally `src/pages/api/`). Re-running a `cp -R` overwrites — safe to re-bootstrap a project.

## Edit the snippets — don't rewrite them

A snippet is two things layered. **Treat them differently:**

| Layer | What it is | How to change it |
|---|---|---|
| **Load-bearing code** | Markup, JS, SDK calls, server fetches, SEO setup, cart dispatch, hash-tab routing, mobile-toggle script, RTL handling | Targeted `Edit` calls only — swap link arrays, brand strings, hero copy. **Never `Write` a replacement.** Rewriting re-derives parts that work and costs minutes per file. |
| **Design tokens** (`:root` in `Layout.astro`) | COLOR tokens (`--accent`, `--bg-*`, `--text-*`, `--accent-glow`, `--danger`, `--success`) + SHAPE tokens (`--radius-card`, `--radius-control`, `--radius-chip`, `--radius-pill`, `--shadow-floating`) | **Edit freely.** Fastest brand surface — re-themes cart sidebar, badges, and any other style block that reads from tokens. |
| **`<style>` blocks at end of page templates + the `.cs-*` block in Layout.astro** | Page-local presentation | **Replaceable wholesale via `frontend-design`** when the snippet's shape language genuinely conflicts with the site's. Pass markup + target aesthetic; apply the redesigned block. Markup/JS/SDK stay untouched. See SKILL.md rule 5 (frontend-design) and rule 13 (the seam). |

The cart sidebar's `.cs-*` block now reads from both color and shape tokens, so a site that sets `--radius-card: 0` and `--shadow-floating: 0 2px 0 rgba(0,0,0,0.25)` gets a sharp/flat sidebar without touching the block. Only fall back to a `frontend-design` rewrite if the tokens aren't enough.

## Cross-bucket dependencies — copy these even if you don't use the bucket

Some snippets import files that live in a different bucket. Copy them up-front, before `astro check`, to avoid a misleading "module not found" round trip:

| Cross-bucket file | Lives in | Needed by | Why |
|---|---|---|---|
| `components/RichContentViewer.tsx` | `blog/` | `store/[slug].astro` (always); `cms/pages/items/[slug].astro` (when CMS items carry rich-content fields) | Stores **info sections AND product descriptions are Ricos** — renders empty without it. The component is standalone React; no `@wix/blog` runtime dependency. |

⚠️ **Don't "fix" a missing `RichContentViewer` import by switching to `plainDescription`.** It passes `astro check` but ships a blank accordion — the seed only populates the rich `description` field. The right fix is `cp snippets/blog/components/RichContentViewer.tsx src/components/`.

## Pre-prune snippet imports — do it before the first `astro check`

After copying, **prune feature-gated tabs from the member dashboard.** The universal `member/index.astro` snippet ships with tabs for every feature (Bookings, Subscriptions, etc.) wrapped in `{FEATURE:<name> BEGIN/END}` markers. Delete every block whose feature isn't on this site, or the live member area shows empty broken tabs. See [MEMBER_AREA.md → Prune feature-gated tabs](../references/MEMBER_AREA.md#prune-feature-gated-tabs-after-copying--mandatory) for the grep + decision table.

Also prune these imports up-front for a store-only build:

- `store/index.astro` — remove the `GiftCardActions` import + the `<GiftCardActions ...>` mount unless installing Wix Gift Vouchers in this build.
- `member/index.astro` — remove `CancelSubscription` / `MyBookings` imports and their corresponding `{FEATURE:plans}` / `{FEATURE:bookings}` blocks; same for donations/restaurant/events blocks. The blocks are grep-able by their `{FEATURE:<name> BEGIN/END}` markers.
- `src/pages/member/[slug].astro` — delete unless building a public member directory.

After copying, sweep for site-specific placeholders:

| Placeholder | Files | Replace with |
|---|---|---|
| Brand name (rendered via `t("home.title")`) | `universal/components/Nav.astro`, `universal/components/Footer.astro` | Define the `home.title` translation key in `src/translations.json` |
| `Nav.astro` link arrays — `/planets`, `/crew`, `/missions`, `/cinema`, `/explore` | `universal/components/Nav.astro` | Rewrite the `exploreLinks` / `facilitiesItems` arrays to match this site's actual routes; rename grouped dropdowns ("Explore", "Facilities") if you keep groupings |
| `member.itemTypeMedicalBay`, `member.itemTypeCinema` translation keys | `universal/pages/member/index.astro` | Rename to generic (`member.itemTypeBooking`, `member.itemTypeEvent`) and define matching translation entries |
| `🐱` cat fallback emoji | `bookings/pages/bookings/*.astro` (staff fallback) | Domain-appropriate emoji or remove |
| `🛰️ 🌱 🧑‍🚀 🪐 🔭 🧪 🚀 👩‍🔬` decorative emojis | `donations/pages/donate/index.astro` (campaign cards) | Your campaign vibe or remove |
| `/cinema` event-page route | `universal/components/Nav.astro` (link), `events/pages/events/*.astro` (you may want to rename the directory) | Pick `/events`, `/festival`, `/screenings`, etc. consistently |
| Hero / eyebrow / footer copy | Almost every `pages/*.astro` | Your voice — these are usually wrapped in `t(...)` keys |
| CSS variables under `:root` | `universal/layouts/Layout.astro` | Your colors, fonts, radii |
| Google Fonts `<link>` | `universal/layouts/Layout.astro` | Your typography |

### Per-snippet customization-point manifest

The exact regions to `Edit` in each universal snippet (everything else is infrastructure — don't touch):

| File | Edit targets | Don't touch |
|---|---|---|
| `universal/layouts/Layout.astro` | `:root` COLOR tokens (`--accent` / `--accent-yellow` / `--bg-*` / `--text-*` / `--accent-glow` / `--danger` / `--success`) + SHAPE tokens (`--radius-card` / `--radius-control` / `--radius-chip` / `--radius-pill` / `--shadow-floating`), the Google Fonts `<link>` | SEO tag rendering, `dir`/`lang` logic. The cart-sidebar `.cs-*` block auto-themes via the tokens above; only replace it (via `frontend-design`) when the token set can't express the site's shape language. |
| `universal/components/Nav.astro` | `exploreLinks` / `facilitiesItems` arrays, the brand-name span content, link labels | Dropdown JS, mobile-toggle script, active-state computations, RTL caret swapping |
| `universal/components/Footer.astro` | Link arrays per column, column headings, copyright/tagline strings | Grid breakpoints, footer-grid layout |
| `universal/pages/member/index.astro` | Tab labels, brand strings; **prune** `{FEATURE:*}` blocks per the pre-prune checklist | Hash-tab activation script (`activateTab`/`onHashChange`), panel structure, order-status badge logic, order-line classification by `appId` |
| `store/pages/store/index.astro` | Page header copy; **prune** `GiftCardActions` import + mount if no gift cards | Filter-tab JS (`filterByCollection`/`showAllProducts`), `data-collections` filtering, product-card markup |
| `store/pages/store/[slug].astro` | Page header copy, back-link label | Gallery thumbnail click-swap script, `ProductActions` mount, info-sections accordion structure, SEO call (`resolveItemSeoTags`) |
| `store/components/ProductActions.tsx` | Status-message copy strings | Variant matching, option/modifier validation, cart dispatch, back-in-stock SDK call |

Every snippet uses `t('group.key')` from `i18n.getTranslationFunction()` — but this is a **template convention**, not a literal copy target. For single-language sites (the default), substitute each `t('foo.bar')` with the literal value from `translations.starter.json` during copy, and remove the `i18n` import + `const t = ...` declarations. See [TRANSLATIONS_STATIC.md → When to introduce translations at all](../references/TRANSLATIONS_STATIC.md#when-to-introduce-translations-at-all) for the rationale and the multilingual migration recipe.

## Buckets

### `universal/` — every site

Drop in as-is on every Wix headless site.

| File | Purpose |
|---|---|
| `utils/image.ts` | `getImageUrl`, `getVideoUrl`, `extractMediaUrl` — resolve `wix:image://` / `wix:video://` URIs |
| `utils/format.ts` | `formatCurrency(amount, currency, locale)` boundary helper |
| `utils/appIds.ts` | All Wix app IDs needed for `catalogReference.appId` (stores, donations, restaurants, gift cards, events, bookings, plans, blog, ecom platform) |
| `utils/site.ts` | `getSiteCurrency()` fallback for SDKs whose price objects omit the currency field |
| `utils/redirects.ts` | `checkoutCallbacks()` builds the full callbacks object — `thankYouPageUrl` + `postFlowUrl` are per-flow, the rest (`cartPageUrl`, `bookingsServiceListUrl`, `planListUrl`) are site-wide constants Wix may redirect back to |
| `utils/useCart.ts` | React hook backing cart UI; the cart sidebar, cart page, and any Buy Now flow share it |
| `layouts/Layout.astro` | RTL/locale shell, SEO tag rendering, design tokens, scoped cart-sidebar mount |
| `components/Nav.astro` | Sticky nav with login state, cart trigger, locale-aware links |
| `components/Footer.astro` | Footer (separate from Layout so it can be richer per-site) |
| `components/CartSidebar.tsx` | Slide-out cart, listens for `cart-updated` events |
| `components/CartPage.tsx` | Full-page cart for `/store/cart` route — required so Wix's hosted checkout has a real `cartPageUrl` |
| `components/MemberProfile.tsx` | Combined profile + personal-info + account editor — accepts a `tab` prop ("profile" / "personal" / "account") and renders the matching section |
| `components/CancelSubscription.tsx` | Cancel-auto-renewal action for pricing-plan subscriptions |
| `components/SavedPaymentMethods.tsx` | Payment tab — list/set primary/delete saved payment methods |
| `components/LanguageSwitcher.tsx` | Locale switcher for multilingual sites (mount with `client:only="react"`) |
| `pages/api/profile-photo.ts` | Server endpoint for photo upload — uses `auth.elevate(files.generateFileUploadUrl)` |
| `pages/member/index.astro` | Auth-gated member dashboard. Tabs are inline `<a href="#id">` anchors + a small inline `<script>` that toggles panel visibility — no separate React tab component needed |
| `pages/member/[slug].astro` | Public member profile route (e.g. `/member/jane-doe`) — for sites that let members discover each other |

### `store/` — Wix Stores V3

| File | Purpose |
|---|---|
| `components/ProductActions.tsx` | Option/swatch/modifier picker, Add to Cart, Buy Now, back-in-stock form |
| `pages/store/index.astro` | Store listing with category filter |
| `pages/store/[slug].astro` | Product detail with SEO, gallery, info sections, related products |
| `pages/store/cart.astro` | Full-page cart route (uses universal `CartPage`) |
| `pages/store/thank-you.astro` | Post-checkout order summary |

Reference: [ECOMMERCE.md](../references/ECOMMERCE.md), [ECOMMERCE_V3.md](../references/ECOMMERCE_V3.md), [PRODUCT_SEEDING.md](../references/PRODUCT_SEEDING.md).

### `blog/` — Wix Blog

| File | Purpose |
|---|---|
| `components/BlogEngagement.tsx` | Likes, comments, replies, edit/delete own, like-per-comment |
| `components/PremiumContentResolver.tsx` | Paywall preview + plan-checkout link for premium posts |
| `components/RichContentViewer.tsx` | Ricos rich-content renderer |
| `pages/blog/index.astro` | Blog listing with tag filter, cover images, metrics |
| `pages/blog/[slug].astro` | Post detail with SEO, comments, likes, view tracking |

Reference: [BLOG_POSTS.md](../references/BLOG_POSTS.md), [BLOG_ENGAGEMENT.md](../references/BLOG_ENGAGEMENT.md).

> ⚠️ Wix ships a "SMART/NEEDS_MANUAL_APPROVAL" comment moderation rule on every new site that holds every comment in pending state. Disable it during setup — see [BLOG_ENGAGEMENT.md](../references/BLOG_ENGAGEMENT.md) → "One-time setup: disable the default AI spam moderation rule". This is the single most common "comments don't work" symptom.

### `bookings/` — Wix Bookings

| File | Purpose |
|---|---|
| `components/BookingFlow.tsx` | Date picker, real availability, staff filtering, hosted checkout redirect |
| `components/MyBookings.tsx` | Member's bookings tab — upcoming/past, cancel, reschedule |
| `pages/bookings/index.astro` | Services listing |
| `pages/bookings/[slug].astro` | Service detail with booking flow |

Reference: [BOOKINGS.md](../references/BOOKINGS.md), [MEMBER_AREA.md](../references/MEMBER_AREA.md).

Customize per site: staff fallback emoji (`🐱`) in `pages/bookings/*.astro`.

### `events/` — Wix Events (`@wix/events`)

| File | Purpose |
|---|---|
| `components/TicketPicker.tsx` | Per-tier ticket quantity picker, hosted checkout redirect |
| `pages/events/index.astro` | Event listing with recurring-series grouping |
| `pages/events/[slug].astro` | Event detail with stable detail route across recurring siblings |
| `pages/events/thank-you.astro` | Thank-you with ticket PDF + calendar actions |

> ⚠️ Wix Events orders live in `@wix/events` → `orders.listOrders`, **NOT** `ecomOrders.searchOrders`. Render member tickets in a dedicated "Tickets" tab — not folded into Orders. See [EVENTS.md](../references/EVENTS.md) and [MEMBER_AREA.md](../references/MEMBER_AREA.md) → "Tickets Tab".

Reference: [EVENTS.md](../references/EVENTS.md).

Snippets are under `pages/events/` as a generic naming; rename the directory if your site has a more specific concept (festival, conference, classes, screenings, etc.).

### `donations/` — Wix Donations

| File | Purpose |
|---|---|
| `components/DonateCard.tsx` | Preset/custom amount, frequency, donor fee opt-in, donor note, checkout redirect |
| `pages/donate/index.astro` | Campaign listing with progress bar + donor count |
| `pages/donate/thank-you.astro` | Donation receipt |

> ⚠️ The Wix Donations app is NOT installed by default. Install via `apps-installer-service` before any campaign API call. See [DONATIONS.md](../references/DONATIONS.md).

Reference: [DONATIONS.md](../references/DONATIONS.md).

Customize per site: campaign-card decorative emojis in `pages/donate/index.astro`.

### `plans/` — Wix Pricing Plans

| File | Purpose |
|---|---|
| `components/PlanCheckout.tsx` | Hosted plan checkout via `redirects.createRedirectSession({ paidPlansCheckout })` |
| `pages/plans/index.astro` | Plans listing with perks, trial, price-period rendering |
| `pages/plans/thank-you.astro` | Subscription confirmation (NOT `/member#subscriptions`) |

Pair with `universal/components/CancelSubscription.tsx` for the member-area Subscriptions tab.

Reference: [PRICING_PLANS.md](../references/PRICING_PLANS.md).

> ⚠️ Do NOT use `preferences: { checkIfPublish: true }` for plans — only for `ecomCheckout`.

### `gift-cards/` — Wix Gift Vouchers

| File | Purpose |
|---|---|
| `components/GiftCardActions.tsx` | Preset/custom amount, recipient form, Add to Cart + Buy Now |

> ⚠️ This component must self-hide when the Gift Cards app isn't installed — wrap the `giftVoucherProducts.queryGiftCardProducts` call in try/catch and render nothing on failure. See [GIFT_CARDS.md](../references/GIFT_CARDS.md).

Two valid placements (pick one): a dedicated `/store/gift-cards` page with a conditional nav link, or integrated as an extra filter tab on `/store/index.astro`. The component is the same either way.

Reference: [GIFT_CARDS.md](../references/GIFT_CARDS.md).

### `restaurants/` — Wix Restaurants + Table Reservations

| File | Purpose |
|---|---|
| `components/MenuOrderView.tsx` | Full ordering UI: section nav, modifier modal, variants, dispatch toggle, scheduling popover |
| `components/ReservationFlow.tsx` | Table reservation wizard with time-slot probing |
| `pages/restaurant/index.astro` | Menu browse / brand page |
| `pages/restaurant/order.astro` | Online ordering route (mounts `MenuOrderView`) |
| `pages/restaurant/reserve.astro` | Reservation route (mounts `ReservationFlow`) |
| `pages/restaurant/thank-you.astro` | Order confirmation |
| `pages/api/restaurant-slots.ts` | Server endpoint that probes availability across a multi-day horizon |

> ⚠️ The Wix Restaurants app + Menus (New) + Orders (New) need to be installed before any `/restaurants/*` call works. See [SETUP.md](../references/SETUP.md) → app installer.

> ⚠️ The Wix cart is the source of truth from the **first click**. Never run a local `Record<string, number>` and call `addToCurrentCart` only at checkout — the dispatch race + empty-cart 404 + restaurants SPI all break that pattern. See [RESTAURANTS.md](../references/RESTAURANTS.md).

Reference: [RESTAURANTS.md](../references/RESTAURANTS.md).

### `cms/` — `@wix/data` collections

| File | Purpose |
|---|---|
| `pages/items/index.astro` | Listing template for a CMS collection with image/title/metadata cards |
| `pages/items/[slug].astro` | Detail template with REFERENCE / MULTI_REFERENCE expansion |

These are templates — you'll rename `items` to your collection's domain (e.g. `planets`, `recipes`, `team`) and the SDK collection ID accordingly. See [CMS_DATA_PAGES.md](../references/CMS_DATA_PAGES.md).

### `placeholder-images/` — built-in seed visuals

Ten generic 1024×1024 PNG placeholders that the seed-lib's `uploadPlaceholder(state, kind)` helper uploads to Wix Media. Use these for every seeded entity that has an image field — the first release of any new site ships fully visual without any AI calls during seeding. Bespoke AI image generation is offered to the user as an opt-in *second pass after the initial release* (see SKILL.md rule 6).

| Kind | Visual | Best fit |
|---|---|---|
| `product-apparel` | flat-lay folded grey t-shirt on warm beige | apparel, jerseys, merch |
| `product-object` | matte cream ceramic mug on pedestal | accessories, drinkware, gifts |
| `service-appointment` | open planner + pen + coffee, top-down | bookings, services, classes |
| `event-gathering` | silhouette crowd at golden hour | events, conferences, gatherings |
| `plan-membership` | matte black premium card on linen | pricing plans, memberships |
| `donation-cause` | sunlight through window on wooden table | donation campaigns, causes |
| `blog-article` | open notebook + pencil + dried wheat | blog posts, articles |
| `restaurant-dish` | plated grain bowl on cream ceramic | restaurant menu items |
| `category-generic` | folded cream textile texture | category cards, collections, generic CMS |
| `member-avatar` | warm gradient circular composition | member avatars, default profile photos |

The PNGs are 1024×1024, neutral cream/oatmeal palette so they don't clash with any brand color. Use the kind that best matches the entity's domain — palette consistency is more important than visual literalism (a `product-object` looks fine on a non-mug product because the styling is generic).

Resolution order — the helper looks for the PNGs in these locations, first match wins:
1. `process.env.WIX_HEADLESS_PLACEHOLDERS` (explicit override)
2. `<seed-lib-dir>/placeholder-images/` (if you copied them next to `images.mjs`)
3. `~/.claude/skills/wix-headless/snippets/placeholder-images/` (the skill default)

For projects that need to be CI-portable, copy the placeholders next to your seed-lib:

```bash
mkdir -p seed/lib/placeholder-images
cp ~/.claude/skills/wix-headless/snippets/placeholder-images/*.png seed/lib/placeholder-images/
```

### `scripts/` — bootstrap & seed scaffolding

Not Astro pages — small Node helpers that paper over the parts of building a Wix headless site that are otherwise hand-rolled every time.

| File | Purpose |
|---|---|
| `scripts/install-apps.mjs` | Feature-keyed Wix app installer. Maps `stores`, `blog`, `bookings`, `restaurant` (group), `ecom` (group), `all`, etc. to `appDefId`s and idempotently installs via `apps-installer-service`. Also configures back-in-stock collection when applicable. Run as CLI: `node scripts/install-apps.mjs stores blog bookings`. Or import as a library: `import { installApps } from './install-apps.mjs'; await installApps(['donations'])`. |
| `scripts/seed-lib/wix.mjs` | Reusable seed REST client — `wixFetch`, token caching, `wixFetchAll` (throttled parallel map). Drop into `seed/lib/wix.mjs`. |
| `scripts/seed-lib/state.mjs` | Idempotent state persistence. `loadState()`, `saveState()`, `findOrCreate(bucket, key, { search, create })`. State lives in `seed/out/state.json`. Drop into `seed/lib/state.mjs`. |
| `scripts/seed-lib/images.mjs` | AI image generation with Runware → OpenAI fallback + Wix Media import. `generateAndImport(state, cacheKey, prompt, displayName)` is the most common entry point. Requires `OPENAI_API_KEY` in env for the fallback path. Drop into `seed/lib/images.mjs`. |
| `scripts/seed-lib/README.md` | Usage notes for the seed-lib trio. |

### `translations.starter.json` — string source for snippet substitution

```bash
# Single-language sites: read it, don't copy it.
# The starter is the lookup table you use to replace t('key') calls with
# their literal English values during snippet copy.

# Multilingual sites (added later): copy it as src/translations.json and
# follow the migration recipe in TRANSLATIONS_STATIC.md.
# cp ~/.claude/skills/wix-headless/snippets/translations.starter.json src/translations.json
```

Covers every `t('...')` call any snippet makes (nav, member dashboard, cart, store, blog, bookings, plans, donations, restaurants, events, gift cards, status enums, etc.). Two pruning passes after copying:

1. **Find-and-replace brand-specific copy.** The values are thematic placeholders (the brand name, nav labels, hero copy, status strings). Rewrite them to your voice.
2. **Delete keys for features you don't use, but only by whole group.** The starter assumes every feature. For a store-only site, delete the `blog.*`, `bookings.*` (only if you ALSO removed `member/index.astro`'s bookings tab — the universal member snippet imports `MyBookings`), `restaurant.*`, `research.*`, `cinema.*`, `premium.*`, `planets.*`, `crew.*`, `missions.*`, `aboard.*` groups. Do NOT prune *within* `cart.*`, `product.*`, `profile.*`, `member.*`, `payment.*`, `cancelSub.*`, `status.*`, `common.*`, `auth.*`, `footer.*`, `nav.*`, `store.*`, or `home.*` — every key inside those groups is referenced by a universal or store snippet.

   ⚠️ **Why this rule:** the universal `member/index.astro` snippet references `bookings.*`, `member.tabBookings`, `plans.*`, `cancelSub.*`, etc., even if you never build those features. Trimming individual keys (vs whole groups) silently leaves `[object Object]` / raw key strings on the live site. The check below catches this before release.

**Verify after pruning.** Run this one-liner from the project root — it must print nothing:

```bash
comm -23 \
  <(grep -rohE "t\(['\"]([a-zA-Z]+\.[a-zA-Z_.]+)['\"]" src/ | sed -E "s/.*['\"]([^'\"]+)['\"].*/\1/" | sort -u) \
  <(grep -oE '"[a-zA-Z]+\.[a-zA-Z_.]+"' src/translations.json | sed 's/"//g' | sort -u)
```

It diffs `t('group.key')` references in `src/` against keys defined in `src/translations.json`. Any line printed is a missing key that will render blank on the live site. Add the keys (or revert their group's deletion) before releasing.

For multi-language sites, create matching files at `.wix/multilingual/translations/<lang>.json` with the same key set and translated values — same two pruning passes and the same verification apply.

## What's NOT here

- **Homepage** — too domain-specific to template. Read [HOMEPAGE_LAYOUT.md](../references/HOMEPAGE_LAYOUT.md) and assemble from the feature pages you've enabled.
- **Catalog data spec for the seed** — `seed/catalog.mjs` is unique per site (your product list, plan tiers, campaign list, etc.). The seed-lib gives you the plumbing; the data file is yours.
- **Backend extensions / dashboard pages** — covered in [EXTENSIONS.md](../references/EXTENSIONS.md). Snippets pending.

## When adding new snippets

1. Build the feature in a real project and get `npx astro check` clean.
2. Copy the verified files into the matching bucket. Keep the directory layout matching `src/` so a single `cp -R` works.
3. Update this README's bucket table.
4. If the file has site-specific placeholders (brand strings, emojis, hard-coded route paths), add a row to the placeholder table above.
5. If the snippet uncovers a new SDK gotcha, add a row to the [SDK_CORE.md gotchas table](../references/SDK_CORE.md#sdk-gotchas--quick-reference).
