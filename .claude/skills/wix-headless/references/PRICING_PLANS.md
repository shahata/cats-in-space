# Wix Pricing Plans

## Setup

Install the Pricing Plans app via the Apps Installer API (appDefId `1522827f-c56c-a5c9-2ac9-00f9e6ae12d3`):

```http
POST https://www.wixapis.com/apps-installer-service/v1/app-instance/install
Body: { "tenant": { "tenantType": "SITE", "id": "<siteId>" }, "appInstance": { "appDefId": "1522827f-c56c-a5c9-2ac9-00f9e6ae12d3", "enabled": true } }
```

```bash
npm install @wix/pricing-plans  # plans, orders
npm install @wix/redirects      # createRedirectSession for checkout
```

## Listing Plans

```typescript
import { plans } from '@wix/pricing-plans';

const result = await plans.queryPublicPlans({});
const allPlans = result.plans || [];
```

### PublicPlan Shape

```typescript
interface PublicPlan {
  _id?: string;
  name?: string | null;
  description?: string | null;
  perks?: StringList;        // { values?: string[] }
  pricing?: Pricing;
  primary?: boolean;
  _createdDate?: Date | null;
  slug?: string;
}

interface Pricing {
  subscription?: Recurrence;           // recurring plans
  singlePaymentForDuration?: Duration; // one-time with duration
  singlePaymentUnlimited?: boolean;    // one-time, valid until canceled
  price?: Money;                       // { value?: string, currency?: string }
  freeTrialDays?: number | null;
}

interface Recurrence {
  cycleDuration?: Duration;   // { count?: number, unit?: "DAY"|"WEEK"|"MONTH"|"YEAR" }
  cycleCount?: number;        // 0 = unlimited
}
```

⛔ **Breaks at runtime:** Perks are `plan.perks?.values` (string array), NOT `plan.perks` directly. `StringList` has a `values` property, so accessing it directly renders `[object Object]`. → Access `plan.perks?.values` to get the string array.

⛔ **Breaks at runtime:** Price is at `plan.pricing?.price?.value` (string), currency at `plan.pricing?.price?.currency`.

⚠️ **Common mistake:** There is NO `pricingVariants` on PublicPlan. That's a different API version. → Use `plan.pricing?.price?.value` and `plan.pricing?.subscription` for all pricing info.

### Displaying Price

```typescript
const priceValue = plan.pricing?.price?.value ?? "0";
const currency = plan.pricing?.price?.currency;  // never hardcode a fallback like 'USD'
const isFree = parseFloat(priceValue) === 0;
const cycleDuration = plan.pricing?.subscription?.cycleDuration;
const trialDays = plan.pricing?.freeTrialDays ?? 0;
const perksList = plan.perks?.values ?? [];
```

⛔ **Breaks at runtime:** Never hardcode a currency fallback (`'USD'`, `'ILS'`, …). Currency always comes from the server. For site-wide currency, fetch `siteProperties.getSiteProperties().properties?.paymentCurrency` via `auth.elevate` and throw if missing — a silent fallback will ship the wrong price symbol to one region or another.

## Checkout Flow

**Always use `createRedirectSession`** for all plans (free and paid). The Wix checkout redirect page handles login, free plan enrollment, and paid checkout — no need to branch logic client-side.

```typescript
import { redirects } from '@wix/redirects';
import { checkoutCallbacks } from '../utils/redirects';

const { redirectSession } = await redirects.createRedirectSession({
  paidPlansCheckout: { planId },
  callbacks: checkoutCallbacks({
    thankYouPagePath: '/plans/thank-you',
    postFlowPath: '/plans',
  }),
  // NOTE: do NOT use preferences.checkIfPublish for plans — only for eCommerce checkout
});

if (redirectSession?.fullUrl) {
  window.location.href = redirectSession.fullUrl;
}
```

⛔ **Always go through `checkoutCallbacks()` — never hand-build the `callbacks` object.** It fills in `cartPageUrl`, `bookingsServiceListUrl`, `planListUrl` (site-wide constants) alongside the context-aware thankYou/postFlow. Wix may redirect to any of these callback URLs mid-flow; a partial object silently drops users on Wix-hosted pages. See `ECOMMERCE.md` → "Redirect callbacks: always pass all of them".

⚠️ **Common mistake:** Do NOT check login state or free/paid before redirecting. The redirect page handles all cases: prompts login if needed, processes free plans directly, and shows payment for paid plans.

💡 **Best practice:** `createRedirectSession` works even for visitors who are not logged in — the redirect page will prompt login first.

### Callback Parameters

After checkout, Wix redirects to `postFlowUrl` (or `thankYouPageUrl`) with query params:
- `planOrderId`: ID of the pricing plan order

## Member Orders

### Listing Member's Orders

```typescript
import { orders } from '@wix/pricing-plans';

// memberListOrders uses the logged-in member's session — no auth.elevate needed
const result = await orders.memberListOrders();
const today = new Date().toISOString().split('T')[0];
const myOrders = (result.orders ?? []).filter((o) =>
  o.status !== orders.OrderStatus.DRAFT &&
  !(o.endDate && o.endDate.toISOString().split('T')[0] < today)
);
```

💡 **Best practice:** `memberListOrders()` uses the logged-in member's session automatically — no need to pass a member ID.

⚠️ **`o.endDate` is `Date | null`, not a string** — call `.toISOString()` directly.

⚠️ **Common mistake:** Filter out `DRAFT` orders (incomplete purchases) and expired orders (endDate before today). Compare dates using date-only strings (YYYY-MM-DD) to avoid timezone issues.

### Order Shape — use `pricing`, not `priceDetails`

Use `orders.Order` from `@wix/pricing-plans` directly — don't redeclare it. Key fields:

- `_id`, `planId`, `planName` / `planDescription` (denormalized)
- `status` — compare against `orders.OrderStatus` (DRAFT/PENDING/ACTIVE/PAUSED/ENDED/CANCELED)
- `lastPaymentStatus` — compare against `orders.PaymentStatus` (PAID/FAILED/REFUNDED/…)
- `type` — `orders.OrderType.ONLINE` | `OFFLINE`
- `autoRenewCanceled`, `startDate`, `endDate` (both `Date | null`), `currentCycle`, `buyer`
- `cancellation.cause` — compare against `orders.CancellationCause` (OWNER_ACTION/…)
- `pricing` — structured pricing field. Read prices via `pricing.prices[0].price.{subtotal,total,discount,currency,coupon}` (single-cycle) or iterate `prices[]` for multi-cycle plans. Read billing cycle via `pricing.subscription.cycleDuration.{count,unit}`. **This is the modern shape — use it.**

⛔ **Don't read `priceDetails`.** It's a legacy flat-shape field that Wix retains on response wire-paths for backwards compat but has removed from the base `Order` type. Reading it requires `Order & { priceDetails?: PriceDetails }` intersection — unnecessary once you migrate to `pricing`. The only field without a clean equivalent is `priceDetails.planPrice`; use `pricing.prices[0].price.subtotal` as the substitute (it's the pre-tax, pre-discount amount, fine for "is free" checks and price display).

### Canceling a Subscription

```typescript
// Cancel at next payment date (recurring plans)
await orders.requestCancellation(orderId, orders.CancellationEffectiveAt.NEXT_PAYMENT_DATE);

// Cancel immediately (required for single-payment plans)
await orders.requestCancellation(orderId, orders.CancellationEffectiveAt.IMMEDIATELY);
```

**Pattern:** Try `NEXT_PAYMENT_DATE` first, fall back to `IMMEDIATELY` if it fails (single-payment plans only support immediate cancellation).

⛔ **Breaks at runtime:** `requestCancellation` requires member authentication — calling from server-side throws a permission error. → Call from a client-side React component where the member session is active.

### Other Order Operations

```typescript
// Get specific order — returns the Order directly, NOT { order }
const order = await orders.memberGetOrder(orderId);

// Admin operations (server-side):
await orders.cancelOrder(orderId);           // admin cancel
await orders.pauseOrder(orderId);            // pause subscription
await orders.resumeOrder(orderId);           // resume paused subscription
await orders.managementListOrders(options);  // list all orders (admin)
```

⛔ **Breaks at runtime:** `memberGetOrder` returns the `Order` directly — there is no `{ order }` wrapper. `result?.order` is always `undefined`. → `const order = await orders.memberGetOrder(orderId);`

## Coupons (REST API)

Coupons are managed via REST API, not the SDK.

### Create a Coupon

```
POST https://www.wixapis.com/stores/v2/coupons
```

```json
{
  "specification": {
    "name": "Free Plans",
    "code": "FREEPLANS",
    "active": true,
    "startTime": "1710460800000",
    "scope": {
      "namespace": "pricingPlans"
    },
    "percentOffRate": 100
  }
}
```

### Coupon Scope for Pricing Plans

| Namespace | Group | Entity ID | Result |
|-----------|-------|-----------|--------|
| `pricingPlans` | N/A | N/A | All pricing plans |
| `pricingPlans` | `plan` | plan ID | Specific plan |

### Coupon Types

- `percentOffRate`: Percentage discount (e.g., `100` for 100% off)
- `moneyOffAmount`: Fixed amount discount
- `fixedPriceAmount`: Fixed price
- `freeShipping`: Free shipping
- `buyXGetY`: Buy X get Y free (`{ x: 3, y: 2 }`)

## React Component Patterns

### Checkout Button

```tsx
import { redirects } from "@wix/redirects";

function PlanCheckout({ planId }: { planId: string }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const { redirectSession } = await redirects.createRedirectSession({
        paidPlansCheckout: { planId },
        callbacks: checkoutCallbacks({
          thankYouPagePath: "/plans/thank-you",
          postFlowPath: "/plans",
        }),
        // NOTE: do NOT use preferences.checkIfPublish for plans — only for eCommerce checkout
      });
      if (redirectSession?.fullUrl) window.location.href = redirectSession.fullUrl;
    } catch (e) {
      alert(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };
  return <button onClick={handleClick} disabled={loading}>{loading ? "Processing..." : "Subscribe"}</button>;
}
```

### Member Subscriptions List

```tsx
import { orders } from "@wix/pricing-plans";

function MemberSubscriptions() {
  const [myOrders, setMyOrders] = useState([]);

  useEffect(() => {
    orders.memberListOrders().then(result => {
      setMyOrders(result.orders || []);
    });
  }, []);

  async function handleCancel(orderId: string) {
    try {
      await orders.requestCancellation(orderId, orders.CancellationEffectiveAt.NEXT_PAYMENT_DATE);
    } catch {
      await orders.requestCancellation(orderId, orders.CancellationEffectiveAt.IMMEDIATELY);
    }
  }

  return myOrders.map(order => (
    <div key={order._id}>
      <span>{order.planName}</span>
      <span>{order.status}</span>
      {order.status === "ACTIVE" && !order.autoRenewCanceled && (
        <button onClick={() => handleCancel(order._id)}>Cancel</button>
      )}
    </div>
  ));
}
```

## Plans Page Implementation Guidelines

### Plans Listing Page

A good pricing plans page includes:

1. **Page header** — title and subtitle
2. **Plans grid** — `repeat(auto-fit, minmax(280px, 1fr))` for responsive card layout
3. **Plan cards** with:
   - Plan name
   - Description
   - Price display (large, prominent) with period label ("/month", "/year")
   - "Free" text for zero-price plans
   - Free trial badge if `freeTrialDays > 0`
   - Perks list with checkmarks
   - Subscribe button (PlanCheckout component)
4. **Featured plan highlighting** — middle plan (or `plan.primary`) gets accent border, glow shadow, and "Most Popular" badge

### Featured Plan

Visually highlight the primary/recommended plan (the one with `plan.primary === true` or a middle plan). Show a "Most Popular" badge and make it stand out from the others.

### Price Display

Read price/currency from `plan.pricing?.price?.{value, currency}` and format via the canonical pattern in [SDK_CORE.md → Price Formatting](SDK_CORE.md#price-formatting). Map `plan.pricing?.subscription?.cycleDuration.unit` (MONTH / YEAR / WEEK / DAY) to translation keys (`plans.perMonth`, …) for the period label.

### Perks List

Display perks as a bulleted list with checkmarks. Access them at `plan.perks?.values` (string array).

⛔ **Breaks at runtime:** Perks are `plan.perks?.values` (not `plan.perks` directly).

### Plan Image (REST gotchas)

Every plan should have an image — generate via Wix Runware / OpenAI like other entities (see [MEDIA.md](references/MEDIA.md)). Two pitfalls:

⛔ **The SDK type lies — `image?: string` is NOT what the wire wants.** The REST API expects an OBJECT `{ id, url, width, height }`. Sending a `wix:image://...` URI string returns `400 Expected an object`. Same shape pattern as Bookings staff portraits and gift cards.

⛔ **PATCH a plan WITHOUT a `fieldMask` and the server may return `INVALID_PATCH "missing hierarchies"`** — particularly for the `primary` plan. The docs don't mention this; you must send the mask:

```javascript
await wixFetch(`/pricing-plans/v3/plans/${planId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    plan: {
      id: planId,
      revision,
      image: { id: img.id, url: `https://static.wixstatic.com/media/${img.id}`, width: 1280, height: 960 },
    },
    fieldMask: { paths: ['image'] },  // ← required, not optional
  }),
});
```

For create (`POST /pricing-plans/v2/plans`) the same object shape works — no fieldMask needed.

The `MANAGE-PLANS` scope is needed for both PATCH and POST, which the default `npx wix token` site token may NOT include — if you get `403`, run management calls through the Wix MCP `CallWixSiteAPI` (which uses your account token) or set up a token with manage scope.

### Free Trial Display

```typescript
const trialDays = plan.pricing?.freeTrialDays || 0;
// Use interpolation: t('plans.freeTrialDays', { days: String(trialDays) })
```

### Subscribe Button

Use a `PlanCheckout` React component with `client:load`:

```tsx
<PlanCheckout planId={plan._id!} client:load />
```

The component calls `redirects.createRedirectSession({ paidPlansCheckout: { planId } })` for ALL plans (free and paid). The Wix checkout page handles login, free enrollment, and payment.

⚠️ **Common mistake:** Do NOT check login state or free/paid before redirecting. The redirect page handles all cases.

### Thank You Page

After checkout, Wix redirects to `thankYouPageUrl` with `?planOrderId=<id>`. Create a simple thank-you page that:
- Shows a success message
- Links back to the plans page or member dashboard
- Optionally fetches order details via `orders.memberGetOrder(planOrderId)`

## Tips

1. **One checkout path** — Use `redirects.createRedirectSession({ paidPlansCheckout: { planId } })` for every plan. The hosted Wix flow prompts login when needed and handles both free enrollment and paid checkout.
2. **Do not branch free vs paid** — Do not call `createOnlineOrder` for free plans. The split flow creates inconsistent UX and bypasses the same callback handling used by paid plans.
3. **`queryPublicPlans`** returns only visible (non-archived) plans
4. **Plan perks** are strings in `perks.values[]`, not objects with descriptions
5. **Order has denormalized plan info** — `planName`, `planDescription`, `planPrice` are on the order directly
6. **Cancellation pattern** — Try `NEXT_PAYMENT_DATE` first, fall back to `IMMEDIATELY` for single-payment plans
7. **`memberListOrders`** needs no params — uses the current member session automatically
