# Member Area — Dashboard Implementation Guidelines

## Overview

The member area is a protected section where logged-in users manage their profile, view orders, subscriptions, bookings, payment methods, and account settings. It uses a tabbed interface with React components for interactive features.

## Authentication & Protected Routes

### Gate the Page Server-Side

```astro
---
import { members } from '@wix/members';

let member: any = null;
try {
  const res = await members.getCurrentMember({ fieldsets: ['FULL'] });
  member = res.member;
} catch {}

if (!member) {
  return Astro.redirect('/api/auth/login?returnToUrl=/member');
}
---
```

**CRITICAL:** `getCurrentMember()` returns `{ member?: Member }` — unwrap before using.

**CRITICAL:** Redirect to login with `returnToUrl` so the user returns to the member page after authenticating.

### Fetch All Member Data Server-Side

Load everything in parallel with try-catch fallbacks:

```astro
---
import { orders } from '@wix/pricing-plans';
import { orders as ecomOrders } from '@wix/ecom';
import { membersAbout } from '@wix/members';
import { savedPaymentMethods } from '@wix/payments';

let planOrders: any[] = [];
let storeOrders: any[] = [];
let aboutText = '';
let paymentMethods: any[] = [];

try { planOrders = (await orders.memberListOrders()).orders || []; } catch {}
try {
  const res = await ecomOrders.searchOrders({ search: {} });
  storeOrders = res.orders || [];
} catch {}
try {
  const res = await membersAbout.getMyMemberAbout();
  // Parse rich content to text
  aboutText = extractTextFromRichContent(res.memberAbout?.content);
} catch {}
try {
  paymentMethods = (await savedPaymentMethods.listSavedPaymentMethods(member._id!)).paymentMethods || [];
} catch {}
---
```

**CRITICAL:** Wrap each data fetch in its own try-catch — one failure shouldn't break the entire page.

### Filter Orders

- **Pricing plan orders:** Filter out `DRAFT` status and expired orders (endDate < today)
- **E-commerce orders:** Show all, sorted by date descending

```typescript
const today = new Date().toISOString().split('T')[0];
const activeOrders = planOrders.filter((o: any) =>
  o.status !== 'DRAFT' &&
  !(o.endDate && new Date(o.endDate).toISOString().split('T')[0] < today)
);
```

## Tab Navigation

### Structure

Use 7 tabs: Profile, Personal Info, Bookings, Store Orders, Subscriptions, Payment, Account.

```html
<div class="tab-nav">
  <button class="tab active" data-tab="profile">{t('member.tabProfile')}</button>
  <button class="tab" data-tab="personal">{t('member.tabPersonal')}</button>
  <button class="tab" data-tab="bookings">{t('member.tabBookings')}</button>
  <button class="tab" data-tab="orders">{t('member.tabOrders')}</button>
  <button class="tab" data-tab="subscriptions">{t('member.tabSubscriptions')}</button>
  <button class="tab" data-tab="payment">{t('member.tabPayment')}</button>
  <button class="tab" data-tab="account">{t('member.tabAccount')}</button>
</div>
```

### Hash-Based Navigation

Use URL hash for tab state so it survives page reload and supports deep linking:

```html
<script>
  function showTab(tabId) {
    document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const panel = document.getElementById('panel-' + tabId);
    const tab = document.querySelector(`[data-tab="${tabId}"]`);
    if (panel) panel.style.display = 'block';
    if (tab) tab.classList.add('active');
  }

  // Support hash navigation
  const hash = window.location.hash.replace('#', '') || 'profile';
  showTab(hash);

  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      const id = t.dataset.tab;
      window.location.hash = id;
      showTab(id);
    });
  });
</script>
```

### Responsive Tabs

On mobile, tabs should show icons only and wrap:

```css
.tab-nav {
  display: flex;
  gap: 0.25rem;
  overflow-x: auto;
}
.tab {
  flex: 1;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.6rem 0.75rem;
}
@media (max-width: 768px) {
  .tab .tab-label { display: none; }
}
```

## Profile Tab (MemberProfile Component)

The profile tab is a React `client:load` component that manages:

### Public Profile Fields
- **Cover photo** — 160px height, upload/remove actions via server API endpoint
- **Profile photo** — circular 80px, upload/remove via server API endpoint
- **Nickname** — text input
- **Title** — text input (e.g., role or tagline)
- **Profile slug** — separate update action (`updateCurrentMemberSlug`)
- **Privacy** — toggle between PUBLIC and PRIVATE

**CRITICAL:** `updateMember` silently ignores `privacyStatus`. Use `members.joinCommunity()` for PUBLIC and `members.leaveCommunity()` for PRIVATE.

**CRITICAL:** To remove a profile photo, send `{ url: "" }` — not `null`.

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

Member about uses rich content format:

```typescript
import { membersAbout } from '@wix/members';

// Read
const res = await membersAbout.getMyMemberAbout();
const content = res.memberAbout?.content; // RichContent

// Write — convert plain text to rich content nodes
const nodes = text.split('\n').filter(Boolean).map(line => ({
  type: 'PARAGRAPH',
  nodes: [{ type: 'TEXT', textData: { text: line, decorations: [] } }],
  paragraphData: {}
}));

// Update or create
if (aboutId) {
  await membersAbout.updateMemberAbout(aboutId, { content: { nodes } }, aboutRevision);
} else {
  await (membersAbout.createMemberAbout as Function)({ content: { nodes } }, memberId);
}
```

### Save Pattern

Show success feedback that auto-dismisses:

```typescript
const [saving, setSaving] = useState(false);
const [saved, setSaved] = useState(false);

async function handleSave() {
  setSaving(true);
  try {
    await members.updateMember(memberId, { profile: {...}, contact: {...} });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  } catch (e) { /* show error */ }
  finally { setSaving(false); }
}
```

## Personal Info Tab

### Contact Fields
- First name, last name, company, job title, birthdate
- Phone number (must be E.164 format: `+1XXXXXXXXXX`)
- Full address: street, line 2, city, state/province, country, postal code

### Phone Number Normalization

```typescript
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw.startsWith('+') ? raw : `+${raw}`;
}
```

### Country Selector

Use a package like `country-list` for the dropdown, or build a simple select with common countries.

## Bookings Tab (MyBookings Component)

React `client:load` component that:

1. Fetches bookings via `extendedBookings.queryExtendedBookings({ withBookingAllowedActions: true })`
2. Splits into **upcoming** (future, not cancelled) and **past** sections
3. Shows: service name, provider, date/time, status badge
4. Actions: cancel (with confirmation + revision), reschedule (link to bookings page)

**Key details:**
- Booking data is nested: `eb.booking?.bookedEntity?.title`
- Allowed actions are booleans: `eb.allowedActions?.cancel`
- `cancelBooking` requires `booking.revision`
- Status badges: CONFIRMED (green), PENDING (blue), CANCELED (red)
- Date/time formatting must use `i18n.getLocale()` for locale-aware display
- Past bookings shown with reduced opacity
- Empty state links to booking page

## Store Orders Tab

Render server-side (not a React component). Display each order with:

1. **Order header** — order number, date, status badges (payment + fulfillment)
2. **Line items** — product image, name, quantity, price
3. **Order total** — formatted with locale currency
4. **Delivery info** — shipping address if available

### Status Badge Colors

```typescript
function getOrderStatusColor(status: string): string {
  const map: Record<string, string> = {
    'APPROVED': '#4caf50', 'FULFILLED': '#4caf50',
    'CANCELED': '#f44336',
    'PARTIALLY_FULFILLED': '#ff9800',
    'PENDING': '#2196f3', 'NOT_FULFILLED': '#2196f3',
    'PAID': '#4caf50', 'UNPAID': '#f44336',
  };
  return map[status] || '#999';
}
```

### Empty State

Always show a helpful empty state with CTA:

```html
<p class="empty">{t('member.emptyOrders')}</p>
<a href="/store">{t('member.browseStore')}</a>
```

## Subscriptions Tab

Display pricing plan subscriptions with full detail:

1. **Plan name** + status badge
2. **Price details** — total, discount, coupon code
3. **Billing cycle** — period, next billing date
4. **Trial info** — free trial badge with duration
5. **Dates** — start, end, pause periods
6. **Cancellation info** — reason and effective date
7. **Cancel action** — CancelSubscription component

### Subscription Price Display

```typescript
const currency = order.priceDetails?.currency || 'USD';
const total = parseFloat(order.priceDetails?.total || '0');
const formattedPrice = new Intl.NumberFormat(locale, {
  style: 'currency', currency
}).format(total);

const cycleDuration = plan.pricing?.subscription?.cycleDuration;
const periodKey = cycleDuration?.unit === 'MONTH' ? 'plans.perMonth'
  : cycleDuration?.unit === 'YEAR' ? 'plans.perYear'
  : 'plans.perPeriod';
```

### Cancel Subscription Component

- Shows confirmation dialog before cancelling
- Tries `NEXT_PAYMENT_DATE` first, falls back to `IMMEDIATELY` (single-payment plans)
- Displays success state after cancellation
- Styled as danger action (red)

## Payment Tab (SavedPaymentMethods Component)

React `client:load` component that:

1. Lists saved payment methods with card brand, last 4 digits, expiration, holder name
2. "Primary" badge on default method
3. Actions: set as primary, delete (with confirmation)

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

Handles credential management:

1. **Change email** — `authentication.changeLoginEmail(memberId, newEmail)`
2. **Reset password** — `authentication.sendSetPasswordEmail(email)`

**CRITICAL:** Both require member identity — call from client-side. `auth.elevate()` strips member identity.

### Display Member Metadata
- Member since date (from `_createdDate`)
- Last login timestamp (from `_updatedDate` or `lastLoginDate`)

## General Patterns

### Translation Keys

All member area text must use translation keys:
- Tab labels: `member.tabProfile`, `member.tabOrders`, etc.
- Status values: `status.active`, `status.canceled`, etc.
- Empty states: `member.emptyOrders`, `member.emptyBookings`, etc.
- Actions: `member.browseStore`, `member.browsePlans`, etc.
- Form labels: `profile.nickname`, `profile.firstName`, etc.

### Error Handling

Every async operation needs:
1. Loading state (disable buttons, show spinner/text)
2. Error catch with user-friendly message
3. Success feedback (toast, checkmark, text change)
4. Auto-dismiss success after 3 seconds

### Responsive Design

- Tabs become icon-only on mobile
- Form layouts switch from 2-column to single column
- Cards stack vertically
- Photo upload areas shrink proportionally
