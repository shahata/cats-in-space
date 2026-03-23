---
name: wix-headless
description: "Use when building or working on Wix managed headless projects. Covers scaffolding, Astro + Wix SDK patterns, CMS collections, image handling, dynamic routes, deployment, authentication, members, media helpers, Wix Blog (posts, tags, likes, comments, rich content), Wix Stores (cart, checkout, orders), Wix Bookings (services, staff, availability), Wix Pricing Plans, Wix Multilingual (translations, RTL, i18n), homepage/navigation/layout patterns, CMS listing and detail pages, member dashboard, and general coding conventions. Trigger on Wix headless, headless site, Wix CMS, Wix Astro, wix managed, wix SDK, Wix Blog, Wix Stores, Wix Bookings, Wix Pricing Plans, multilingual, translation, i18n, RTL, member dashboard, homepage, navigation, layout."
---

# Wix Managed Headless - Developer Guide

## Reference Guides

When working on a specific feature area, read the relevant reference guide:

- **Homepage, Navigation & Layout** (`references/HOMEPAGE_LAYOUT.md`) — Layout structure, RTL support, CSS variables, navigation, cart sidebar, homepage sections
- **CMS Data Pages** (`references/CMS_DATA_PAGES.md`) — Listing and detail page patterns for CMS collections (planets, crew, missions)
- **Blog Posts** (`references/BLOG_POSTS.md`) — Posts, tags, writers, rich content (ricos), blog listing/detail page guidelines
- **Blog Engagement** (`references/BLOG_ENGAGEMENT.md`) — Likes, comments, replies, views, metrics, engagement UI guidelines
- **eCommerce Store** (`references/ECOMMERCE.md`) — Store listing page, product detail, cart, checkout, orders, back-in-stock
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

### OpenAI API Key

Image and video generation requires an **OpenAI API key**. If one is not already configured in the environment, ask the user to provide it before proceeding with media generation. Use OpenAI's image generation APIs for images and video generation APIs for video.

### Workflow

1. **Generate** the image/video via OpenAI API. Request a URL response format when available — URLs can be passed directly to the Wix import endpoint.
2. **Upload to Wix:** `POST https://www.wixapis.com/site-media/v1/files/import` with `{ "url": "...", "mimeType": "image/png", "displayName": "..." }`. The returned `file.url` is usable immediately even while `operationStatus` is `PENDING`.
3. **Attach at creation time** — include media when creating entities, not as a separate step. For products, use `media.itemsInfo.items` inline. For CMS items, set IMAGE fields directly. For blog posts, set the `media.wixMedia.image` field.
4. **Add images one at a time via MCP** (batching may silently drop).
5. For **video**: generate via OpenAI → temp host if needed → Wix Import File API → attach by media `id`.

## Deployment

**CRITICAL:** Always run `npm run build` before `npm run preview` or `npm run release`. The build step compiles the project and catches TypeScript and template errors. Deploying without building first will use stale build output or fail.

| Command | Purpose |
|---------|---------|
| `npm run build` | Production build — **run this first** |
| `npm run preview` | Deploy preview (unique URL each time) |
| `npm run release` | Deploy to production |

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
- Type check with `npx astro check` (not `tsc --noEmit`) — `tsc` does NOT check `.astro` files
- Use `as Function` (not `as any`) for SDK overload workarounds

### Translations
- **Enable in astro config**: `wix({ essentials: true, translations: true })` — without this, `i18n.getTranslationFunction()` throws `"Host translation resources are not available"`
- **Required files**: `src/translations.json` (flat key-value), `.wix/multilingual/metadata.json` (`{"primaryLanguageCode": "en"}`), and `.wix/multilingual/translations/` directory (can be empty). Build fails without these when `translations: true` is set.
- **Git**: The scaffold gitignores `.wix/` entirely. Add `!.wix/multilingual/` to `.gitignore` so the metadata and translations directory are committed.
- Use `i18n.getTranslationFunction()` from `@wix/essentials` for ALL user-visible text — works in both Astro pages and React components (`client:load`)
- Never hardcode English text in pages or components — add keys to `src/translations.json` and use `t('group.key')`
- In React components, call `const t = i18n.getTranslationFunction()` inside the component function (not at module level)
- Requires `@wix/essentials` >= 1.0.6

### React Islands in Astro
- Don't use inline `<style>{...}` in React — causes hydration mismatch due to HTML entity encoding. Put styles in Astro `<style>` with `:global()`
- No generic types with angle brackets in Astro template expressions (e.g., `Record<string, any>` breaks the parser). Define types in frontmatter

### Wix SDK Gotchas
- **Always use SDK methods over manual REST calls** — SDK methods handle auth, types, and response shapes correctly. Don't use `httpClient.fetchWithAuth` with manual REST URLs when an SDK method exists. When one SDK method returns an object (e.g. `SlotAvailability`), pass it directly to the next SDK method that accepts it — don't reconstruct objects manually
- `getCurrentCart` returns Cart directly, not `{ cart }`
- `searchOrders` takes OrderSearch directly, not `{ search: OrderSearch }`
- `estimateCurrentCartTotals` response: `priceSummary` at top level, not under `estimatedTotals`
- `httpClient.fetchWithAuth` from `@wix/essentials` — only use when no SDK method exists for the endpoint. Import from main module, NOT subpath
- `media` from `@wix/sdk` for image/video URLs — `media.getImageUrl()`, `media.getScaledToFillImageUrl()`, `media.getVideoUrl()`
