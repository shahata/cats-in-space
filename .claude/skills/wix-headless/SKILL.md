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

---

## Feature Checklists

Before building any feature area, verify you will implement ALL items from the relevant checklist. Create tasks for every item — including data seeding — before writing code.

### Store

- [ ] Store listing page (`/store`) — category filtering, product cards, category badges, out-of-stock overlay, pre-order badge, price range display
- [ ] Product detail page (`/store/[slug]`) — image gallery, options (text + swatch), modifiers (free text + text choices + swatch choices), variants, add-to-cart, back-in-stock form, info sections accordion, related products, pre-order badge
- [ ] Cart sidebar — line item images (via `getImageUrl()`), quantities, checkout
- [ ] Thank you page (`/store/thank-you`)
- [ ] Member area (`/member`) with order history — customers must be able to see past orders
- [ ] Navigation with login/logout state detection
- [ ] **Data seeding (do not skip):**
  - [ ] Products with images, descriptions, ribbons, physicalProperties
  - [ ] Categories with images, products assigned
  - [ ] Options/variants — at least one TEXT_CHOICES and one SWATCH_CHOICES product, multiple variants at different prices
  - [ ] Modifiers — at least one FREE_TEXT, one TEXT_CHOICES, one SWATCH_CHOICES, attached to products
  - [ ] Info sections — created and assigned to products
  - [ ] Pre-order — at least one product with `trackQuantity: true`, `quantity: 0`, `preorderInfo`
  - [ ] Out-of-stock variant — at least one variant marked out-of-stock for back-in-stock flow
  - [ ] Inventory created for all new variants after attaching options

### Blog

- [ ] Blog listing page (`/blog`) — tag filtering, cover images, metrics
- [ ] Blog detail page (`/blog/[slug]`) — rich content rendering
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

- [ ] Authentication gate (redirect to login if not logged in)
- [ ] Order history tab with line item images (via `getImageUrl()`)
- [ ] Profile tab
- [ ] Logout via POST form (not a link)

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

⚠️ Variant `_id` vs `id` mismatch: TypeScript shows `id` but runtime value is `_id`. Use `(v as any)._id || v.id`.

⚠️ Use `getProductBySlug` for detail pages — `queryProducts().eq('slug', slug)` may not return options/variants.

⚠️ `@wix/stores` does NOT export `categories` — use `httpClient.fetchWithAuth` to call `POST /categories/v1/categories/search`.
