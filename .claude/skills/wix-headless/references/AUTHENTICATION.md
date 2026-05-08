# Authentication, Members & File Upload

## Login & Logout

The Wix Astro middleware provides auth endpoints out of the box:

- **Login:** `<a href="/api/auth/login">` — GET, redirects to Wix login page. Supports `returnToUrl` query param: `/api/auth/login?returnToUrl=/current-page`
- **Logout:** `<form action="/api/auth/logout" method="POST">` — **POST** handler, use a form not a link

⛔ **Breaks at runtime** — `/api/auth/logout` is a POST endpoint. Using `<a href="/api/auth/logout">` (GET) silently fails — the user stays logged in.

## Detecting Login State (Server-Side)

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

⚠️ **Common mistake** — `getCurrentMember()` returns `{ member?: Member }` (wrapped response), not `Member` directly. Always unwrap with `res.member`.

## Member Profile Management

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

⛔ **Silent failure** — `updateMember` silently ignores `privacyStatus`. Use `members.joinCommunity()` for PUBLIC and `members.leaveCommunity()` for PRIVATE.

⚠️ — To remove a profile photo, send `{ url: "" }` — not `null`.

⚠️ — `getMember(id)` returns `Member` directly (not wrapped), inconsistent with `getCurrentMember()`.

**Phone numbers must be E.164 format:** `+[country code][number]`.

## Member About (Bio)

```typescript
import { membersAbout } from '@wix/members';
const res = await membersAbout.getMyMemberAbout();
const content = res.memberAbout?.content; // RichContent (Ricos format)
```

⚠️ — `getMyMemberAbout()` returns `{ memberAbout }` (wrapped), but `getMemberAbout(id)` returns `MemberAbout` directly.

## Member Authentication (Email & Password)

```typescript
import { authentication } from '@wix/members';
await authentication.changeLoginEmail(memberId, newEmail);
await authentication.sendSetPasswordEmail(email);
```

⛔ — Both require **member identity** — call from client-side. `auth.elevate()` strips member identity, causing 403 errors.

## File Upload to Wix Media

`files.generateFileUploadUrl` requires `Manage Media Manager` permission — visitors/members get 403. Use `auth.elevate()` server-side.

**Pattern:** Create a server API endpoint that handles the entire upload. For user-supplied images (profile photos, cover photos, content images), validate before uploading — once a file is in the media manager it persists, and Wix won't reject malformed images, oversized files, or wrong MIME types for you.

```typescript
// src/pages/api/profile-photo.ts
import type { APIRoute } from 'astro';
import { files } from '@wix/media';
import { members } from '@wix/members';
import { auth } from '@wix/essentials';
import sizeOf from 'image-size';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const MIN_DIMENSION = 50;
const MAX_DIMENSION = 4096;

export const POST: APIRoute = async ({ request }) => {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const memberId = formData.get('memberId') as string | null;
  // 'photo' or 'cover' — controls which member-profile field gets updated.
  const field = (formData.get('field') as string) || 'photo';

  if (!file || !memberId) {
    return new Response(JSON.stringify({ error: 'file and memberId required' }), { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return new Response(JSON.stringify({ error: 'Invalid file type' }), { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return new Response(JSON.stringify({ error: 'File too large' }), { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // image-size catches corrupt/non-image payloads that pass the MIME check.
  const dim = sizeOf(buffer);
  if (!dim.width || !dim.height ||
      dim.width < MIN_DIMENSION || dim.height < MIN_DIMENSION ||
      dim.width > MAX_DIMENSION || dim.height > MAX_DIMENSION) {
    return new Response(JSON.stringify({ error: 'Bad image dimensions' }), { status: 400 });
  }

  const elevatedGenerate = auth.elevate(files.generateFileUploadUrl);
  const { uploadUrl } = await elevatedGenerate(file.type, { fileName: file.name });
  const uploadRes = await fetch(uploadUrl!, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: buffer,
  });
  const data = await uploadRes.json();
  const photoId = data.file?.id;
  const photoUrl = data.file?.url;

  // Persist the new media reference back onto the member profile so the
  // change is durable and visible across sessions. Without this, the upload
  // succeeds but never appears in the member's profile.
  const profileUpdate = field === 'cover'
    ? { cover: { _id: photoId, url: photoUrl } }
    : { photo: { _id: photoId, url: photoUrl } };
  await members.updateMember(memberId, { profile: profileUpdate });

  return new Response(JSON.stringify({ id: photoId, url: photoUrl }));
};

// Mirror handler: clear the field by setting `url: ""` rather than deleting.
export const DELETE: APIRoute = async ({ request }) => {
  const { memberId, field = 'photo' } = await request.json();
  const profileUpdate = field === 'cover' ? { cover: { url: '' } } : { photo: { url: '' } };
  await members.updateMember(memberId, { profile: profileUpdate });
  return new Response(JSON.stringify({ success: true }));
};
```

⛔ — Do NOT upload from the browser directly — causes `ERR_BLOCKED_BY_ORB`. Both `generateFileUploadUrl` and PUT must happen on the server.

⛔ — `auth.elevate()` only works server-side (Astro API routes, not client-side React).

⛔ — Don't return the media ID/URL to the client and let the client call `members.updateMember`. The endpoint should perform the persistence atomically — otherwise an aborted client-side step leaves an orphaned upload and a profile pointing at the old photo.
