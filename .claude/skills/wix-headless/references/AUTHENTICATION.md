# Authentication, Members & File Upload

## Login & Logout

The Wix Astro middleware provides auth endpoints out of the box:

- **Login:** `<a href="/api/auth/login">` — GET, redirects to Wix login page. Supports `returnToUrl` query param: `/api/auth/login?returnToUrl=/current-page`
- **Logout:** `<form action="/api/auth/logout" method="POST">` — POST only; a plain `<a href>` link silently no-ops because the GET handler doesn't exist.

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

`getCurrentMember()` returns `{ member?: Member }` — unwrap with `res.member` before reading fields. (`getMember(id)`, by contrast, returns `Member` directly.)

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

Privacy is set via `members.joinCommunity()` (PUBLIC) and `members.leaveCommunity()` (PRIVATE) — `updateMember` accepts `privacyStatus` in its payload but doesn't persist it.

To clear a profile photo, send `{ url: "" }` (an empty-string url is the explicit "remove" signal).

**Phone numbers must be E.164 format:** `+[country code][number]`.

## Member About (Bio)

```typescript
import { membersAbout } from '@wix/members';
const res = await membersAbout.getMyMemberAbout();
const content = res.memberAbout?.content; // RichContent (Ricos format)
```

## Member Authentication (Email & Password)

```typescript
import { authentication } from '@wix/members';
await authentication.changeLoginEmail(memberId, newEmail);
await authentication.sendSetPasswordEmail(email);
```

Call these from client-side React — they require member identity, and `auth.elevate()` switches to app identity which 403s.

## File Upload to Wix Media

`files.generateFileUploadUrl` requires `Manage Media Manager` permission — visitors/members get 403. Use `auth.elevate()` server-side.

The canonical implementation is `src/pages/api/profile-photo.ts` (POST upload + DELETE clear). Key constraints baked into it:

- Validate MIME, size, and dimensions on the server before calling `generateFileUploadUrl` — once a file is in Wix Media it persists, and Wix won't reject malformed images for you.
- `auth.elevate(files.generateFileUploadUrl)` to get the upload URL, then PUT the bytes from the server.
- Persist `{ _id, url }` onto the member profile in the same handler — splitting the upload and the `members.updateMember` call across server and client lets an aborted client step orphan the upload.
- The DELETE handler uses `{ url: "" }` to clear; `null` is not the clear signal here.

Both `generateFileUploadUrl` and the subsequent PUT run server-side — direct browser uploads hit `ERR_BLOCKED_BY_ORB`, and `auth.elevate()` only works in Astro API routes.

Persist the media reference onto the member profile inside the same endpoint — splitting the upload and the `members.updateMember` call across server and client lets an aborted client step orphan the upload while the profile still points at the old photo.
