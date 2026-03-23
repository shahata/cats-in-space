# Wix Media Handling — Managed Headless SDK

## The Core Gotcha

**The Wix managed headless SDK transforms media fields from REST API objects into `wix:image://` or `wix:video://` strings.**

The REST API returns media as objects:
```json
{ "image": { "id": "abc~mv2.png", "url": "https://static.wixstatic.com/media/abc~mv2.png", "width": 1024, "height": 1024 } }
```

But the SDK (used in Astro server-side code) returns them as **plain strings**:
```
"wix:image://v1/abc~mv2.png/filename.png#originWidth=1024&originHeight=1024"
"wix:video://v1/abc~mv2/filename.mp4#posterUri=poster&posterWidth=W&posterHeight=H"
```

This applies to ALL Wix SDK modules that return media — Bookings, Stores, Blog, Members, CMS, etc.

## Safe Media Access Pattern

Always check the type before accessing sub-properties:

```typescript
import { getImageUrl } from '../utils/image';

// WRONG — will fail silently, field is a string not an object
const url = getImageUrl(item.mainMedia?.image?.id);  // ❌ undefined

// CORRECT — handle both SDK string and REST object formats
const img = item.mainMedia?.image;
const url = getImageUrl(
  typeof img === 'string' ? img : (img?.id || img?.url),
  width,
  height
);
```

## Where This Applies

| SDK Module | Field Path | Media Type | Runtime Type |
|---|---|---|---|
| `@wix/bookings` staffMembers | `staff.mainMedia.image` | image | `string` |
| `@wix/bookings` services | `service.media.mainMedia.image` | image | `string` |
| `@wix/bookings` services | `service.media.items[].image` | image | `string` |
| `@wix/stores` productsV3 | `product.media.main.image` | image | `string` |
| `@wix/stores` productsV3 | `product.media.main.video` | video | `string` |
| `@wix/stores` productsV3 | `product.media.itemsInfo.items[].image` | image | `string` |
| `@wix/stores` productsV3 | `product.media.itemsInfo.items[].video` | video | `string` |
| `@wix/blog` posts | `post.coverMedia.image` | image | `string` |
| `@wix/members` | `member.profile.photo.url` | image | `string` (already a URL) |
| `@wix/data` CMS IMAGE fields | `item.imageField` | image | `string` |

For Stores productsV3, `mediaType` is uppercase (`'IMAGE'` or `'VIDEO'`), check it to decide which helper to use.

## The Helpers in `src/utils/image.ts`

### `getImageUrl(wixImage, width, height)` — Images

Handles all image formats:
- `wix:image://v1/{mediaId}/{filename}#originWidth=W&originHeight=H` — SDK format
- `https://static.wixstatic.com/media/...` — direct URL
- `{mediaId}~mv2.png` — plain media ID

```typescript
import { getImageUrl } from '../utils/image';

// All of these work:
getImageUrl("wix:image://v1/abc~mv2.png/file.png#originWidth=1024&originHeight=1024", 400, 400);
getImageUrl("https://static.wixstatic.com/media/abc~mv2.png", 400, 400);
getImageUrl("abc~mv2.png", 400, 400);
```

### `getVideoUrl(wixVideo, thumbW, thumbH)` — Videos

Returns `{ url: string, thumbnail: string | null }` or `null`.

Handles:
- `wix:video://v1/{videoId}/{filename}#posterUri=...` — SDK format
- `https://video.wixstatic.com/video/...` — direct URL
- `{videoId}` — plain video ID

```typescript
import { getVideoUrl } from '../utils/image';

const video = getVideoUrl("wix:video://v1/abc~mv2/file.mp4#posterUri=poster&posterWidth=1920&posterHeight=1080");
// video.url → playable video URL
// video.thumbnail → poster image URL (or null)
```

### `extractMediaUrl(productMedia, w, h)` — Stores Products

Detects type and calls the right helper:

```typescript
import { extractMediaUrl } from '../utils/image';

const media = extractMediaUrl(product.media?.main);
if (media?.type === 'video') {
  // media.url → video URL, media.thumbnail → poster
} else if (media?.type === 'image') {
  // media.url → image URL
}
```

## SDK Response Shape Differences

The SDK also wraps query responses differently from the REST API:

| SDK Call | REST returns | SDK returns |
|---|---|---|
| `services.queryServices({})` | `{ services: [...] }` | `{ services: [...] }` |
| `staffMembers.queryStaffMembers({})` | `{ staffMembers: [...] }` | `{ staffMembers: [...] }` |
| `items.query('Collection').find()` | `{ items: [...] }` | `{ items: [...] }` |
| `posts.listPosts({})` | `{ posts: [...] }` | `{ posts: [...] }` |
| `productsV3.queryProducts({})` | `{ products: [...] }` | varies by version |

When unsure, cast to `any` and check with `|| []`:
```typescript
const result = await someApi.querySomething({}) as any;
const items = (result.items || result.services || result.staffMembers || []) as any[];
```

## Uploading Images

Upload via REST API, then the SDK will return the result as `wix:image://` strings:

```
POST https://www.wixapis.com/site-media/v1/files/import
Body: { "url": "https://example.com/photo.png", "mimeType": "image/png", "displayName": "photo.png" }
```

Returns `file.url` (usable immediately) and `file.id` (the media ID).

When setting images on entities via REST API, use the object format (`{ id, url, width, height }`).
When reading them back via SDK, expect `wix:image://` strings.
