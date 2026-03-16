---
name: wix-pricing-plans
description: Wix Pricing Plans - subscriptions, checkout flow, orders, member order management, cancellation, coupons, and redirect sessions. Covers plan listing, purchase flow for free and paid plans, and SDK types.
---

# Wix Pricing Plans

## SDK Packages

```bash
npm install @wix/pricing-plans  # plans, orders
npm install @wix/redirects      # createRedirectSession for checkout
```

## Listing Plans

```typescript
import { plans } from '@wix/pricing-plans';

const result = await plans.queryPublicPlans().find();
const allPlans = result.items || [];
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

**CRITICAL:** Perks are `plan.perks?.values` (string array), NOT `plan.perks` directly. `StringList` has a `values` property.

**CRITICAL:** Price is at `plan.pricing?.price?.value` (string), currency at `plan.pricing?.price?.currency`.

**CRITICAL:** There is NO `pricingVariants` on PublicPlan. That's a different API version.

### Displaying Price

```typescript
const priceValue = plan.pricing?.price?.value || "0";
const currency = plan.pricing?.price?.currency || "USD";
const isFree = parseFloat(priceValue) === 0;
const cycleDuration = plan.pricing?.subscription?.cycleDuration;
const trialDays = plan.pricing?.freeTrialDays || 0;
const perksList = plan.perks?.values || [];
```

## Checkout Flow

**Always use `createRedirectSession`** for all plans (free and paid). The Wix checkout redirect page handles login, free plan enrollment, and paid checkout — no need to branch logic client-side.

```typescript
import { redirects } from '@wix/redirects';

const { redirectSession } = await redirects.createRedirectSession({
  paidPlansCheckout: { planId },
  callbacks: {
    postFlowUrl: window.location.origin + "/plans?success=true",
    // Optional: thankYouPageUrl for custom thank-you page
  },
});

if (redirectSession?.fullUrl) {
  window.location.href = redirectSession.fullUrl;
}
```

**CRITICAL:** Do NOT check login state or free/paid before redirecting. The redirect page handles all cases: prompts login if needed, processes free plans directly, and shows payment for paid plans.

**CRITICAL:** `createRedirectSession` works even for visitors who are not logged in — the redirect page will prompt login first.

### Callback Parameters

After checkout, Wix redirects to `postFlowUrl` (or `thankYouPageUrl`) with query params:
- `planOrderId`: ID of the pricing plan order

## Member Orders

### Listing Member's Orders

```typescript
import { orders } from '@wix/pricing-plans';

// List current member's orders (uses member session automatically)
const result = await orders.memberListOrders();
const today = new Date().toISOString().split('T')[0];
const myOrders = (result.orders || []).filter((o: any) =>
  o.status !== 'DRAFT' &&
  !(o.endDate && new Date(o.endDate).toISOString().split('T')[0] < today)
);
```

**CRITICAL:** `memberListOrders()` uses the logged-in member's session automatically — no need to pass a member ID.

**CRITICAL:** Filter out `DRAFT` orders (incomplete purchases) and expired orders (endDate before today). Compare dates using date-only strings (YYYY-MM-DD) to avoid timezone issues.

### Order Shape

```typescript
interface Order {
  _id?: string;
  planId?: string;
  planName?: string;           // denormalized plan name
  planDescription?: string;    // denormalized plan description
  planPrice?: string;          // denormalized plan price
  status?: "DRAFT" | "PENDING" | "ACTIVE" | "PAUSED" | "ENDED" | "CANCELED";
  type?: "ONLINE" | "OFFLINE";
  autoRenewCanceled?: boolean; // true = will cancel at next payment
  startDate?: Date | null;
  endDate?: Date | null;
  buyer?: { memberId?: string; contactId?: string };
  priceDetails?: {
    total?: string;
    subtotal?: string;
    discount?: string;
    planPrice?: string;
    currency?: string;
    coupon?: { code?: string; amount?: string; _id?: string };
  };
  currentCycle?: { index?: number };
  lastPaymentStatus?: string;
  cancellation?: { cause?: string; effectiveAt?: string };
}
```

### Canceling a Subscription

```typescript
// Cancel at next payment date (recurring plans)
await orders.requestCancellation(orderId, "NEXT_PAYMENT_DATE");

// Cancel immediately (required for single-payment plans)
await orders.requestCancellation(orderId, "IMMEDIATELY");
```

**Pattern:** Try `NEXT_PAYMENT_DATE` first, fall back to `IMMEDIATELY` if it fails (single-payment plans only support immediate cancellation).

**CRITICAL:** `requestCancellation` requires member authentication — call from client-side.

### Other Order Operations

```typescript
// Get specific order
const order = await orders.memberGetOrder(orderId);

// Admin operations (server-side):
await orders.cancelOrder(orderId);           // admin cancel
await orders.pauseOrder(orderId);            // pause subscription
await orders.resumeOrder(orderId);           // resume paused subscription
await orders.managementListOrders(options);  // list all orders (admin)
```

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
        callbacks: { postFlowUrl: window.location.origin + "/plans?success=true" },
      });
      if (redirectSession?.fullUrl) window.location.href = redirectSession.fullUrl;
    } catch (e: any) {
      alert(e?.message || "Something went wrong");
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
      await orders.requestCancellation(orderId, "NEXT_PAYMENT_DATE");
    } catch {
      await orders.requestCancellation(orderId, "IMMEDIATELY");
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

## Tips

1. **Login required** — Both `createOnlineOrder` and `createRedirectSession` require an active member session
2. **Free plans** use `createOnlineOrder` directly, paid plans redirect to Wix-hosted checkout
3. **`queryPublicPlans`** returns only visible (non-archived) plans
4. **Plan perks** are strings in `perks.values[]`, not objects with descriptions
5. **Order has denormalized plan info** — `planName`, `planDescription`, `planPrice` are on the order directly
6. **Cancellation pattern** — Try `NEXT_PAYMENT_DATE` first, fall back to `IMMEDIATELY` for single-payment plans
7. **`memberListOrders`** needs no params — uses the current member session automatically
