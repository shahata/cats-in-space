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

**Pattern:** Create a server API endpoint that handles the entire upload:

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
  const uploadRes = await fetch(uploadUrl!, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: Buffer.from(await file.arrayBuffer()),
  });
  const data = await uploadRes.json();
  return new Response(JSON.stringify({ id: data.file?.id, url: data.file?.url }));
};
```

⛔ — Do NOT upload from the browser directly — causes `ERR_BLOCKED_BY_ORB`. Both `generateFileUploadUrl` and PUT must happen on the server.

⛔ — `auth.elevate()` only works server-side (Astro API routes, not client-side React).
