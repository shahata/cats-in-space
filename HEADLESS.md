# Wix Managed Headless - Developer Guide

Everything learned from building a Wix managed headless site with CMS integration.

## Project Setup

### Scaffolding

```bash
npm create @wix/new@latest headless
```

The CLI is interactive and asks for:
1. **Business name** — appears in your Wix sites list
2. **Template** — choose from: Hello, Store, CMS, Commerce, Scheduler, Registration, Blank
3. **Frontend project name** — used for the OAuth client
4. **Directory** — local project location
5. **Publish now?** — optional immediate publish

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

**IMPORTANT:** Items returned from `items.query().find()` have fields **directly on the object**, NOT nested under `.data`.

```typescript
// CORRECT
const result = await items.query('Planets').find();
result.items[0].title      // ✅
result.items[0].slug       // ✅
result.items[0]._id        // ✅

// WRONG — .data does NOT exist
result.items[0].data.title  // ❌ TypeError: Cannot read properties of undefined
```

### Query API

```typescript
import { items } from '@wix/data';

// Basic query
const result = await items.query('CollectionId').find();

// With sorting
const sorted = await items.query('Planets')
  .descending('habitabilityScore')
  .find();

// With filtering
const filtered = await items.query('Planets')
  .eq('status', 'Top Candidate')
  .find();

// With limit
const limited = await items.query('CatExplorers')
  .limit(4)
  .find();

// Combined
const complex = await items.query('Missions')
  .eq('planet', 'Purrion-7')
  .descending('launchDate')
  .limit(10)
  .find();
```

### Result Shape

```typescript
const result = await items.query('CollectionId').find();

result.items        // Array of items
result.totalCount   // Total count (if requested)
result.hasNext()    // Whether there are more pages
```

### Installing Additional SDK Packages

```bash
npm install @wix/data       # CMS data operations
npm install @wix/members    # Members API
npm install @wix/stores     # Stores API
# etc.
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
      { "key": "score", "displayName": "Score", "type": "NUMBER" },
      { "key": "active", "displayName": "Active", "type": "BOOLEAN" }
    ],
    "permissions": {
      "insert": "ADMIN",
      "update": "ADMIN",
      "remove": "ADMIN",
      "read": "ANYONE"
    }
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
| `ARRAY_STRING` | Array of strings | `["tag1", "tag2"]` |
| `OBJECT` | JSON object | `{"key": "value"}` |
| `REFERENCE` | Single reference | Item ID string |
| `MULTI_REFERENCE` | Multiple references | Array of IDs |

### Inserting Data (via REST API / MCP)

**Single item:** `POST https://www.wixapis.com/wix-data/v2/items`

```json
{
  "dataCollectionId": "Planets",
  "dataItem": {
    "data": {
      "title": "Purrion-7",
      "slug": "purrion-7",
      "description": "A lush world...",
      "habitabilityScore": 92
    }
  }
}
```

**Bulk insert:** `POST https://www.wixapis.com/wix-data/v2/bulk/items/insert`

```json
{
  "dataCollectionId": "Planets",
  "dataItems": [
    { "data": { "title": "Planet A", "slug": "planet-a" } },
    { "data": { "title": "Planet B", "slug": "planet-b" } }
  ],
  "returnEntity": true
}
```

### Updating Data (Partial Patch)

**Bulk patch:** `POST https://www.wixapis.com/wix-data/v2/bulk/items/patch`

```json
{
  "dataCollectionId": "Planets",
  "patches": [
    {
      "dataItemId": "item-guid",
      "fieldModifications": [
        {
          "fieldPath": "image",
          "action": "SET_FIELD",
          "setFieldOptions": {
            "value": "wix:image://v1/mediaId/filename.png#originWidth=1024&originHeight=1024"
          }
        }
      ]
    }
  ]
}
```

**Note:** Use `patches` array with `fieldModifications`, NOT `dataItems`. Using the wrong shape gives `WDE0080` error.

## Images / Media

### Uploading to Wix Media Manager

**Endpoint:** `POST https://www.wixapis.com/site-media/v1/files/import`

```json
{
  "url": "https://example.com/image.png",
  "mimeType": "image/png",
  "displayName": "my-image.png"
}
```

**Response gives you:**
- `file.id` — e.g., `4975b6_8ffef9bde8c849bd83fe499d78aef315~mv2.png`
- `file.url` — e.g., `https://static.wixstatic.com/media/4975b6_8ffef...~mv2.png`
- `file.operationStatus` — starts as `PENDING`, becomes `READY`

The URL is typically usable immediately even while `PENDING`.

### Wix Image Format in CMS

IMAGE fields store values in the format:
```
wix:image://v1/{mediaId}/{filename}#originWidth={w}&originHeight={h}
```

Example:
```
wix:image://v1/4975b6_8ffef9bde8c849bd83fe499d78aef315~mv2.png/purrion-7.png#originWidth=1024&originHeight=1024
```

### Converting Wix Image URLs for Display

To display a `wix:image://` URL in an `<img>` tag, extract the media ID and build a static URL:

```typescript
function getImageUrl(wixImage: string | undefined, width = 800, height = 800): string | null {
  if (!wixImage) return null;
  if (wixImage.startsWith('http')) return wixImage;

  const match = wixImage.match(/^wix:image:\/\/v1\/([^/]+)\//);
  if (!match) return null;

  const mediaId = match[1];
  return `https://static.wixstatic.com/media/${mediaId}/v1/fill/w_${width},h_${height},al_c,q_80/${mediaId}`;
}
```

Usage in Astro:
```astro
{getImageUrl(planet.image) && (
  <img src={getImageUrl(planet.image, 600, 450)!} alt={planet.title} />
)}
```

### Image Domain Config

`astro.config.mjs` already includes `static.wixstatic.com` in allowed image domains:

```javascript
image: {
  domains: ["static.wixstatic.com"],
}
```

## Dynamic Routes

For detail pages, use Astro's `[slug].astro` pattern:

```astro
---
// src/pages/planets/[slug].astro
import { items } from '@wix/data';

const { slug } = Astro.params;
const result = await items.query('Planets').eq('slug', slug).find();

if (result.items.length === 0) {
  return Astro.redirect('/planets');
}

const planet = result.items[0];
---

<h1>{planet.title}</h1>
<p>{planet.description}</p>
```

Since `output: "server"` is set in the Astro config, all routes are server-rendered — no `getStaticPaths()` needed.

## Deployment

### Preview (unique URL, for testing)
```bash
npm run preview   # or: npx wix preview
```
Each preview gets a unique URL like `https://abc123-your-site-name.wix-host.com`.

### Production Release
```bash
npm run release   # or: npx wix release
```
Deploys to the permanent production URL.

### Hosting
- Hosted on **Wix servers** via **Cloudflare** (adapter configured automatically)
- Production URL format: `https://your-site-name.wix-host.com`
- Custom domains can be connected via Wix dashboard

## Tips & Gotchas

1. **No `.data` wrapper** — SDK query results have fields directly on items, not nested under `.data`
2. **Server-rendered by default** — `output: "server"` means all pages are SSR, no static generation
3. **Auth is automatic** — don't create SDK clients manually in managed headless
4. **IMAGE fields need conversion** — `wix:image://` URLs must be parsed to display in `<img>` tags
5. **Bulk patch uses `patches`** — not `dataItems`. Wrong shape = `WDE0080` error
6. **MULTI_REFERENCE fields** — cannot be set via insert/update/patch. Use dedicated reference endpoints
7. **Dev server port** — defaults to 4321 but will auto-increment if busy
8. **wix build** — needed before `wix preview` or `wix release`; preview/release also build automatically
