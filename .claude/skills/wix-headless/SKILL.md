---
name: wix-headless
description: "Use when building or working on Wix managed headless projects. Covers scaffolding, Astro + Wix SDK patterns, CMS collections, image handling, dynamic routes, deployment, authentication, members, media helpers, Wix Blog (posts, tags, likes, comments, rich content), Wix Stores (cart, checkout, orders), Wix Gift Cards (gift card products, purchase flow, checkout integration), Wix Restaurants (menus, items, modifiers, table reservations, online ordering), Wix Events (ticketed events, ticket definitions, reservations, cinema/seat selection), Wix Bookings (services, staff, availability), Wix Pricing Plans, Wix Multilingual (translations, RTL, i18n), homepage/navigation/layout patterns, CMS listing and detail pages, member dashboard, and general coding conventions. Trigger on Wix headless, headless site, Wix CMS, Wix Astro, wix managed, wix SDK, Wix Blog, Wix Stores, Wix Gift Cards, gift card, Wix Restaurants, restaurant, menu, Wix Events, events, cinema, tickets, Wix Bookings, Wix Pricing Plans, multilingual, translation, i18n, RTL, member dashboard, homepage, navigation, layout."
---

# Wix Managed Headless - Developer Guide

## MANDATORY FEATURE CHECKLISTS — READ BEFORE BUILDING

**STOP. Before building ANY feature area, verify you will implement ALL required items from the relevant checklist below. Do NOT skip items — these are non-negotiable. Check each item off as you build.**

**CRITICAL — RECURRING FAILURE:** Agents repeatedly build only the obvious pages (listing, detail, cart) and skip backend data model work (variants/options, modifiers, info sections, pre-order inventory, out-of-stock setup, back-in-stock notifications). This forces the user to ask "why didn't you do what the skill said?" and wastes an entire round-trip. **You MUST create tasks for EVERY checklist item — including all data seeding steps — BEFORE writing any code.** After building, re-read this checklist line by line and verify every item is implemented. A feature is NOT done until every checkbox below is checked off.

### Store — ALL required:
- [ ] Store listing page (`/store`) with category filtering, product cards, category badges, out-of-stock overlay, pre-order badge, price range display
- [ ] Product detail page (`/store/[slug]`) with image gallery, options (text + swatch), modifiers (free text + text choices + swatch choices), variants, add-to-cart, back-in-stock form, info sections accordion, related products, pre-order badge
- [ ] Cart sidebar with line item images (**use `getImageUrl()`!**), quantities, checkout
- [ ] Thank you page (`/store/thank-you`)
- [ ] **Member area (`/member`) with order history** — customers MUST be able to see past orders
- [ ] Navigation with login/logout state detection
- [ ] **Data seeding — do NOT skip these:**
  - [ ] Products with images, descriptions, ribbons, physicalProperties
  - [ ] Categories with images, products assigned to categories
  - [ ] **Options/variants** — at least one product with TEXT_CHOICES (e.g., Size) and one with SWATCH_CHOICES (e.g., Color), with multiple variants at different prices
  - [ ] **Modifiers** — at least one FREE_TEXT (e.g., gift message), one TEXT_CHOICES (e.g., gift wrapping), one SWATCH_CHOICES (e.g., accent color), attached to products
  - [ ] **Info sections** — create and assign to products (e.g., Care Instructions, Shipping, Certifications)
  - [ ] **Pre-order** — at least one product set up with `trackQuantity: true`, `quantity: 0`, `preorderInfo`
  - [ ] **Out-of-stock variant** — at least one variant marked out of stock to exercise back-in-stock notification flow
  - [ ] Inventory explicitly created for all new variants after attaching options

### Blog — ALL required:
- [ ] Blog listing page (`/blog`) with tag filtering, cover images, metrics
- [ ] Blog detail page (`/blog/[slug]`) with rich content rendering
- [ ] **Likes** — like/unlike toggle on posts AND comments, pre-populated from `queryLikes()` on mount
- [ ] **Comments & replies** — full comment system: visitor name input, member identity, nested replies, edit/delete own, like per comment. Comments are NOT optional.
- [ ] **View tracking** — report views on post load via `httpClient.fetchWithAuth` to `/blog/v3/posts/{postId}/view`
- [ ] **Premium/paid content** — if pricing plans exist, support `post.preview` with paywall overlay and link to plans page

### Pricing Plans / Monetization — ALL required when site has paid content:
- [ ] Plans listing page (`/plans`) with plan cards, perks, pricing, subscribe button
- [ ] Checkout via `redirects.createRedirectSession` (handles login, free, and paid). NOTE: do NOT use `preferences: { checkIfPublish: true }` for plans — only for eCommerce checkout.
- [ ] Success state after checkout redirect
- [ ] Blog post gating — set `pricingPlanIds` on premium posts, render paywall for non-subscribers

### Media — applies to ALL features:
- [ ] **EVERY image from ANY Wix SDK response** must go through `getImageUrl()` before rendering — this includes product images, cart line items, order line items, blog covers, member photos, CMS images. Raw `wix:image://` strings do NOT render.

### Member Area — ALL required when site has a store or plans:
- [ ] Authentication gate (redirect to login if not logged in)
- [ ] Order history tab with line item images (via `getImageUrl()`!), status badges
- [ ] Profile tab
- [ ] Logout via POST form (not a link)

---

## Reference Guides

When working on a specific feature area, read the relevant reference guide:

- **Homepage, Navigation & Layout** (`references/HOMEPAGE_LAYOUT.md`) — Layout structure, RTL support, CSS variables, navigation, cart sidebar, homepage sections
- **CMS Data Pages** (`references/CMS_DATA_PAGES.md`) — Listing and detail page patterns for CMS collections (planets, crew, missions)
- **Blog Posts** (`references/BLOG_POSTS.md`) — Posts, tags, writers, rich content (ricos), blog listing/detail page guidelines
- **Blog Engagement** (`references/BLOG_ENGAGEMENT.md`) — Likes, comments, replies, views, metrics, engagement UI guidelines
- **eCommerce Store** (`references/ECOMMERCE.md`) — Store listing page, product detail, cart, checkout, **member area with order history (required)**, back-in-stock
  - V1 Catalog details: `references/ECOMMERCE_V1.md`
  - V3 Catalog details: `references/ECOMMERCE_V3.md`
- **Bookings** (`references/BOOKINGS.md`) — Bookings listing page, service cards, staff grid, booking flow wizard, availability
- **Pricing Plans** (`references/PRICING_PLANS.md`) — Plans listing page, plan cards, checkout flow, subscriptions, cancellation
- **Member Area** (`references/MEMBER_AREA.md`) — Protected routes, tabbed dashboard, profile management, orders, subscriptions, bookings, payment
- **Media Handling** (`references/MEDIA.md`) — wix:image:// and wix:video:// formats, URL helpers, SDK vs REST differences
- **Multilingual** (`references/MULTILINGUAL.md`) — Static translations, Translation Content API, RTL support, currency formatting

## Project Setup

### Scaffolding

**Before scaffolding**, list the working directory to check for existing folders and pick a `--project-name` that doesn't conflict.

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

**CRITICAL — Upgrade `@wix/essentials` immediately after scaffolding:**
```bash
npm install @wix/essentials@latest
```
The scaffold ships `@wix/essentials` ~0.1.x which does NOT have `i18n.getTranslationFunction()`. This causes a runtime `TypeError` that is NOT caught at build time. You MUST upgrade to >= 1.0.6 before using translations.

### Key Files

| File | Purpose |
|------|---------|
| `wix.config.json` | Contains `appId` and `siteId` — links local project to Wix |
| `astro.config.mjs` | Astro config with `wix()`, `wixPages()`, `react()` integrations |
| `.env.local` | Client ID, secret, public key, cloud provider setting |
| `.wix/topology.json` | Production URLs |

### CLI Commands

```bash
npm run dev        # wix dev — local dev server with hot reload
npm run build      # wix build — production build
npm run preview    # wix preview — deploy a preview (unique URL each time)
npm run release    # wix release — deploy to production
npm run generate   # wix generate — code generation
```

## Astro + Wix SDK

### Authentication is Automatic

In a Wix managed headless project, you do **NOT** need to create an SDK client or handle OAuth. The `@wix/astro` integration handles all authentication. Just import SDK modules and use them directly:

```astro
---
import { items } from '@wix/data';

const result = await items.query('MyCollection').find();
const myItems = result.items;
---
```

### Data Item Shape

**CRITICAL:** Items returned from `items.query().find()` have fields **directly on the object**, NOT nested under `.data`.

```typescript
// CORRECT
result.items[0].title      // ✅
result.items[0]._id        // ✅

// WRONG — .data does NOT exist in managed headless SDK
result.items[0].data.title  // ❌ TypeError
```

### Query API

```typescript
import { items } from '@wix/data';

const result = await items.query('CollectionId').find();
await items.query('Collection').descending('score').find();
await items.query('Collection').eq('status', 'Active').find();
await items.query('Collection').limit(4).find();
```

### Result Shape

```typescript
result.items        // Array of items
result.totalCount   // Total count (if requested)
result.hasNext()    // Whether there are more pages
```

### Installing SDK Packages

```bash
npm install @wix/data       # CMS data operations
npm install @wix/members    # Members API
npm install @wix/stores     # Stores API
npm install @wix/blog       # Blog API
npm install @wix/comments   # Comments API
npm install @wix/ecom       # Cart, checkout, orders
npm install @wix/redirects  # Redirect sessions (checkout, plans)
```

## CMS Collections

### Creating Collections (via REST API / MCP)

**Endpoint:** `POST https://www.wixapis.com/wix-data/v2/collections`

```json
{
  "collection": {
    "id": "MyCollection",
    "displayName": "My Collection",
    "displayField": "title",
    "fields": [
      { "key": "title", "displayName": "Title", "type": "TEXT", "required": true },
      { "key": "slug", "displayName": "Slug", "type": "TEXT", "required": true },
      { "key": "description", "displayName": "Description", "type": "TEXT" },
      { "key": "image", "displayName": "Image", "type": "IMAGE" },
      { "key": "score", "displayName": "Score", "type": "NUMBER" }
    ],
    "permissions": { "insert": "ADMIN", "update": "ADMIN", "remove": "ADMIN", "read": "ANYONE" }
  }
}
```

### Field Types

| Type | Description | Example Value |
|------|-------------|---------------|
| `TEXT` | String | `"Hello World"` |
| `NUMBER` | Numeric | `99.99` |
| `BOOLEAN` | True/false | `true` |
| `DATE` | Date only | `"2024-01-15"` |
| `DATETIME` | Date and time | `{ "$date": "2024-01-15T10:00:00.000Z" }` |
| `IMAGE` | Image reference | `"wix:image://v1/..."` |
| `URL` | Web URL | `"https://example.com"` |
| `RICH_TEXT` | HTML content | `"<p>Rich text</p>"` |
| `REFERENCE` | Single reference | Item ID string |
| `MULTI_REFERENCE` | Multiple references | Array of IDs |

### Inserting Data

**Single:** `POST https://www.wixapis.com/wix-data/v2/items`
```json
{ "dataCollectionId": "MyCollection", "dataItem": { "data": { "title": "Item", "slug": "item" } } }
```

**Bulk:** `POST https://www.wixapis.com/wix-data/v2/bulk/items/insert`
```json
{ "dataCollectionId": "MyCollection", "dataItems": [{ "data": { "title": "Item A" } }], "returnEntity": true }
```

**IMPORTANT:** Bulk patch uses `patches` array with `fieldModifications`, NOT `dataItems`. Wrong shape = `WDE0080` error.
**IMPORTANT:** `MULTI_REFERENCE` cannot be set via insert/update/patch, use dedicated reference endpoints.

## Images / Media

### Upload to Wix Media Manager

`POST https://www.wixapis.com/site-media/v1/files/import`
```json
{ "url": "https://example.com/image.png", "mimeType": "image/png", "displayName": "my-image.png" }
```

Returns `file.url` (wixstatic.com) — usable immediately even while `operationStatus` is `PENDING`.

### Wix Image Format

IMAGE fields store: `wix:image://v1/{mediaId}/{filename}#originWidth={w}&originHeight={h}`

### Wix Media Helpers

Use `media` from `@wix/sdk` instead of building URLs manually. Recommended utility pattern:

```typescript
import { media } from '@wix/sdk';

// Image: handles wix:image://, media IDs, and regular URLs
function getImageUrl(wixImage: string | undefined, width = 800, height = 800): string | null {
  if (!wixImage) return null;
  if (wixImage.startsWith('http')) return wixImage;
  if (wixImage.startsWith('wix:image://')) {
    try { return media.getScaledToFillImageUrl(wixImage, width, height, {}); } catch {}
    const parsed = media.getImageUrl(wixImage);
    return parsed?.url || null;
  }
  return `https://static.wixstatic.com/media/${wixImage}`;
}

// Video: parses wix:video:// → playable URL + thumbnail image
function getVideoUrl(wixVideo: string | undefined, thumbW = 800, thumbH = 800): { url: string; thumbnail: string | null } | null {
  if (!wixVideo) return null;
  if (wixVideo.startsWith('http')) return { url: wixVideo, thumbnail: null };
  if (wixVideo.startsWith('wix:video://')) {
    const result = media.getVideoUrl(wixVideo);
    return { url: result.url, thumbnail: result.thumbnail ? getImageUrl(result.thumbnail, thumbW, thumbH) : null };
  }
  return { url: `https://video.wixstatic.com/video/${wixVideo}/file`, thumbnail: null };
}
```

For Wix Stores `ProductMedia` objects, combine into a single helper:
```typescript
import type { productsV3 } from '@wix/stores';

function extractMediaUrl(m: productsV3.ProductMedia | undefined, w = 800, h = 800): { type: 'image' | 'video'; url: string; thumbnail?: string } | null {
  if (!m) return null;
  if (m.mediaType === 'VIDEO' && m.video) {
    const video = getVideoUrl(m.video, w, h);
    if (video) return { type: 'video', url: video.url, ...(video.thumbnail ? { thumbnail: video.thumbnail } : {}) };
    return null;
  }
  if (m.image) {
    const imageUrl = getImageUrl(m.image, w, h);
    if (imageUrl) return { type: 'image', url: imageUrl };
  }
  return null;
}
```

## Dynamic Routes

Use Astro's `[slug].astro` pattern — no `getStaticPaths()` needed since `output: "server"`:

```astro
---
import { items } from '@wix/data';
const { slug } = Astro.params;
const result = await items.query('MyCollection').eq('slug', slug).find();
if (result.items.length === 0) return Astro.redirect('/');
const item = result.items[0];
---
```

## Media Generation

**Every entity that supports an image should have one.** Pages without images look incomplete — this applies to products, categories, blog posts, services, staff members, CMS collection items, and any other entity with an image field.

**Always generate images and videos using AI** — do not import pre-existing stock images or placeholder images unless the user explicitly provides URLs or asks to use specific existing images. AI-generated media ensures unique, on-brand visuals for every entity.

### Wix Runware API (Preferred for Image Generation)

Use the **Wix Runware API** to generate images via `npx wix token` + curl. The MCP `CallWixSiteAPI` tool **cannot** be used for Runware because it rejects the required array body format.

**How to call:**
```bash
SITE_TOKEN=$(npx wix token -s <siteId>) && \
curl -s -X POST "https://www.wixapis.com/runwareschemaless/v1/request" \
  -H "Content-Type: application/json" \
  -H "Authorization: $SITE_TOKEN" \
  -H "wix-site-id: <siteId>" \
  -H "wix-account-id: <accountId>" \
  -d '[{
    "taskType": "imageInference",
    "taskUUID": "<generate-a-unique-uuid>",
    "outputType": "URL",
    "outputFormat": "jpg",
    "positivePrompt": "descriptive prompt for the image",
    "height": 1024,
    "width": 1024,
    "model": "google:4@2",
    "numberResults": 1
  }]'
```

**IMPORTANT:**
- `siteId`: from `wix.config.json` in the project
- `accountId`: the `uid` or `siteOwnerId` from the token payload (decode the JWT middle segment)
- Use `-s` (site-scoped) flag with `npx wix token` — the default account token returns "Permission denied"
- The `wix-account-id` header is **required** — without it you get "Permission denied"
- Generate a unique UUID for each request

**Response:** Returns `data[].imageURL` — a publicly accessible URL that can be passed directly to the Wix Media Import endpoint.

### OpenAI API (Fallback)

If the Wix Runware API is unavailable or for video generation, use OpenAI's APIs. **You MUST ask the user to provide their OpenAI API key** — do not attempt to find, guess, or look for it in environment variables or files on your own.

### Workflow

1. **Generate** the image via the Wix Runware API (preferred) or OpenAI API (fallback). Both return URLs that can be passed directly to the Wix import endpoint.
2. **Upload to Wix:** `POST https://www.wixapis.com/site-media/v1/files/import` with `{ "url": "...", "mimeType": "image/png", "displayName": "..." }`. The returned `file.url` is usable immediately even while `operationStatus` is `PENDING`.
3. **Attach at creation time** — include media when creating entities, not as a separate step. For products, use `media.itemsInfo.items` inline. For CMS items, set IMAGE fields directly. For blog posts, set the `media.wixMedia.image` field.
4. **Add images one at a time via MCP** (batching may silently drop).
5. For **video**: generate via OpenAI → temp host if needed → Wix Import File API → attach by media `id`.

## Frontend Design

**Use the `frontend-design` skill for all page styling.** When building any headless site pages (store, blog, homepage, member area, etc.), invoke the `frontend-design` skill to create production-grade, distinctive UI. Avoid generic layouts with system fonts and default colors.

Key principles:
- **Typography**: Use Google Fonts with distinctive choices — pair a display/serif font for headings with a clean sans-serif for body. Avoid system fonts, Inter, Roboto, Arial.
- **CSS variables**: Define a design token system (`--font-display`, `--bg`, `--surface`, `--accent`, `--border`, etc.) in the Layout's global styles. All pages and components should reference these variables for consistency.
- **React components**: Since React islands can't use Astro scoped styles, use inline style objects that reference the same token values (hardcoded as strings matching the CSS variables).
- **Cohesive palette**: Pick a warm/cool direction and commit. Use border colors, muted text colors, and surface colors that all belong to the same temperature.

## Deployment

**The deploy sequence is exactly these 3 commands, in this order. Do NOT skip step 1 or 2.**

```bash
# Step 1: Type check — catches errors that build silently ignores (wrong field names, bad types from REST responses)
npx astro check

# Step 2: Build — compiles the project
npm run build

# Step 3: Deploy
npm run preview   # or: npm run release
```

**Why all 3 steps are mandatory:** `npm run build` uses Vite which does NOT do strict type checking — it bundles `any`-typed code without complaint. `npx astro check` is the only thing that catches type errors in `.astro` files. Skipping it has repeatedly led to deploying broken code (e.g., accessing `cat._id` when the REST API returns `cat.id`). Install `@astrojs/check` if not present.

## Authentication (Login/Logout)

The Wix Astro middleware provides auth endpoints out of the box:

- **Login:** `<a href="/api/auth/login">` — GET, redirects to Wix login page. Supports `returnToUrl` query param: `/api/auth/login?returnToUrl=/current-page`
- **Logout:** `<form action="/api/auth/logout" method="POST">` — **POST** handler, use a form not a link. Also supports `returnToUrl`.

**Detect login state server-side:**
```astro
---
import { members } from '@wix/members';
let memberName: string | null = null;
try {
  const res = await members.getCurrentMember({ fieldsets: ['FULL'] });
  if (res.member) memberName = res.member.profile?.nickname || res.member.contact?.firstName || 'Member';
} catch {}
---
```

**CRITICAL:** `getCurrentMember()` returns `{ member?: Member }` (wrapped response), NOT `Member` directly.

**CRITICAL:** `/api/auth/logout` is a **POST** endpoint. Use a `<form>` with `method="POST"`, not an `<a>` link.

### Member Profile Management

```typescript
import { members } from '@wix/members';

await members.updateMember(member._id, {
  profile: { nickname: "New Name", title: "New Title" },
  contact: { firstName: "First", lastName: "Last", company: "Co", jobTitle: "Job", birthdate: "2000-01-15" },
});
```

**Member fields:**
- **Profile (public):** `nickname`, `title`, `photo` (`{ url, _id, width, height }`), `slug`, `cover`
- **Contact (private):** `firstName`, `lastName`, `phones`, `emails`, `addresses`, `birthdate`, `company`, `jobTitle`

**Remove profile photo:** Send `{ url: "" }` — not `null`.

**CRITICAL:** `updateMember` silently ignores `privacyStatus`. Use `members.joinCommunity()` (PUBLIC) and `members.leaveCommunity()` (PRIVATE).

**CRITICAL:** `members.getMember()` returns `Member` directly, NOT `{ member: Member }`.

### Member About (Bio)

```typescript
import { membersAbout } from '@wix/members';
const res = await membersAbout.getMyMemberAbout();
const content = res.memberAbout?.content; // RichContent (Ricos format)
```

**CRITICAL:** `getMyMemberAbout()` returns `{ memberAbout }` (wrapped), but `getMemberAbout(id)` returns `MemberAbout` directly.

### Member Authentication

```typescript
import { authentication } from '@wix/members';
await authentication.changeLoginEmail(memberId, newEmail);
await authentication.sendSetPasswordEmail(email);
```

**CRITICAL:** Both require **member identity** — call from client-side. `auth.elevate()` strips member identity.

**Phone numbers must be E.164 format:** `+[country code][number]`.

### File Upload to Wix Media

`files.generateFileUploadUrl` requires `Manage Media Manager` permission — visitors/members get 403. Use `auth.elevate()` server-side.

**Pattern:** Create a server API endpoint, handle the entire upload there:

```typescript
// src/pages/api/upload-url.ts
import type { APIRoute } from 'astro';
import { files } from '@wix/media';
import { auth } from '@wix/essentials';

export const POST: APIRoute = async ({ request }) => {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  const elevatedGenerate = auth.elevate(files.generateFileUploadUrl);
  const { uploadUrl } = await elevatedGenerate(file.type, { fileName: file.name });
  const uploadRes = await fetch(uploadUrl!, { method: 'PUT', headers: { 'Content-Type': file.type }, body: Buffer.from(await file.arrayBuffer()) });
  const data = await uploadRes.json();
  return new Response(JSON.stringify({ id: data.file?.id, url: data.file?.url }));
};
```

**CRITICAL:** Do NOT upload from the browser directly — causes ERR_BLOCKED_BY_ORB. Handle both `generateFileUploadUrl` and PUT on the server.

**CRITICAL:** `auth.elevate()` only works server-side (Astro API routes, not client-side React).

## Price Formatting

```typescript
import { i18n } from '@wix/essentials';
const locale = await i18n.getLocale();
const fmt = (n: number) => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n);
```

## Coding Conventions

### SDK Types
- Always prefer SDK types (`cart.LineItem`, `cart.CatalogReference`, `productsV3.ProductMedia`, etc.) over custom types like `Record<string, unknown>`
- Import types: `import type { cart as cartTypes } from '@wix/ecom'`, `import type { productsV3 as productsV3Types } from '@wix/stores'`
- **Never use `as any`, `as unknown as`, or `Record<string, any>` to cast SDK objects.** If the type doesn't match, the implementation is wrong — fix the code, not the type.

### TypeScript
- Use `astro/tsconfigs/strictest` — use `?? null` (not `|| undefined`) for optional properties typed as `string | null`
- **ALWAYS run `npx astro check` before deploying** (not `tsc --noEmit`) — `tsc` does NOT check `.astro` files. This catches type errors like wrong return shapes (e.g., `createCheckoutFromCurrentCart` returns `{ checkoutId }` not `{ _id }`), wrong method signatures (e.g., `searchOrders` takes `OrderSearch` directly, not `{ search: OrderSearch }`), and missing properties. Install `@astrojs/check` if not present.
- Use `as Function` (not `as any`) for SDK overload workarounds

### Translations
- **Enable in astro config**: `wix({ essentials: true, translations: true })` — without this, `i18n.getTranslationFunction()` throws `"Host translation resources are not available"`
- **Required files**: `src/translations.json` (flat key-value), `.wix/multilingual/metadata.json` (`{"primaryLanguageCode": "en"}`), and `.wix/multilingual/translations/` directory (can be empty). Build fails without these when `translations: true` is set.
- **Git**: The scaffold gitignores `.wix/` entirely. Add `!.wix/multilingual/` to `.gitignore` so the metadata and translations directory are committed.
- Use `i18n.getTranslationFunction()` from `@wix/essentials` for ALL user-visible text — works in both Astro pages and React components (`client:load`)
- Never hardcode English text in pages or components — add keys to `src/translations.json` and use `t('group.key')`
- In React components, call `const t = i18n.getTranslationFunction()` inside the component function (not at module level)
- **CRITICAL:** Requires `@wix/essentials` >= 1.0.6. The scaffold ships ~0.1.x which does NOT have this function — run `npm install @wix/essentials@latest` after scaffolding or you get a runtime TypeError that build does NOT catch

### React Islands in Astro
- Don't use inline `<style>{...}` in React — causes hydration mismatch due to HTML entity encoding. Put styles in Astro `<style>` with `:global()`
- No generic types with angle brackets in Astro template expressions (e.g., `Record<string, any>` breaks the parser). Define types in frontmatter

### Wix SDK Gotchas
- **Always use SDK methods over manual REST calls** — SDK methods handle auth, types, and response shapes correctly. Don't use `httpClient.fetchWithAuth` with manual REST URLs when an SDK method exists. When one SDK method returns an object (e.g. `SlotAvailability`), pass it directly to the next SDK method that accepts it — don't reconstruct objects manually
- `getCurrentCart` returns Cart directly, not `{ cart }`
- `searchOrders` takes OrderSearch directly, not `{ search: OrderSearch }` — wrapping in `{ search: {} }` causes a type error
- `createCheckoutFromCurrentCart` returns `{ checkoutId }` — NOT a checkout object with `_id`. Use `const { checkoutId } = await currentCart.createCheckoutFromCurrentCart(...)`, NOT `c._id`
- `createCheckoutFromCurrentCart` is on `currentCart`, NOT `checkout` — importing from `checkout` fails at build time
- `estimateCurrentCartTotals` response: `priceSummary` at top level, not under `estimatedTotals`
- `httpClient.fetchWithAuth` from `@wix/essentials` — only use when no SDK method exists for the endpoint. Import from main module, NOT subpath
- `media` from `@wix/sdk` for image/video URLs — `media.getImageUrl()`, `media.getScaledToFillImageUrl()`, `media.getVideoUrl()`
- **ALL media fields from ALL Wix SDK responses are `wix:image://` or `wix:video://` strings** — they CANNOT be used directly as `<img src>` or `<video src>`. You MUST always pass them through `getImageUrl()` / `getVideoUrl()` helpers before rendering. This applies everywhere: product images, cart line item images (`lineItem.image`), order line item images, blog cover images, member photos, CMS image fields, booking service images, etc. Forgetting this is a common bug — if you're displaying any image from a Wix SDK response, use the helper.

### Stores V3 SDK Gotchas (CRITICAL — read before building any store)
- **V3 field paths differ from V1** — see `references/ECOMMERCE_V3.md` → "V3 SDK Field Access Cheat Sheet" for the complete mapping. Key differences:
  - Image: `product.media?.main?.image` (string) — NOT `product.media?.mainMedia?.image?.url`
  - Price: `product.actualPriceRange?.minValue?.amount` — NOT `product.priceRange?.minValue`
  - Ribbon: `product.ribbon?.name` (object) — NOT `product.ribbon` (renders as [object Object])
  - Variants: `product.variantsInfo?.variants` — NOT `product.variants`
  - Option choices: `opt.choicesSettings?.choices?.map(c => c.name)` — NOT `opt.choices` or `c.value`
- **Variant `_id` vs `id` mismatch**: TypeScript type shows `id` but runtime value is `_id`. Always use `(v as any)._id || v.id`
- **Use `getProductBySlug` for detail pages**: `queryProducts().eq('slug', slug)` may not return options/variants
- **Categories: `@wix/stores` does NOT export `categories`** — use `httpClient.fetchWithAuth` from `@wix/essentials` to call `POST https://www.wixapis.com/categories/v1/categories/search` with `{ treeReference: { appNamespace: "@wix/stores" } }`. The `collections` export is V1-only.
- **Category filtering**: Fetch all products with `DIRECT_CATEGORIES_INFO` field, then filter client-side via `directCategoriesInfo.categories`
- **Product seeding workflow**: Create simple products first, then add options/variants/info sections/categories as separate steps. See `references/ECOMMERCE_V3.md` → "Recommended Product Seeding Workflow" for the full 9-step process.
- **Image generation**: See "Media Generation" section below for the Runware workflow.
