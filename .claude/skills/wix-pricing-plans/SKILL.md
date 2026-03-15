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

### Free Plans — Direct Order

```typescript
import { orders } from '@wix/pricing-plans';

// Creates order directly (member must be logged in)
await orders.createOnlineOrder(planId);
```

### Paid Plans — Redirect to Wix Checkout

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

**CRITICAL:** `createRedirectSession` must be called client-side where the member session is active.

### Callback Parameters

After checkout, Wix redirects to `postFlowUrl` (or `thankYouPageUrl`) with query params:
- `planOrderId`: ID of the pricing plan order

## Member Orders

### Listing Member's Orders

```typescript
import { orders } from '@wix/pricing-plans';

// List current member's orders (client-side, uses member session automatically)
const result = await orders.memberListOrders();
const myOrders = result.orders || [];
```

**CRITICAL:** `memberListOrders()` uses the logged-in member's session automatically — no need to pass a member ID.

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
import { orders } from "@wix/pricing-plans";

function PlanCheckout({ planId, isFree, isLoggedIn }) {
  const handleClick = async () => {
    if (!isLoggedIn) {
      window.location.href = "/api/auth/login";
      return;
    }
    if (isFree) {
      await orders.createOnlineOrder(planId);
      alert("Joined!");
      window.location.reload();
    } else {
      const { redirectSession } = await redirects.createRedirectSession({
        paidPlansCheckout: { planId },
        callbacks: { postFlowUrl: window.location.origin + "/plans?success=true" },
      });
      if (redirectSession?.fullUrl) window.location.href = redirectSession.fullUrl;
    }
  };
  return <button onClick={handleClick}>{isFree ? "Join Free" : "Subscribe"}</button>;
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
