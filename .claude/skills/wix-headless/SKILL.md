---
name: wix-headless
description: "Use when building or working on Wix managed headless projects — Astro sites powered by the Wix SDK. Covers the full stack: project scaffolding, SDK integration patterns, eCommerce (Stores, cart, checkout, orders), Blog (posts, comments, likes), Bookings, Pricing Plans, Gift Cards, Restaurants, Events (conferences, festivals, classes, screenings, workshops, performances), CMS collections, member dashboard, multilingual/i18n/RTL, media handling, authentication, and deployment. Also use when the user mentions Wix headless, Wix Astro, Wix SDK, Wix CMS, or any Wix business feature in a headless context."
---

# Wix Managed Headless — Developer Guide

This is a routing document. Read the relevant reference guides for implementation details — do not build from memory alone.

---

## How to Use This Skill

1. **Read the feature checklists below** to understand everything a complete implementation requires
2. **Create tasks for EVERY checklist item** before writing any code — including data seeding steps
3. **Read the relevant reference guides** (linked below) for each feature area
4. **After building, re-read the checklist** line by line and verify every item is implemented

---

## Reference Guide Index

Read the guide that matches your current task. Each guide is self-contained with setup, patterns, code examples, and gotchas.

### Foundation (read these first for any new project)
| Guide | When to read |
|-------|-------------|
| [SETUP.md](references/SETUP.md) | Scaffolding, key files, CLI commands, SDK packages, translations setup |
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
| [EXTENSIONS.md](references/EXTENSIONS.md) | Backend event listeners (webhooks) and dashboard pages registered via `src/extensions.ts` — `export default` requirement, auth context, building admin UIs with WDS, `dashboard.openMediaManager`, multi-reference write patterns |
| [TRANSLATIONS_STATIC.md](references/TRANSLATIONS_STATIC.md) | `t()` function, interpolation, RTL, language switcher, locale-aware links |
| [TRANSLATIONS_CONTENT_API.md](references/TRANSLATIONS_CONTENT_API.md) | Translating dynamic business data (products, services, blog posts, CMS) via API |

---

## Cross-Cutting Rules

These apply to every feature area.

1. **Media conversion is mandatory** — Convert every `wix:image://` / `wix:video://` SDK string through `getImageUrl()` / `getVideoUrl()` before rendering. See [MEDIA.md](references/MEDIA.md).

2. **Type check before deploying** — Run `npx astro check` (not `tsc`) before every build. See [DEPLOYMENT.md](references/DEPLOYMENT.md).

3. **Translate all visible text** — `t('key')` from `i18n.getTranslationFunction()` for every user-visible string. See [TRANSLATIONS_STATIC.md](references/TRANSLATIONS_STATIC.md).

4. **Use SDK types** — Import from SDK packages (`cart.LineItem`, `productsV3.ProductMedia`). `any` and `as unknown as T` are both banned; for genuine type drift, intersect with `X & { extraField?: T }`. See [SDK_CORE.md → TypeScript Conventions](references/SDK_CORE.md#typescript-conventions).

5. **Use the `frontend-design` skill for styling** — Invoke `frontend-design` for all page layouts. Avoid generic system fonts and default colors.

6. **Generate images with AI** — Every entity that supports an image should have one. Use Wix Runware API. See [MEDIA.md](references/MEDIA.md).

7. **Add SEO tags to every dynamic page** — Use `resolveItemSeoTags()` from `@wix/seo` for supported item types (`STORES_PRODUCT`, `BOOKINGS_SERVICE`, `STORES_CATEGORY`). For blog posts, request the `'SEO'` fieldset and pass `post.seoData.tags`. Pass the `seoTags` array to the Layout component. Import the `Tag` type from `@wix/seo` — never define custom SEO tag interfaces. See [SEO.md](references/SEO.md).

8. **Release on initial generation, preview on iterations** — The deploy strategy depends on where you are in the project lifecycle:
    - **Initial generation (first-time build of a site):** run `npm run release` to publish the site live. Do NOT stop at preview — the user expects a working live URL at the end of the first build.
    - **Subsequent iterations (edits, fixes, additions after the initial build):** run `npm run preview` by default. Only run `npm run release` when the user explicitly asks to "release", "publish", or "deploy live". You may proactively *suggest* releasing, but wait for confirmation.
    See [DEPLOYMENT.md](references/DEPLOYMENT.md).

9. **Report view URL + dashboard URL on first-time generation** — When finishing the initial build of a site, surface exactly two URLs: (a) the **live site URL** from `npm run release` (not a preview URL — initial generation always releases per rule 8); and (b) the dashboard URL (`https://manage.wix.com/dashboard/<siteId>`). On subsequent iterations, report the new **preview URL** only (and the dashboard URL only if it's useful for the current change). See [DEPLOYMENT.md](references/DEPLOYMENT.md).

10. **Build order: all code first, then seed data, then images** — For a new site, finish every page/component/route and get a clean `npx astro check` BEFORE seeding any business data, then seed all records with no images, then do a second pass attaching generated images. Seeding against half-written code wastes time because the data contract keeps changing under you; attaching images inside `createX` calls serialises the slowest step and makes retries painful. See [SETUP.md](references/SETUP.md) → "Build order".

11. **Every `redirects.createRedirectSession` flow needs a dedicated thank-you page**, not a member-tab anchor (`/member#orders` and similar). Use the `checkoutCallbacks()` helper in `src/utils/redirects.ts` to centralise paths. The single exception is `/member#bookings` for Wix Bookings. See [ECOMMERCE.md → Redirect callbacks](references/ECOMMERCE.md#redirect-callbacks-always-pass-all-of-them).

12. **Translatable SDK fields (`name`, `title`, `displayName`, `description`, `tagLine`, `optionChoiceNames`, …) are display-only** — never key state, lookup maps, React `key={}`, or `find()` predicates by them. Use the entity's `key` (or `_id` where the API forces UUIDs, like V3 variant matching). See [ECOMMERCE_V3.md → Translatable fields are display-only](references/ECOMMERCE_V3.md#translatable-fields-are-display-only--never-use-them-as-identifiers).

    **One exception:** Wix Events has no per-series ticket entity — picker state across recurring siblings has to key by `td.name` since `_id`s change per occurrence. See [EVENTS.md](references/EVENTS.md).

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
- [ ] Gift cards integration — display gift card products with preset amount buttons, custom amount input (if `customVariant` exists), variant images, recipient form (name, email, message), buy now flow via the Gift Cards catalog reference. **Two valid placements**, pick one and stick to it: (a) a dedicated `/store/gift-cards` page with a conditionally-rendered nav link in `Layout.astro`; or (b) integrated into `/store/index.astro` as an extra filter tab alongside category tabs (query `giftVoucherProducts.queryGiftCardProducts` server-side in the store-listing page, render the tab only when `giftCardProducts.length > 0`, swap the product grid for the gift-card UI when active). Pattern (b) is simpler and avoids a dead-end nav link. Either way, the visibility MUST gate on a live `queryGiftCardProducts` call so the entry auto-hides when no gift cards are defined. See [GIFT_CARDS.md](references/GIFT_CARDS.md)
- [ ] Navigation with login/logout state detection
- [ ] Member area Orders tab populated — order history with line item images is a required sub-item of the Member Area checklist for any site that has a store
- [ ] **Data seeding — every UI branch on `/store/[slug]` and `/store` must be exercised by the seed.** A "demo" catalog with 8 plain products + one price each silently ships a broken storefront — option pickers, swatch chips, modifier inputs, info-section accordion, ribbon badge, sale-price strikethrough, preorder messaging, back-in-stock form, multi-image gallery all stay invisible. Every store seed MUST cover the full matrix in [PRODUCT_SEEDING.md](references/PRODUCT_SEEDING.md) → "Seeding: exercise every catalog feature": text option, swatch option, multi-option product (Size + Color → many variants), free-text modifier, text-choices modifier, swatch-choices modifier, info sections, ribbon, sale price (compareAt), preorder, fully out-of-stock product, multi-image gallery, plain product, categorized listing. The seed script and the data file BOTH need to express these — a script that consumes only `name + price + image` and ignores `options` / `modifiers` / `infoSections` / `ribbon` / `compareAt` is the single most common cause of a "looks half-finished" launch.
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

**For any site with a restaurants menu**, the ordering page is a non-trivial app — it is NOT a simple list-with-add-buttons. Treat the cats-in-space `MenuOrderView` as the canonical reference: every item below is required, and a build that ships the lightweight version will fail the restaurants SPI at checkout. See [RESTAURANTS.md](references/RESTAURANTS.md) for the SDK-level details.

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
- [ ] Listing page (e.g. `/research`) — card per campaign with progress bar (via `getDonationCampaignMetrics`), donor count, and inline donate UI
- [ ] Donate component — preset/custom amount, frequency (if >1), donor-fee opt-in (if `askDonorCoverFee`), note textarea (if `commentsEnabled`); submit adds to cart with donation `catalogReference` → creates checkout → attaches note via `checkout.updateCheckout(id, { buyerNote })` if present → `createRedirectSession` with `preferences: { checkIfPublish: true }`
- [ ] Thank-you page (e.g. `/research/thank-you`)
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
