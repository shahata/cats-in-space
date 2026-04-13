---
name: wix-headless
description: "Use when building or working on Wix managed headless projects — Astro sites powered by the Wix SDK. Covers the full stack: project scaffolding, SDK integration patterns, eCommerce (Stores, cart, checkout, orders), Blog (posts, comments, likes), Bookings, Pricing Plans, Gift Cards, Restaurants, Events/Cinema, CMS collections, member dashboard, multilingual/i18n/RTL, media handling, authentication, and deployment. Also use when the user mentions Wix headless, Wix Astro, Wix SDK, Wix CMS, or any Wix business feature in a headless context."
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
| [EVENTS_CINEMA.md](references/EVENTS_CINEMA.md) | Ticketed events, ticket definitions, cinema/seat selection |
| [RESTAURANTS.md](references/RESTAURANTS.md) | Menus, items, modifiers, table reservations, online ordering |
| [MEMBER_AREA.md](references/MEMBER_AREA.md) | Protected routes, tabbed dashboard, profile, orders, subscriptions, payment |
| [TRANSLATIONS_STATIC.md](references/TRANSLATIONS_STATIC.md) | `t()` function, interpolation, RTL, language switcher, locale-aware links |
| [TRANSLATIONS_CONTENT_API.md](references/TRANSLATIONS_CONTENT_API.md) | Translating dynamic business data (products, services, blog posts, CMS) via API |

---

## Cross-Cutting Rules

These apply to every feature area. Violating any of them produces silent failures or broken UIs.

1. **Media conversion is mandatory** — Every `wix:image://` or `wix:video://` string from any SDK response must go through `getImageUrl()` / `getVideoUrl()` before rendering. Raw strings do not work in `<img>` tags. See [MEDIA.md](references/MEDIA.md).

2. **Type check before deploying** — Run `npx astro check` (not `tsc`) before every build. Vite does not catch type errors. See [DEPLOYMENT.md](references/DEPLOYMENT.md).

3. **Translate all visible text** — Use `t('key')` from `i18n.getTranslationFunction()` for every user-visible string. Never hardcode English. See [TRANSLATIONS_STATIC.md](references/TRANSLATIONS_STATIC.md).

4. **Use SDK types, not `any`** — Import types from SDK packages (`cart.LineItem`, `productsV3.ProductMedia`). Never use `as any` or `Record<string, unknown>`. See [SDK_CORE.md](references/SDK_CORE.md).

5. **Use the `frontend-design` skill for styling** — Invoke `frontend-design` for all page layouts. Avoid generic system fonts and default colors.

6. **Generate images with AI** — Every entity that supports an image should have one. Use Wix Runware API. See [MEDIA.md](references/MEDIA.md).

7. **Add SEO tags to every dynamic page** — Use `resolveItemSeoTags()` from `@wix/seo` for supported item types (`STORES_PRODUCT`, `BOOKINGS_SERVICE`, `STORES_CATEGORY`). For blog posts, request the `'SEO'` fieldset and pass `post.seoData.tags`. Pass the `seoTags` array to the Layout component. Import the `Tag` type from `@wix/seo` — never define custom SEO tag interfaces. See [SEO.md](references/SEO.md).

8. **Release on initial generation, preview on iterations** — The deploy strategy depends on where you are in the project lifecycle:
    - **Initial generation (first-time build of a site):** run `npm run release` to publish the site live. Do NOT stop at preview — the user expects a working live URL at the end of the first build.
    - **Subsequent iterations (edits, fixes, additions after the initial build):** run `npm run preview` by default. Only run `npm run release` when the user explicitly asks to "release", "publish", or "deploy live". You may proactively *suggest* releasing, but wait for confirmation.
    See [DEPLOYMENT.md](references/DEPLOYMENT.md).

9. **Report view URL + dashboard URL on first-time generation** — When finishing the initial build of a site, surface exactly two URLs: (a) the **live site URL** from `npm run release` (not a preview URL — initial generation always releases per rule 8); and (b) the dashboard URL (`https://manage.wix.com/dashboard/<siteId>`). On subsequent iterations, report the new **preview URL** only (and the dashboard URL only if it's useful for the current change). See [DEPLOYMENT.md](references/DEPLOYMENT.md).

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
- [ ] Gift cards page (`/store/gift-cards`) — display gift card products with preset amount buttons, custom amount input (if `customVariant` exists), variant images, recipient form (name, email, message), buy now flow via Rise app catalog reference. The page itself is always built, but the nav link to it MUST be conditionally rendered — query `giftVoucherProducts.queryGiftCardProducts` (elevated) in `Layout.astro` and only include the nav entry when at least one gift card product exists. This way the link auto-hides when none exist and auto-shows once any are defined, without code changes. See [GIFT_CARDS.md](references/GIFT_CARDS.md)
- [ ] Navigation with login/logout state detection
- [ ] Member area Orders tab populated — order history with line item images is a required sub-item of the Member Area checklist for any site that has a store
- [ ] **Data seeding (do not skip) — build an elaborate, realistic catalog:**
  - [ ] Products with **3 images each** (not just 1), descriptions, ribbons, physicalProperties
  - [ ] Categories with images, products assigned
  - [ ] Options/variants — at least one product with **multiple option types combined** (e.g., Color swatch + Size text = many variants at different prices), not just single-option products
  - [ ] Modifiers — at least one FREE_TEXT modifier attached to a product
  - [ ] Info sections — created and assigned to products
  - [ ] Pre-order — at least one product with `trackQuantity: true`, `quantity: 0`, `preorderInfo`
  - [ ] **Fully out-of-stock product** — at least one entire product marked out-of-stock (not just a variant) to exercise the back-in-stock notification flow on the product detail page
  - [ ] Back-in-stock app installed + collection enabled (see [ECOMMERCE.md](references/ECOMMERCE.md) → Back-in-Stock Notifications)
  - [ ] Inventory created for all new variants after attaching options

### Blog

- [ ] Blog listing page (`/blog`) — tag filtering, cover images, metrics
- [ ] Blog detail page (`/blog/[slug]`) — rich content rendering
- [ ] **SEO on `/blog/[slug]`** — request `'SEO'` fieldset from `posts.getPostBySlug(slug, { fieldsets: [..., 'SEO'] })` and pass `post.seoData?.tags` to `<Layout seoTags={...}>`. Without the fieldset, `seoData` is empty. See [SEO.md](references/SEO.md)
- [ ] Likes — like/unlike toggle on posts AND comments, pre-populated from `queryLikes()` on mount
- [ ] Comments & replies — visitor name input, member identity, nested replies, edit/delete own, like per comment
- [ ] View tracking — report views on post load via `httpClient.fetchWithAuth` to `/blog/v3/posts/{postId}/view`
- [ ] Premium/paid content — if pricing plans exist, support `post.preview` with paywall overlay and link to plans page

### Pricing Plans / Monetization

- [ ] Plans listing page (`/plans`) — plan cards, perks, pricing, subscribe button
- [ ] Checkout via `redirects.createRedirectSession` (handles login, free, and paid). NOTE: do NOT use `preferences: { checkIfPublish: true }` for plans — only for eCommerce checkout
- [ ] Success state after checkout redirect
- [ ] Blog post gating — set `pricingPlanIds` on premium posts, render paywall for non-subscribers

### Member Area

**Required for EVERY site, not just stores.** The member area is the site's self-service dashboard — any Wix headless site supports members, and those members need somewhere to manage their own account regardless of whether the site sells products, publishes posts, takes bookings, or just offers a community. Build it even if the site is "just a blog" or "just bookings." A site without a member area leaves its members with no way to update their own profile, change email, or reset password.

Customers must be able to **view AND edit** their own data — a read-only profile is not enough. A complete member area has four tabs:

- [ ] Authentication gate (redirect to `/api/auth/login?returnToUrl=/member` if not logged in)
- [ ] Logout via POST form (not a link — POST endpoint)
- [ ] Hash-based tab state (`/member#profile`, `#personal`, `#orders`, `#account`) so tabs are deep-linkable and survive reload
- [ ] **Profile tab (editable, `client:load` React)** — nickname, title/tagline, profile photo (upload + remove via `/api/profile-photo` server endpoint using `auth.elevate(files.generateFileUploadUrl)`), about/bio (saved as rich content via `membersAbout.updateMemberAbout` / `createMemberAbout`), privacy toggle (use `members.joinCommunity()` / `leaveCommunity()` — `updateMember` silently ignores `privacyStatus`)
- [ ] **Personal Info tab (editable, `client:load` React)** — first/last name, company, job title, birthdate, phone (normalize to E.164 before save), full address (street, line 2, city, state/province, country, postal code)
- [ ] **Orders tab (conditional — only if site has a store)** — order history with line item images (via `getImageUrl()`), quantities, prices, status badges (color-coded), totals. Server-rendered. Omit the tab entirely on non-store sites. Other feature-specific tabs follow the same pattern: Bookings tab if site has bookings, Subscriptions tab if site has pricing plans, etc.
- [ ] **Account tab (`client:load` React)** — change login email (`authentication.changeLoginEmail`), send password reset email (`authentication.sendSetPasswordEmail`), change password inline (OAuthStrategy + loginV2 + getMemberTokensForDirectLogin + changePassword pattern). See [MEMBER_AREA.md](references/MEMBER_AREA.md) → "Change Password Pattern"

---

## Stores V3 SDK — Key Differences from V1

V3 field paths differ significantly. Read [ECOMMERCE_V3.md](references/ECOMMERCE_V3.md) for the complete mapping. Quick reference:

| What | V3 path | V1 path (wrong for V3) |
|------|---------|----------------------|
| Image | `product.media?.main?.image` (string) | `product.media?.mainMedia?.image?.url` |
| Price | `product.actualPriceRange?.minValue?.amount` | `product.priceRange?.minValue` |
| Ribbon | `product.ribbon?.name` (object) | `product.ribbon` (renders [object Object]) |
| Variants | `product.variantsInfo?.variants` | `product.variants` |
| Option choices | `opt.choicesSettings?.choices?.map(c => c.name)` | `opt.choices`, `c.value` |

⚠️ Both variants and options use `_id` (not `id`). Use `v._id` and `opt._id` directly — no `as any` needed.

⚠️ Use `getProductBySlug` for detail pages — `queryProducts().eq('slug', slug)` may not return options/variants.

⚠️ `@wix/stores` does NOT export `categories` — install and use `@wix/categories` package instead.
