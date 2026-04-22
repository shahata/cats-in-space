# Media Handling — Images, Videos & Generation

## The Core Rule

⛔ **Every image/video from ANY Wix SDK response is a `wix:image://` or `wix:video://` string.** These do not render in `<img>` or `<video>` tags. You must always convert them through `getImageUrl()` / `getVideoUrl()` helpers before rendering.

This applies everywhere: product images, cart line items, order line items, blog covers, member photos, CMS images, booking service images, staff photos — no exceptions.

## SDK vs REST: Different Formats

The REST API returns media as objects:
```json
{ "image": { "id": "abc~mv2.png", "url": "https://static.wixstatic.com/media/abc~mv2.png", "width": 1024, "height": 1024 } }
```

The SDK (Astro server-side) returns **plain strings**:
```
"wix:image://v1/abc~mv2.png/filename.png#originWidth=1024&originHeight=1024"
"wix:video://v1/abc~mv2/filename.mp4#posterUri=poster&posterWidth=W&posterHeight=H"
```

## Safe Access Pattern

Always check the type before accessing sub-properties:

```typescript
// ❌ WRONG — field is a string, not an object
const url = getImageUrl(item.mainMedia?.image?.id);

// ✅ CORRECT — handle both SDK string and REST object formats
const img = item.mainMedia?.image;
const url = getImageUrl(
  typeof img === 'string' ? img : (img?.id || img?.url),
  width, height
);
```

## Where This Applies

| SDK Module | Field Path | Runtime Type |
|---|---|---|
| `@wix/stores` productsV3 | `product.media.main.image` | `string` |
| `@wix/stores` productsV3 | `product.media.main.video` | `string` |
| `@wix/stores` productsV3 | `product.media.itemsInfo.items[].image` | `string` |
| `@wix/ecom` cart | `lineItem.image` | `string` |
| `@wix/ecom` orders | `order.lineItems[].image` | `string` |
| `@wix/blog` posts | `post.coverMedia.image` | `string` |
| `@wix/bookings` services | `service.media.mainMedia.image` | `string` |
| `@wix/bookings` staff | `staff.mainMedia.image` | `string` |
| `@wix/members` | `member.profile.photo.url` | `string` (already a URL) |
| `@wix/data` CMS IMAGE fields | `item.imageField` | `string` |

For Stores productsV3, `mediaType` is uppercase (`'IMAGE'` or `'VIDEO'`).

## Media Helper Functions

Place in `src/utils/image.ts`. These handle all Wix media formats:

### `getImageUrl(wixImage, width, height)` — Images

```typescript
import { media } from '@wix/sdk';

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

### `getVideoUrl(wixVideo, thumbW, thumbH)` — Videos

Returns `{ url: string; thumbnail: string | null }` or `null`.

```typescript
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

### `getShapeUrl(icon)` — SVG Shapes (icons)

Menu item labels, chip icons, and other small SVG assets come back as `wix:shape://...` URIs. Use `media.getShapeUrl()` from `@wix/sdk` — **don't** construct `https://static.wixstatic.com/shapes/<id>` URLs manually with regex. There's a dedicated helper for every media family the SDK surfaces:

- `media.getImageUrl()` → images
- `media.getVideoUrl()` → videos
- `media.getShapeUrl()` → SVG shapes
- `media.getAudioUrl()` → audio
- `media.getDocumentUrl()` → documents

```typescript
import { media } from '@wix/sdk';

export function getShapeUrl(icon: unknown): string | null {
  if (!icon) return null;
  if (typeof icon === 'string') {
    if (icon.startsWith('http')) return icon;
    return media.getShapeUrl(icon)?.url || null;
  }
  if (typeof icon === 'object') {
    // REST responses give { id, url } object shape
    const o = icon as { url?: string; id?: string };
    if (o.url?.startsWith('http')) return o.url;
    if (o.id) return getShapeUrl(o.id);
  }
  return null;
}
```

To recolor a monochrome SVG icon at display time (e.g., matching a dark-theme accent), use CSS `mask-image` rather than a `filter: brightness(0) invert(...) sepia(...) hue-rotate(...)` chain — filter chains are brittle. See [RESTAURANTS.md](RESTAURANTS.md) → "Rendering icons on a dark theme".

### `extractMediaUrl(productMedia, w, h)` — Stores Products

Detects type and calls the right helper:

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

## Uploading Images to Wix

`POST https://www.wixapis.com/site-media/v1/files/import`
```json
{ "url": "https://example.com/image.png", "mimeType": "image/png", "displayName": "my-image.png" }
```

Returns `file.url` (wixstatic.com) — usable immediately even while `operationStatus` is `PENDING`. The response also gives you a WixMedia `file.id` like `4975b6_<hash>~mv2.png`.

⛔ **`operationStatus: 'PENDING'` matters when you reference the file from another entity's string field.** `importFile` is asynchronous — it returns with the file in `PENDING` state while Wix pulls the bytes from the source URL server-side. Some entity fields that accept a `wix:image://` string (e.g. `Event.mainImage`) will silently drop a URI whose underlying file is not yet `READY`. If your image vanishes from the target entity even though the update call succeeded, poll:

```ts
async function waitForFileReady(fileId: string, maxAttempts = 30): Promise<boolean> {
  const getFile = auth.elevate(files.getFileDescriptor);
  for (let i = 0; i < maxAttempts; i++) {
    const res = await getFile(fileId);
    if ((res.file ?? res as files.FileDescriptor).operationStatus === 'READY') return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}
```

⛔ **The `#originWidth=W&originHeight=H` hash fragment is NOT optional when writing a `wix:image://` string to an entity field.** Entities that accept raw URI strings (`Event.mainImage`, some CMS `IMAGE` fields) silently drop URIs missing the dimensions hash — no error, no response field, never surfaces in the dashboard. Always build the URI as:

```ts
function buildWixImageUri(fileId: string, displayName: string, w: number, h: number): string {
  const safe = displayName.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/(^-|-$)/g, '');
  return `wix:image://v1/${fileId}/${safe}#originWidth=${w}&originHeight=${h}`;
}
```

`files.importFile`'s returned `file._id` already carries the `~mv2.png/jpg` suffix required for the URI path segment — don't strip it. Entity fields that take an object (`{ id, url, width, height, altText }` format, used by products, donation campaigns, etc.) don't need the hash — the dimensions go in the object properties instead.

When setting images on entities via REST API, use the object format (`{ id, url, width, height, altText }`). When reading them back via SDK, expect `wix:image://` strings — but some entities (notably Donation campaigns) return the same `Image` **object** shape at runtime even though the SDK types call `coverImage: string`. Always verify the runtime shape of a new entity type before rendering. See [DONATIONS.md](DONATIONS.md) for an end-to-end example that imports a DALL-E URL and attaches it to a campaign.

---

## Image & Video Generation

**Every entity that supports an image should have one.** Pages without images look incomplete. Always generate images using AI — do not import stock or placeholder images unless the user explicitly provides URLs.

### Wix Runware API (Preferred)

Use `npx wix token` + curl. The MCP `CallWixSiteAPI` tool cannot be used for Runware because it rejects the required array body format.

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

**Key details:**
- `siteId`: from `wix.config.json`
- `accountId`: the `uid` or `siteOwnerId` from the token payload (decode the JWT middle segment)
- Use `-s` (site-scoped) flag with `npx wix token` — the default account token returns "Permission denied"
- The `wix-account-id` header is required — without it you get "Permission denied"
- Generate a unique UUID for each request

**Response:** `data[].imageURL` — publicly accessible, pass directly to Wix Media Import.

### OpenAI API (Fallback)

If Runware is unavailable or for video generation, use OpenAI's APIs. You must ask the user to provide their OpenAI API key — do not attempt to find or guess it. Check for `OPENAI_API_KEY` in the shell environment first before prompting.

**DALL-E 3 example** (returns short-lived public URLs — feed directly into `site-media/v1/files/import`):

```bash
curl -s -X POST https://api.openai.com/v1/images/generations \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "dall-e-3",
    "prompt": "<cinematic concept-art prompt>",
    "n": 1,
    "size": "1792x1024",
    "quality": "hd",
    "response_format": "url"
  }'
```

Response has `data[0].url` — a temporary (~1h) public URL on `oaidalleapiprodscus.blob.core.windows.net`. Import it into Wix Media immediately; don't persist.

### End-to-End Workflow

1. **Generate** via Runware (preferred) or OpenAI (fallback)
2. **Upload to Wix:** `POST /site-media/v1/files/import` with `{ "url": "...", "mimeType": "image/png", "displayName": "..." }`
3. **Attach at creation time** — include media when creating entities, not as a separate step. For products, use `media.itemsInfo.items` inline. For CMS items, set IMAGE fields directly. For blog posts, set `media.wixMedia.image`.
4. **Add images one at a time via MCP** (batching may silently drop)
5. For **video**: generate via OpenAI → temp host if needed → Wix Import File API → attach by media `id`
