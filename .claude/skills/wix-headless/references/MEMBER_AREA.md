# Member Area — Dashboard Implementation Guidelines

## Overview

The member area is a protected section where logged-in users manage their profile, view orders, subscriptions, bookings, payment methods, and account settings. It uses a tabbed interface with React components for interactive features.

## Authentication & Protected Routes

### Gate the Page Server-Side

```astro
---
import { members } from '@wix/members';

let member: members.Member | undefined;
try {
  const res = await members.getCurrentMember({ fieldsets: [members.Set.FULL] });
  member = res.member;
} catch {}

if (!member) {
  return Astro.redirect('/api/auth/login?returnToUrl=/member');
}
---
```

⛔ **Breaks at runtime:** `getCurrentMember()` returns `{ member?: Member }` — unwrap before using, or you'll get TypeErrors accessing properties on `undefined`. → Destructure with `const res = await members.getCurrentMember(...); member = res.member;`.

⚠️ **Common mistake:** Redirect to login with `returnToUrl` so the user returns to the member page after authenticating. Without it, the user lands on the homepage after login. → Use `Astro.redirect('/api/auth/login?returnToUrl=/member')`.

### Fetch All Member Data Server-Side

Load everything with individual try-catch fallbacks:

```astro
---
import { orders as planOrdersApi } from '@wix/pricing-plans';
import { orders as ecomOrdersApi } from '@wix/ecom';
import { membersAbout } from '@wix/members';
import { savedPaymentMethods } from '@wix/payments';

// SDK type drift: runtime still returns `priceDetails` but the type was renamed to `pricing`.
// Widen with an intersection so you can keep reading the legacy field.
type PlanOrder = planOrdersApi.Order & { priceDetails?: planOrdersApi.PriceDetails };

let planOrders: PlanOrder[] = [];
let storeOrders: ecomOrdersApi.Order[] = [];
let aboutText = '';
let paymentMethods: savedPaymentMethods.SavedPaymentMethod[] = [];

try { planOrders = ((await planOrdersApi.memberListOrders()).orders ?? []) as PlanOrder[]; } catch {}
try {
  const res = await ecomOrdersApi.searchOrders({});
  storeOrders = res.orders ?? [];
} catch {}
try {
  const res = await membersAbout.getMyMemberAbout();
  aboutText = extractTextFromRichContent(res.memberAbout?.content);
} catch {}
try {
  paymentMethods = (await savedPaymentMethods.listSavedPaymentMethods(member._id!)).paymentMethods ?? [];
} catch {}
---
```

💡 **Best practice:** Wrap each data fetch in its own try-catch — one failure shouldn't break the entire page.

### Filter Orders

- **Pricing plan orders:** Filter out `DRAFT` status and expired orders (endDate < today)
- **E-commerce orders:** Show all, sorted by date descending

```typescript
import { orders as planOrdersApi } from '@wix/pricing-plans';

const today = new Date().toISOString().split('T')[0];
const activeOrders = planOrders.filter((o) =>
  o.status !== planOrdersApi.OrderStatus.DRAFT &&
  !(o.endDate && new Date(o.endDate).toISOString().split('T')[0] < today)
);
```

⚠️ **SDK enums, not string literals.** Compare `o.status` against `planOrdersApi.OrderStatus.DRAFT`, not `'DRAFT'`. Same rule for every status/channel/effective-at/cancellation-cause field — `orders.PaymentStatus.PAID`, `orders.CancellationCause.OWNER_ACTION`, `orders.CancellationEffectiveAt.NEXT_PAYMENT_DATE`, `currentCart.ChannelType.WEB`, `bookings.BookingStatus.CONFIRMED`, etc. Literal strings TypeScript-pass but break silently the day an enum renames a value.

## Tab Navigation

### Tabs to Include

Include these tabs (omit tabs for features the site doesn't use):

1. **Profile** — public profile editing
2. **Personal Info** — contact details and address
3. **Bookings** — upcoming and past appointments (if site has bookings)
4. **Store Orders** — e-commerce order history (if site has a store)
5. **Subscriptions** — pricing plan subscriptions (if site has plans)
6. **Payment** — saved payment methods
7. **Account** — email/password management

### Hash-Based Tab State

Use URL hash for tab state so it survives page reload and supports deep linking (e.g., `/member#bookings`). This also allows other pages to link directly to a specific tab.

### Responsive Behavior

On mobile, tabs should show icons only (hide text labels) and scroll horizontally.

## Profile Tab (MemberProfile Component)

Build as a React `client:load` component.

### Functionality

- **Cover photo** — upload and remove via server API endpoint
- **Profile photo** — upload and remove via server API endpoint
- **Nickname** — text input
- **Title** — text input (role or tagline)
- **Profile slug** — separate update action (`updateCurrentMemberSlug`)
- **Privacy** — toggle between PUBLIC and PRIVATE
- **About/bio** — text area, saved as rich content

⛔ **Breaks at runtime:** `updateMember` silently ignores `privacyStatus`. Use `members.joinCommunity()` for PUBLIC and `members.leaveCommunity()` for PRIVATE — the field is accepted without error but never persisted.

⛔ **Breaks at runtime:** To remove a profile photo, send `{ url: "" }` — not `null`. Passing `null` silently leaves the old photo in place. → Use `profile: { photo: { url: "" } }` in the update call.

### Photo Upload Pattern

Photos require a server API endpoint because `files.generateFileUploadUrl` needs elevated permissions:

```typescript
// Client-side
const formData = new FormData();
formData.append('file', file);
formData.append('field', 'photo'); // or 'cover'
formData.append('memberId', memberId);
const res = await fetch('/api/profile-photo', { method: 'POST', body: formData });
```

### About Section

Member about uses rich content format. Convert between plain text (for editing) and rich content nodes (for saving):

```typescript
import { membersAbout } from '@wix/members';

// Write — convert plain text to rich content nodes using SDK enums
const nodes: membersAbout.Node[] = text.split('\n').filter(Boolean).map((line) => ({
  type: membersAbout.NodeType.PARAGRAPH,
  nodes: [{ type: membersAbout.NodeType.TEXT, textData: { text: line, decorations: [] } }],
  paragraphData: {},
}));

if (aboutId) {
  await membersAbout.updateMemberAbout(aboutId, { content: { nodes } }, aboutRevision);
} else {
  await membersAbout.createMemberAbout({ content: { nodes } }, memberId);
}
```

⚠️ **Use SDK NodeType enum** (`membersAbout.NodeType.PARAGRAPH`, `posts.NodeType.TEXT`, etc.) — Ricos treats unknown node types as empty, so a typo in the string `'PARAGRPH'` silently loses content with no error.

### Save Feedback

Show success feedback that auto-dismisses after ~3 seconds. Disable the save button during async operations.

## Personal Info Tab

### Fields

- First name, last name, company, job title, birthdate
- Phone number (**must be E.164 format**: `+1XXXXXXXXXX`)
- Full address: street, line 2, city, state/province, country (dropdown), postal code

### Phone Number Normalization

```typescript
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw.startsWith('+') ? raw : `+${raw}`;
}
```

## Bookings Tab (MyBookings Component)

React `client:load` component.

### Functionality

1. Fetch bookings via `extendedBookings.queryExtendedBookings({ withBookingAllowedActions: true })`
2. Split into **upcoming** (future, not cancelled) and **past** sections
3. For each booking show: service name, provider, date/time (locale-formatted), status badge
4. Actions: **cancel** (with confirmation dialog + `booking.revision`), **reschedule** (link to bookings page)
5. Empty state with link to booking page

**Key SDK details:**
- Booking data is nested: `eb.booking?.bookedEntity?.title`
- Allowed actions are booleans: `eb.allowedActions?.cancel`
- `cancelBooking` requires `booking.revision`
- Date/time formatting must use `i18n.getLocale()` for locale-aware display
- Past bookings should be visually de-emphasized

## Store Orders Tab

Render server-side. For each order show:

1. **Order header** — order number, date, status badges (payment + fulfillment)
2. **Line items** — product image, name, quantity, price
3. **Order total** — formatted with locale-aware currency
4. **Delivery info** — shipping address if available

### Status Badges

Color-code by status: green for APPROVED/FULFILLED/PAID, red for CANCELED/UNPAID, orange for PARTIALLY_FULFILLED, blue for PENDING.

Translate status values — don't display raw English enum strings.

### Empty State

Show a helpful message with CTA linking to the store page.

### ⛔ Wix Events tickets are NOT in `ecomOrders.searchOrders`

The Orders tab `ecomOrders.searchOrders` returns store / donation / gift card / restaurant / pricing-plan / blog purchases — but NOT event tickets. `redirects.createRedirectSession({ eventsCheckout })` creates an order in the **separate Events orders system** (`@wix/events` → `orders.listOrders`). Without a second fetch, every ticket purchase is invisible to the member, even though `classifyLineItem` has a `'ticket'` case (that case fires only on the rare line items where tickets DO leak into eCom — the common `eventsCheckout` flow doesn't).

Fetch events orders alongside ecom orders and convert to the same card shape:

```typescript
import { orders as eventsOrders, wixEventsV2 } from '@wix/events';

let memberEventOrders: eventsOrders.Order[] = [];
const eventTitleById = new Map<string, string>();
const eventImageById = new Map<string, string | null>();
try {
  const res = await eventsOrders.listOrders({
    memberId: [member._id!],
    fieldset: [eventsOrders.OrderFieldset.DETAILS],
  });
  memberEventOrders = res.orders || [];
  // Each order has eventId but no event title — fetch each in parallel
  // (small N: one per distinct event the member has tickets to).
  const eventIds = [...new Set(memberEventOrders.map((o) => o.eventId).filter(Boolean) as string[])];
  const events = await Promise.all(
    eventIds.map((id) => wixEventsV2.getEvent(id, {
      fields: [wixEventsV2.RequestedFields.TEXTS, wixEventsV2.RequestedFields.URLS],
    }).catch(() => null)),
  );
  for (const ev of events) {
    if (ev?._id) {
      eventTitleById.set(ev._id, ev.title || 'Event');
      eventImageById.set(ev._id, getImageUrl(ev.mainImage, 160, 160) || null);
    }
  }
} catch {}
```

⛔ **`wixEventsV2.queryEvents` is not the right API for an `_id IN [...]` lookup.** Its filter syntax is awkward (`{ paging, sort, filter }` shape, not the standard `{ query: { filter: {...} } }`). Use parallel `getEvent(id)` calls instead — fewer surprises and the dataset is small.

⛔ **Don't filter by `eventsOrders.listOrders({ contactId: [...] })`** for a logged-in member — `memberId` is the right filter. `contactId` is for guest orders.

Map the events orders into the same shape as ecom order cards (synthetic single-line-item per order using the event title), merge with eCom cards, sort by `createdDate desc`, render through the existing template. The unified list reads chronologically and the `'ticket'` badge identifies the entries.

## Subscriptions Tab

⛔ **Don't ship a placeholder.** A common shortcut is to leave the Subscriptions panel as one paragraph saying "subscriptions also appear in your Orders tab" — that's a nav UX failure. Build the real tab on every site that has a `/plans` page; if there are no plans, omit the tab entirely instead.

### Server-side fetch (in `member/index.astro`)

```typescript
import { orders as planOrders } from '@wix/pricing-plans';

// SDK type drift: runtime returns `priceDetails`, the type renamed to `pricing`.
type PlanOrder = planOrders.Order & { priceDetails?: planOrders.PriceDetails };

let myPlanOrders: PlanOrder[] = [];
try {
  const res = await planOrders.memberListOrders();
  const today = new Date().toISOString().split('T')[0]!;
  myPlanOrders = ((res.orders || []) as PlanOrder[]).filter((o) => {
    if (o.status === planOrders.OrderStatus.DRAFT) return false;
    const end = o.endDate ? new Date(o.endDate as unknown as string).toISOString().split('T')[0]! : null;
    return !(end && end < today);
  });
} catch {}
```

⚠️ **`memberListOrders()` runs as the current member** — do NOT wrap in `auth.elevate()` (that switches to app identity and either 403s or returns the wrong member's orders).

### Per-card display

For each subscription show:

1. **Plan name** + status badge (active/pending/canceled/ended; show "free trial" badge if `inTrial`)
2. **Price** — formatted with locale-aware currency + cycle ("$15 / month")
3. **Dates** — start, end, next billing if available
4. **Cancel action** — only for `status === 'ACTIVE'` && `!autoRenewCanceled`

### CancelSubscription action

- Confirm before cancelling
- Try `CancellationEffectiveAt.NEXT_PAYMENT_DATE` first, fall back to `IMMEDIATELY` (single-payment plans)
- Use the SDK enum (`orders.CancellationEffectiveAt.NEXT_PAYMENT_DATE`), not the string literal
- After cancel, optimistically flip `autoRenewCanceled: true` in local state — the badge re-renders without a refetch
- ⛔ **Breaks at runtime:** `requestCancellation` requires member authentication — call from client-side, or you'll get a 403 from the server context. → Use a React `client:load` component for cancellation.

## Payment Tab (SavedPaymentMethods Component)

React `client:load` component.

### Functionality

1. List saved payment methods showing: card brand (detect from BIN), last 4 digits, expiration, cardholder name
2. Indicate which method is primary
3. Actions: **set as primary**, **delete** (with confirmation)
4. Empty state explaining methods are saved during checkout

### Card Brand Detection

```typescript
function getCardBrand(bin: string): string {
  if (bin.startsWith('4')) return 'Visa';
  if (/^5[1-5]/.test(bin)) return 'Mastercard';
  if (/^3[47]/.test(bin)) return 'Amex';
  if (/^6(?:011|5)/.test(bin)) return 'Discover';
  return 'Card';
}
```

## Account Tab

### Functionality

1. **Change email** — `authentication.changeLoginEmail(memberId, newEmail)`
2. **Reset password** — `authentication.sendSetPasswordEmail(email)` (sends link, user resets externally)
3. **Change password inline** — verify current password, then change via SDK client (see pattern below)
4. Display: member since date, last login

⛔ **Breaks at runtime:** Both email change and password reset require member identity — call from client-side. `auth.elevate()` strips member identity, causing 403 errors. → Handle these operations in a React `client:load` component, never from server-side or elevated context.

### Change Password Pattern

The `changePassword` API from `@wix/identity` requires a member session with step-up auth. It does **NOT** work from server-side API routes — `auth.elevate()` switches to app identity (403), and without elevation it triggers step-up. The solution is to handle everything client-side using a separate SDK client:

1. Create a new `WixClient` with `OAuthStrategy` (requires the app's `clientId` from `wix.config.json`)
2. Call `loginV2` on the client with the member's email and current password — this verifies the password and returns a `sessionToken`
3. Exchange the `sessionToken` for member tokens via `getMemberTokensForDirectLogin(sessionToken)` and apply with `setTokens(tokens)`
4. Call `changePassword(newPassword)` on the now-authenticated client

```typescript
import { createClient, OAuthStrategy } from "@wix/sdk";
import { authentication as identityAuth } from "@wix/identity";

const wixClient = createClient({
  modules: { authentication: identityAuth },
  auth: OAuthStrategy({ clientId: "<APP_CLIENT_ID_FROM_WIX_CONFIG>" }),
});

// Verify current password and get session token
const loginResponse = await wixClient.authentication.loginV2(
  { email: memberEmail },
  { password: currentPassword },
);
if (!loginResponse.sessionToken) {
  // Wrong password — show a user-friendly message and stop.
  setMessage("The current password you entered is incorrect.");
  return;
}

// Authenticate client as the member
const tokens = await wixClient.auth.getMemberTokensForDirectLogin(loginResponse.sessionToken);
wixClient.auth.setTokens(tokens);

// Change password
await wixClient.authentication.changePassword(newPassword);
```

⛔ **Breaks at runtime:** `OAuthStrategy` and `getMemberTokensForDirectLogin` use browser APIs (`window`, iframes) — this MUST run client-side. Server-side calls crash with `window is not defined`. → Put all `OAuthStrategy`/`changePassword` logic in a React `client:load` component.

⛔ **Breaks at runtime:** Do NOT use `auth.elevate()` for `loginV2` or `changePassword` from `@wix/identity`. Elevation switches to app identity which either gets 403 or loses the member session context needed for password operations. → Create a standalone `WixClient` with `OAuthStrategy` client-side instead.

⚠️ **`loginV2` error messages are deliberately generic to prevent email enumeration.** On wrong password, the SDK throws with error code `UNKNOWN` (not `WRONG_LOGIN_ID_OR_PASSWORD`) — do NOT map on the code. Instead:
1. Check `!loginResponse.sessionToken` first — if missing, show a "wrong password" message.
2. In the catch block, string-match on `err.message` for `"password"`, `"invalid"`, or `"credentials"` and map any match to the same user-friendly message.
3. Fall back to `err.message` for other failures, not to the code.

```typescript
catch (e) {
  const msg = e instanceof Error ? e.message : "";
  if (msg.toLowerCase().includes("password") ||
      msg.toLowerCase().includes("invalid") ||
      msg.toLowerCase().includes("credentials")) {
    setMessage("The current password you entered is incorrect.");
  } else {
    setMessage(msg || "Something went wrong.");
  }
}
```

⚠️ **Do NOT add a timeout race / fallback "success" around `changePassword`.** Faking success on a hang shows "password updated" to the user while the password never actually changes — always surface the real error instead.

## General Patterns

### Translations

All member area text must use translation keys — tab labels, status values, empty states, form labels, actions.

### Error Handling

Every async operation needs:
1. Loading state (disable buttons, show indicator)
2. Error catch with user-friendly message
3. Success feedback (auto-dismiss after ~3 seconds)

### Responsive

- Tabs become icon-only on mobile
- Forms switch from multi-column to single column
- Cards stack vertically
