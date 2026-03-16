---
name: wix-headless
description: Core Wix managed headless guide. Covers scaffolding, Astro + Wix SDK patterns, CMS collections, image handling, dynamic routes, and deployment. Trigger on Wix headless, headless site, Wix CMS, Wix Astro, wix managed, wix SDK data queries.
---

# Wix Managed Headless - Developer Guide

## Project Setup

### Scaffolding

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
await items.query('Planets').descending('habitabilityScore').find();
await items.query('Planets').eq('status', 'Top Candidate').find();
await items.query('CatExplorers').limit(4).find();
await items.query('Missions').eq('planet', 'Purrion-7').descending('launchDate').limit(10).find();
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
npm install @wix/ricos      # Rich content viewer (React)
```

## CMS Collections

### Creating Collections (via REST API / MCP)

**Endpoint:** `POST https://www.wixapis.com/wix-data/v2/collections`

```json
{
  "collection": {
    "id": "Planets",
    "displayName": "Planets",
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
{ "dataCollectionId": "Planets", "dataItem": { "data": { "title": "Purrion-7", "slug": "purrion-7" } } }
```

**Bulk:** `POST https://www.wixapis.com/wix-data/v2/bulk/items/insert`
```json
{ "dataCollectionId": "Planets", "dataItems": [{ "data": { "title": "Planet A" } }], "returnEntity": true }
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

### Converting for Display

Use `media` from `@wix/sdk` instead of building URLs manually:

```typescript
import { media } from '@wix/sdk';

// Parse wix:image:// string to get URL and metadata
const parsed = media.getImageUrl('wix:image://v1/mediaId/file.png#originWidth=800&originHeight=600');
// Returns: { id, url, height, width, altText, filename }

// Get a scaled URL with specific dimensions
const url = media.getScaledToFillImageUrl('wix:image://...', 800, 600, {});

// Wrapper that handles all formats (wix:image://, media IDs, regular URLs)
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
```

## Dynamic Routes

Use Astro's `[slug].astro` pattern — no `getStaticPaths()` needed since `output: "server"`:

```astro
---
import { items } from '@wix/data';
const { slug } = Astro.params;
const result = await items.query('Planets').eq('slug', slug).find();
if (result.items.length === 0) return Astro.redirect('/planets');
const planet = result.items[0];
---
```

## Deployment

| Command | Purpose |
|---------|---------|
| `npm run preview` | Deploy preview (unique URL each time) |
| `npm run release` | Deploy to production |

## Authentication (Login/Logout)

The Wix Astro middleware provides auth endpoints out of the box:

- **Login:** `<a href="/api/auth/login">` — GET, redirects to Wix login page. Supports `returnToUrl` query param to redirect back after login: `/api/auth/login?returnToUrl=/current-page`
- **Logout:** `<form action="/api/auth/logout" method="POST">` — **POST** handler, use a form not a link. Also supports `returnToUrl` query param: `/api/auth/logout?returnToUrl=/current-page`

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
{memberName ? (
  <span>{memberName}</span>
  <form action="/api/auth/logout" method="POST"><button>Logout</button></form>
) : (
  <a href={`/api/auth/login?returnToUrl=${encodeURIComponent(currentPath)}`}>Login</a>
)}
```

**CRITICAL:** `getCurrentMember()` returns `{ member?: Member }` (wrapped response), NOT `Member` directly.

**CRITICAL:** `/api/auth/logout` is a **POST** endpoint. Use a `<form>` with `method="POST"`, not an `<a>` link.

### Member Profile Management

```typescript
import { members } from '@wix/members';

// Update member profile (client-side)
await members.updateMember(member._id, {
  profile: {
    nickname: "New Name",
    title: "New Title",
  },
  contact: {
    firstName: "First",
    lastName: "Last",
    company: "Company",
    jobTitle: "Job",
    birthdate: "2000-01-15",  // YYYY-MM-DD format
  },
});
```

**Member fields:**
- **Profile (public):** `nickname`, `title`, `photo` (`{ url, _id, width, height }`), `slug`, `cover`
- **Contact (private):** `firstName`, `lastName`, `phones`, `emails`, `addresses`, `birthdate`, `company`, `jobTitle`
- **Photo URL:** `member.profile.photo.url` — directly usable in `<img>` tags

**Protect member-only pages:**
```astro
---
const res = await members.getCurrentMember({ fieldsets: ['FULL'] });
if (!res.member) return Astro.redirect(`/api/auth/login?returnToUrl=${encodeURIComponent('/member')}`);
const member = res.member;
---
```

**Member area tab pattern:** Use URL hash fragments for tab navigation in the member area. Split MemberProfile into sections via a `tab` prop (`"profile"`, `"personal"`, `"account"`). Render one `<MemberProfile>` per tab panel with the appropriate tab value. Use a `<script>` block for hash-based tab switching. This keeps each tab lightweight and allows easy addition of new tabs.

**Remove profile photo:** Send `{ url: "" }` — not `null`, not `{ url: "", _id: "" }`.

**CRITICAL:** `updateMember` silently ignores `privacyStatus`. Use `members.joinCommunity()` (PUBLIC) and `members.leaveCommunity()` (PRIVATE) instead.

### Member About (Bio)

The about/bio is a **separate API**, not part of the Member profile:

```typescript
import { membersAbout } from '@wix/members';

// Read own about (client-side)
const res = await membersAbout.getMyMemberAbout();
const content = res.memberAbout?.content; // RichContent (Ricos format)
// Note: getMyMemberAbout returns { memberAbout } (wrapped)

// Read any member's about (server-side)
const result = await membersAbout.queryMemberAbouts().eq('memberId', memberId).limit(1).find();
const content = result.items[0]?.content; // RichContent

// Create about
await membersAbout.createMemberAbout({ memberId, content: richContent });

// Update about (requires revision)
await membersAbout.updateMemberAbout(aboutId, { content: richContent, revision });
```

**CRITICAL:** `getMyMemberAbout()` returns `{ memberAbout }` (wrapped), but `getMemberAbout(id)` returns `MemberAbout` directly. Use `queryMemberAbouts` for consistency.

**Content is RichContent (Ricos format)** — render with `RicosViewer`, create with PARAGRAPH/TEXT nodes.

### Member Authentication

```typescript
import { authentication } from '@wix/members';

// Change login email (client-side, needs member session)
await authentication.changeLoginEmail(memberId, newEmail);

// Send password reset email (client-side, needs member session)
await authentication.sendSetPasswordEmail(email);
```

**CRITICAL:** Both require **member identity** — call from client-side where the member session is active. `auth.elevate()` strips member identity and causes 403.

**Phone numbers must be E.164 format:** The API rejects phone numbers not in `+[country code][number]` format. Convert before saving:
```typescript
function toE164(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.length === 10) return `+1${cleaned}`; // assume US
  return `+${cleaned}`;
}
// Usage: phones: phone ? [toE164(phone)] : []
```

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

  // 1. Generate upload URL with elevated permissions
  const elevatedGenerate = auth.elevate(files.generateFileUploadUrl);
  const { uploadUrl } = await elevatedGenerate(file.type, { fileName: file.name });

  // 2. Upload file binary server-side (avoids CORS/ORB in browser)
  const uploadRes = await fetch(uploadUrl!, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: Buffer.from(await file.arrayBuffer()),
  });

  const data = await uploadRes.json();
  return new Response(JSON.stringify({ id: data.file?.id, url: data.file?.url }));
};
```

Client sends file as FormData:
```typescript
const formData = new FormData();
formData.append("file", file);
const res = await fetch("/api/upload-url", { method: "POST", body: formData });
const { id, url } = await res.json();
```

**CRITICAL:** Do NOT upload from the browser directly — the PUT to Wix upload servers causes ERR_BLOCKED_BY_ORB (cross-origin response blocking). Handle both `generateFileUploadUrl` and the PUT on the server.

**CRITICAL:** `auth.elevate()` only works server-side (Astro API routes, not client-side React).

## Tips & Gotchas

1. **No `.data` wrapper** — SDK query results have fields directly on items
2. **Server-rendered by default** — `output: "server"` means all pages are SSR
3. **Auth is automatic** — don't create SDK clients manually
4. **IMAGE fields need conversion** — `wix:image://` URLs must be parsed for `<img>` tags
5. **Dev server port** — defaults to 4321, auto-increments if busy
6. **`static.wixstatic.com`** — already in `astro.config.mjs` image domains
7. **`httpClient.fetchWithAuth`** from `@wix/essentials` for authenticated REST calls client-side. Import from main module, NOT subpath.
8. **Type checking** — Use `npx astro check` (not `tsc --noEmit`). `tsc` does NOT check `.astro` files.
9. **`members.getMember()`** returns `Member` directly, NOT `{ member: Member }`. The SDK unwraps it.
10. **Use `media` from `@wix/sdk`** for image URLs — `media.getImageUrl()`, `media.getScaledToFillImageUrl()`. Don't build URLs manually.
