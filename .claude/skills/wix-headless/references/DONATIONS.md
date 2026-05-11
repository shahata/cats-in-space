# Donations

## Quickstart — copy the snippets

```bash
SKILL=~/.claude/skills/wix-headless/snippets
cp -R "$SKILL/donations/." src/
```

That drops `src/components/DonateCard.tsx` and `src/pages/donate/{index,thank-you}.astro`. The donate page wires up campaign metrics (`getDonationCampaignMetrics`), preset + custom amount, frequency, donor fee opt-in, donor note via `buyerNote`, and the `ecomCheckout` redirect with `preferences: { checkIfPublish: true }`.

⚠️ **Install the Wix Donations app first** — it's NOT installed by default. Call `apps-installer-service` with `appDefId: "333b456e-dd48-4d6b-b32b-9fd48d74e163"` before any campaign API call.

⚠️ **`DonationCampaign.coverImage` type drift** — SDK types `coverImage: string` but at runtime it's an `Image` object. Render with `string | { id, url, ... } | undefined`; write via REST PATCH with `fieldMask: { paths: ["coverImage"] }`.

Customize per site: the campaign-card decorative emojis (`🛰️ 🌱 🧑‍🚀 🪐 🔭 🧪 🚀 👩‍🔬`) in `pages/donate/index.astro`.

This reference is the *why* — campaign goal/progress rendering, frequency vs single-payment, cover-image import workflow.

---

Fundraising campaigns powered by the Wix Donations app. Campaigns are entities; payments go through the standard eCom cart/checkout flow.

---

## Setup

### 1. Install the Wix Donations app

The Donations app is NOT installed by default. Calling the campaigns API on a site without it returns `428 Precondition Required` with `APP_NOT_INSTALLED`. Install it via the App Installation API:

```bash
POST https://www.wixapis.com/apps-installer-service/v1/app-instance/install
{
  "tenant": { "tenantType": "SITE", "id": "<siteId>" },
  "appInstance": { "appDefId": "333b456e-dd48-4d6b-b32b-9fd48d74e163", "enabled": true }
}
```

### 2. Install the SDK package

```bash
npm install @wix/donations
```

Exports `donationCampaigns` with `createDonationCampaign`, `updateDonationCampaign`, `getDonationCampaign`, `queryDonationCampaigns`, `getDonationCampaignMetrics`.

---

## Donations app ID

The donations app id (`333b456e-dd48-4d6b-b32b-9fd48d74e163`) isn't exported from `@wix/donations`. It's already defined in `src/utils/appIds.ts` as `DONATIONS_APP_ID` — import from there.

---

## Seeding Campaigns

Campaigns are created in an **active** state and immediately accept donations.

```ts
await auth.elevate(donationCampaigns.createDonationCampaign)({
  name: "Zero-G Litter Box Dynamics",
  donationFrequencies: ["ONE_TIME", "MONTH", "YEAR"],
  campaignGoal: {
    targetAmount: { amount: "25000" },
    acceptDonationsAfterGoal: true,
  },
  customAmountEnabled: true,
  customAmountOptions: {
    minimum: { amount: "5" },
    maximum: { amount: "10000" },
  },
  predefinedDonationAmounts: [
    { _id: "<GUID>", price: { amount: "25" }, description: "Buy one bag of anti-grav sand" },
    { _id: "<GUID>", price: { amount: "50" }, description: "Fund one scoop" },
  ],
  commentsEnabled: true,
  askDonorCoverFee: true,
});
```

**Rules:**
- `name` and `donationFrequencies` are required.
- At least one of `customAmountEnabled` or `predefinedDonationAmounts` must be set.
- Each `predefinedDonationAmounts[i]._id` must be a client-generated GUID (you provide it; don't leave blank).
- `campaignGoal.targetAmount.amount` must be > 0.
- Amounts are strings in the site's default currency only.

---

## Attaching a Cover Image

`coverImage` has a shape mismatch between SDK and REST — **use REST with the object form** for reliability:

```ts
// 1. Import an external URL (e.g. AI-generated image) into Wix Media
POST https://www.wixapis.com/site-media/v1/files/import
{ "url": "<public URL>", "displayName": "cover.png", "mimeType": "image/png", "mediaType": "IMAGE" }
// Response: { file: { id, url, ... } }

// 2. PATCH the campaign with the image + fieldMask
PATCH https://www.wixapis.com/donation-campaigns/v2/donation-campaigns/<id>
{
  "donationCampaign": {
    "revision": "<current revision>",
    "coverImage": { "id": "<file.id>", "url": "<file.url>", "width": 1792, "height": 1024, "altText": "..." }
  },
  "fieldMask": { "paths": ["coverImage"] }
}
```

### Shape mismatch gotchas (READ THIS)

- **SDK types say `coverImage: string`** but runtime returns an `Image` object `{ id, url, width, height, altText }`. Your rendering code must handle both forms:

  ```astro
  const ci = c.coverImage as { id?: string; url?: string } | string | undefined;
  const src = typeof ci === "string" ? ci : ci?.id || ci?.url;
  const cover = getImageUrl(src, 800, 440);
  ```

- **If you call the SDK with `coverImage: "wix:image://..."`**, it sends that string as `coverImage.url` in the REST body, which Wix rejects as "not a valid Web URL". Pass an https URL, or use REST directly with the object form.

---

## Reading Campaigns

```ts
const elevatedQuery = auth.elevate(donationCampaigns.queryDonationCampaigns);
const result = await elevatedQuery({
  filter: { archived: { $ne: true } },
});
const campaigns = result.donationCampaigns ?? [];
```

`donationCampaigns` is the array of campaigns. The SDK get/update helpers return the campaign entity **unwrapped** — not in a `{ donationCampaign: ... }` envelope like REST.

### Metrics (raised amount + donor count)

```ts
const elevatedMetrics = auth.elevate(donationCampaigns.getDonationCampaignMetrics);
const m = await elevatedMetrics(campaign._id!);
const first = m.currencyMetricsList?.[0];
const raised = parseFloat(first?.totalAmount?.amount || "0");
const formattedRaised = first?.totalAmount?.formattedAmount || "";
const donorCount = first?.donationCount ?? 0;
```

`campaignGoal` must be set for metrics to work; otherwise returns `CAMPAIGN_GOAL_NOT_SET`.

## Campaign Listing UX Parity

A donation page should feel like a fundraising product, not a static "support us" form. For each campaign card, render:

- Cover image with fallback, campaign name, and description.
- Raised amount, target amount, progress percent, and donor count from `getDonationCampaignMetrics`.
- A progress bar only when `campaignGoal.targetAmount` exists and is greater than zero.
- Preset amount buttons when `predefinedDonationAmounts` exists.
- Custom amount input when `customAmountEnabled` is true, with min/max validation.
- Frequency selector only when the campaign supports more than one frequency.
- Donor-fee checkbox only when `askDonorCoverFee` is true.
- Donor note textarea only when `commentsEnabled` is true.
- Clear disabled/closed/archived state when the campaign cannot accept donations.

---

## Donation Checkout Flow

Donations go through the **standard eCom cart → checkout → redirect** flow. The donation line item uses a special `catalogReference`:

```ts
import { checkout } from "@wix/ecom";
import { DONATIONS_APP_ID } from "../utils/appIds";

const { _id: checkoutId } = await checkout.createCheckout({
  lineItems: [{
    quantity: 1,
    catalogReference: {
      appId: DONATIONS_APP_ID,
      catalogItemId: campaignId,
      options: {
        amount,                       // number, required, > 0
        frequency: "MONTH",           // optional: "WEEK" | "MONTH" | "YEAR" — omit for one-time
        donorCoveringFees: true,      // optional: adds 2.9% for fees
      },
    },
  }],
  channelType: checkout.ChannelType.WEB,
});

// Donor note (if campaign has commentsEnabled) — see below
if (note && checkoutId) {
  await checkout.updateCheckout(checkoutId, { buyerNote: note });
}

const { redirectSession } = await redirects.createRedirectSession({
  ecomCheckout: { checkoutId: checkoutId! },
  callbacks: checkoutCallbacks({
    thankYouPagePath: "/donate/thank-you",
    postFlowPath: "/donate",
  }),
  preferences: { checkIfPublish: true },
});
window.location.href = redirectSession!.fullUrl!;
```

Always build `callbacks` via the shared `checkoutCallbacks()` helper — never inline a partial object. See `ECOMMERCE.md` → "Redirect callbacks: always pass all of them".

Donations bypass the shopping cart — call `checkout.createCheckout({ lineItems, channelType })` directly so the donor's standing cart is untouched (same pattern as Buy Now in [ECOMMERCE.md](ECOMMERCE.md)).

`catalogReference.options` accepts only `amount`, `frequency`, and `donorCoveringFees`. Notes and any other custom data flow through the checkout (e.g. `buyerNote`).

---

## Donor Notes (`commentsEnabled`)

The campaign-level `commentsEnabled: true` flag does NOT automatically add a comment field on the donation line item. To collect a donor note and attach it to the order:

1. Add a `<textarea>` to your donation UI (conditional on `campaign.commentsEnabled`).
2. After `checkout.createCheckout`, call `checkout.updateCheckout(checkoutId, { buyerNote: note })`.
3. Proceed with `createRedirectSession`.

The note becomes the order's `buyerNote`, visible in the merchant dashboard and in `ecomOrders.searchOrders` responses.

---

## Recognizing Donations in Orders

When listing eCom orders (e.g. in the member Orders tab), donation line items are identified by:

- `lineItem.catalogReference.appId === "333b456e-dd48-4d6b-b32b-9fd48d74e163"`
- `lineItem.itemType.custom === "DONATION"` (secondary signal)
- Recurring donations carry a `subscriptionInfo` block with `subscriptionSettings.frequency`.

---

## Checklist

- [ ] Install the Donations app via `apps-installer-service` (one-time, per site)
- [ ] `@wix/donations` installed
- [ ] Campaigns seeded with: name, `donationFrequencies`, `campaignGoal.targetAmount`, one of `customAmountEnabled` / `predefinedDonationAmounts`, optional `commentsEnabled`, `askDonorCoverFee`
- [ ] Cover image generated + imported via `site-media/v1/files/import` + attached via PATCH with `fieldMask.paths: ["coverImage"]`
- [ ] `/donate` listing page renders cards: name, cover, progress bar (from `getDonationCampaignMetrics`), donor count, donate UI
- [ ] Donate UI: pick amount (predefined or custom), pick frequency (if >1), donor-fee opt-in (if `askDonorCoverFee`), note textarea (if `commentsEnabled`)
- [ ] Donate submit adds to cart with donation `catalogReference` → creates checkout → updates `buyerNote` if note present → redirects
- [ ] Thank-you page at `/donate/thank-you`
- [ ] No-goal UI: hide progress bar when `campaignGoal.targetAmount` is missing/0
- [ ] Render: handle `coverImage` as both string and object shape
- [ ] Member Orders tab: donation line items get a distinct badge via `catalogReference.appId`

---

## Common Errors

| Status | Code | Cause |
|---|---|---|
| 428 | `APP_NOT_INSTALLED` | Donations app not installed — run the install call first |
| 400 | `INVALID_PATCH` / `missing hierarchies` | Missing `fieldMask.paths` on PATCH — REST requires it even for "partial updates" |
| 400 | `INVALID_ARGUMENT` on `coverImage.url` | Passing `wix:image://...` as a string via SDK — use REST with object form, or pass an https URL |
| 409 | `INVALID_REVISION` | Stale revision — GET the campaign first to get the current `revision` |
| 400 | `NO_PAYMENT_DEFINITION` | Neither `customAmountEnabled` nor `predefinedDonationAmounts` set on create |
