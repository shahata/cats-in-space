# Backend Event & Dashboard Page Extensions

Wix Managed Headless Astro projects support the same CLI-app extension types you'd find in a standalone `@wix/cli` app — backend events, service plugins, dashboard pages, dashboard modals. Use them for things Astro pages can't do: react to webhooks, run admin UIs inside `manage.wix.com`, customize business flows.

If `src/extensions.ts` doesn't exist yet, create it — extensions are supported on headless Astro projects, the file is just opt-in.

## Registration: `src/extensions.ts`

Single default export, builder-style. Each extension declared inline with a fresh UUID `id` and a `source` (event/service plugin) or `component` (dashboard page) path relative to `src/`.

```typescript
// src/extensions.ts
import { app, extensions } from "@wix/astro/builders";

export default app()
  .use(
    extensions.event({
      id: "7739fb92-4087-4719-a000-48e306badfaa",
      source: "./backend/events/order-approved/order-approved.ts",
    }),
  )
  .use(
    extensions.dashboardPage({
      id: "a5500d09-8d37-4dc7-91c9-f40d2ec1c221",
      title: "My Page",
      routePath: "",
      component: "./dashboard/pages/my-page/my-page.tsx",
    }),
  );
```

Generate UUIDs with `crypto.randomUUID()` — don't reuse IDs across extensions.

`npx wix build` is the integration check (catches missing exports, bad source paths). `npx astro check` only catches TypeScript errors. Run **both** before declaring done.

### Required: `security.checkOrigin: false` in `astro.config.mjs`

Wix posts webhooks to `/_wix/extensions/*` from its own origin. Astro 5's default CSRF check (`security.checkOrigin: true`) rejects them silently — set it to `false` so webhook handlers fire:

```js
// astro.config.mjs
export default defineConfig({
  // ...
  security: { checkOrigin: false },
  output: "server",
});
```

Set this when scaffolding. If extensions stop firing on an existing project, this is the first place to check.

---

## Backend Event Extensions

React to Wix domain events server-side — order created/approved, cart updated, blog post published, etc. Common events live in the `wix-cli-backend-event` skill's `references/COMMON-EVENTS.md`.

### File pattern

```
src/backend/events/<name>/<name>.ts
```

### Default-exported listener

The event listener must be the module's default export — `@wix/astro` reads `module.default` to register the webhook at build time and dispatch at request time:

```typescript
// src/backend/events/order-approved/order-approved.ts
import { orders } from "@wix/ecom";

export default orders.onOrderApproved(async (event) => {
  const order = event.data.order;
  if (!order) return;
  console.log("Order approved:", order._id);
});
```

### Event payload shape — TWO envelope shapes

The Wix SDK exposes two distinct envelope shapes, and which one you get depends on the specific event. **Don't guess — let TypeScript drive.** Hover the handler param or jump to the SDK type for the event you're listening to.

| Envelope shape | Used by | Access pattern |
|---|---|---|
| `{ entity: T, metadata }` | CRUD domain events: `onOrderCreated`, `onOrderUpdated`, post `onPostCreated`, etc. | `event.entity` is the full entity |
| `{ data: { <namedField>: T }, metadata }` | Action / state-change events: `onOrderApproved`, `onOrderCanceled`, `onOrderFulfilled`, `onOrderCommitted`, `onOrderPaymentStatusUpdated` | `event.data.order` (or `event.data.<thing>`) — and may be optional, so null-check |

For example (verbatim from the SDK types):

```ts
interface OrderCreatedEnvelope  { entity: Order; metadata: EventMetadata; }            // event.entity
interface OrderApprovedEnvelope { data: { order?: Order }; metadata: EventMetadata; }  // event.data.order
```

**The rule: read the envelope type for the specific event handler you're writing.** Don't carry assumptions across event handlers — a `data.order` pattern that works for `onOrderApproved` is wrong for `onOrderCreated`, and vice versa.

### Auth context: webhook ≠ member

Webhooks fire without member identity. To write to admin-only collections, elevate via `@wix/essentials`:

```typescript
import { orders } from "@wix/ecom";
import { items } from "@wix/data";
import { auth } from "@wix/essentials";

const insertOrderLog = auth.elevate(items.insert);

export default orders.onOrderApproved(async (event) => {
  const order = event.data.order;
  if (!order) return;
  await insertOrderLog("OrderLog", {
    orderId: order._id,
    orderNumber: order.number,
    total: order.priceSummary?.total?.formattedAmount,
    buyerEmail: order.buyerInfo?.email,
    orderCreatedDate: order._createdDate,
  });
});
```

### Calling external services from a handler

Handlers can call any external HTTP API via `fetch` — useful for forwarding events to messaging platforms (Slack, Discord, Telegram), CRMs, email/SMS providers, or your own backend. Read secrets from `process.env` (set via `wix env set` — see [SETUP.md](SETUP.md)) and bail gracefully if they're missing so a misconfigured environment doesn't crash the webhook:

```typescript
async function notifyExternal(text: string) {
  const token = process.env.EXTERNAL_API_TOKEN;
  if (!token) {
    console.warn("External notification skipped: missing EXTERNAL_API_TOKEN");
    return;
  }
  const response = await fetch("https://api.example.com/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    console.error("External notification failed", response.status, await response.text());
  }
}
```

Don't throw on external-call failures — Wix may retry the webhook on unhandled errors, which can amplify a downstream outage into duplicate side effects (e.g. multiple notifications for the same order). Log and return.

### Logging on Cloudflare Workers

Headless Astro deploys to Cloudflare Workers — no persistent filesystem. `console.log` is visible via `wrangler tail` or the Cloudflare dashboard, but isn't forwarded into Wix. For durable logging, persist to a CMS collection via `@wix/data` or call `monitoring.captureMessage(...)` from `@wix/essentials`.

---

## Dashboard Page Extensions

Custom admin pages rendered inside `manage.wix.com`. Use them for any site-owner or backoffice capability that should be available to admins: operational dashboards, custom reports, approval queues, fulfillment tools, moderation tools, workflow automation controls, integration settings, customer-service screens, content management, and multi-step admin workflows.

Dashboard extensions are not limited to CMS item management. A CMS-style editor is only one common pattern; the same dashboard surface can orchestrate almost any admin-only task that is useful for the site's business logic.

### File pattern

```
src/dashboard/pages/<name>/<name>.tsx
```

Default-export a React component wrapped in `WixDesignSystemProvider`:

```tsx
import type { FC } from "react";
import { Page, WixDesignSystemProvider } from "@wix/design-system";
import "@wix/design-system/styles.global.css";

const DashboardPage: FC = () => (
  <WixDesignSystemProvider features={{ newColorsBranding: true }}>
    <Page>
      <Page.Header title="My Page" />
      <Page.Content>{/* ... */}</Page.Content>
    </Page>
  </WixDesignSystemProvider>
);

export default DashboardPage;
```

### Auth context: admin

Dashboard pages run as the logged-in admin. **Don't `auth.elevate`** — admin permissions already cover everything; elevation here is redundant and wrong.

### `<Modal />` is forbidden in Dashboard Pages

Dashboard Pages cannot render WDS `<Modal />` directly. Two acceptable patterns:

1. **`SidePanel`** — for inline add/edit forms that overlay the page. **Wrap it in a `<Box position="fixed">` parent** — without that wrapper the SidePanel renders inline (in the document flow), not as a right-side overlay. The component does not position itself.

   ```tsx
   import { Box, SidePanel } from "@wix/design-system";

   <Box direction="vertical" position="fixed" top="0" right="0" height="100vh" zIndex={1000}>
     <SidePanel closeButtonProps={{ onClick: close }} height="100vh">
       <SidePanel.Header title="Edit" showDivider />
       <SidePanel.Content>{/* form */}</SidePanel.Content>
       <SidePanel.Footer>{/* buttons */}</SidePanel.Footer>
     </SidePanel>
   </Box>
   ```
2. **A separate Dashboard Modal extension** invoked via `dashboard.openModal({ extensionId, ... })` from `@wix/dashboard`.

### `dashboard.navigate` from headless dashboards: limited

`dashboard.navigate({ pageId })` requires UUIDs from the [public list](https://dev.wix.com/docs/sdk/host-modules/dashboard/page-ids). **Many Wix-built page IDs (notably Content Manager `6513755b-2a3b-45b9-8172-99c16e00dfde`) fail with `Error: Unknown link` from headless dashboard contexts** — the page isn't registered in the headless dashboard runtime.

Practical guidance:
- Don't deep-link into Wix-built pages from a headless dashboard. Build the management UI inline instead.
- Never invent dotted-name pageIds (`"data.collection-management..."`). They're always UUIDs.
- For your own dashboard pages, use the extension's `id` from `src/extensions.ts`.

### Toasts

```typescript
import { dashboard } from "@wix/dashboard";
dashboard.showToast({ message: "Saved", type: "success" });
dashboard.showToast({ message: "Failed", type: "error" });
```

---

## Common Admin UI Patterns

Dashboard pages usually combine WDS building blocks into backoffice tools. For CMS-style management, a common pattern is tabs of collections, table per tab, inline add/edit/delete. The same components also work for reports, approval queues, settings screens, order operations, and support workflows.

For CMS-style CRUD, the pieces are:

| Need | WDS component | Notes |
|---|---|---|
| Switch between collections | `Tabs` (in `Page.Tail`, `compactSide`) | Selected ID drives the active table |
| Tabular data | `Table` inside `Card` | Provide explicit `width` per column for strict TS |
| Row actions (Edit/Delete) | `TableActionCell` | `numOfVisibleSecondaryActions={2}` to surface both |
| Add/edit form | `SidePanel` (right-side fixed overlay) | NOT `<Modal />` |
| Image field | `ImageViewer` | Built-in Add/Update/Remove buttons + preview area |
| Reference (single) | `Dropdown` | Options from `items.query(<refCollection>, { paging: { limit: 200 } })` |
| Multi-reference | `MultiSelectCheckbox` | Same option source |
| Status pill | `Badge` (with `skin`) | Map status keywords → success/standard/danger |
| Empty | `EmptyState` (with `skin="page"`) | |
| Loading | `Loader` | |
| Confirm destructive | `window.confirm` | Acceptable since `<Modal />` is forbidden |

Icons (`Add`, `Edit`, `Delete`, `Refresh`) come from `@wix/wix-ui-icons-common` — **not** `@wix/design-system/icons`.

### Picking images: `dashboard.openMediaManager`

```typescript
import { dashboard } from "@wix/dashboard";
const result = await dashboard.openMediaManager({ category: "IMAGE" });
const picked = result.items[0];  // FileDescriptor
const wixImageUri = picked?.url; // "wix:image://v1/..." — store this directly
```

`category` accepts `"IMAGE" | "VIDEO" | "MUSIC" | "DOCUMENT" | "VECTOR_ART" | "3D_IMAGE"`. Pass `multiSelect: true` if you need a list.

### Rendering image fields: use `ImageViewer`, not custom thumbnails

Use `ImageViewer` for image fields — it gives you a preview area plus Add / Update / Remove icon buttons, loading state, and tooltips out of the box:

```tsx
import { ImageViewer } from "@wix/design-system";
import { media } from "@wix/sdk";

const previewUrl = current.startsWith("wix:image://")
  ? media.getScaledToFillImageUrl(current, 320, 320, {})
  : current.startsWith("http") ? current : undefined;

<ImageViewer
  {...(previewUrl ? { imageUrl: previewUrl } : {})}
  width={240}
  height={160}
  onAddImage={() => void pickImage(field.key)}
  onUpdateImage={() => void pickImage(field.key)}
  onRemoveImage={() => handleFieldChange(field.key, "")}
/>
```

⚠️ With `exactOptionalPropertyTypes: true`, conditionally spread `imageUrl` rather than passing `undefined` directly — the prop is typed `string`, not `string | undefined`.

### Rendering images in table cells

Use `media.getScaledToFillImageUrl(uri, 80, 80, {})` for `wix:image://` URIs, then a small `<Image fit="cover" />` (40×40 thumbnail at ~60px column width).

---

## CMS Reference Operations from Code

`@wix/data` field types `REFERENCE` (single) and `MULTI_REFERENCE` behave very differently when writing.

### REFERENCE (single)

Stored as the referenced item's `_id`. Set inline via `items.insert` / `items.update`:

```typescript
await items.insert("Projects", {
  title: "Launch Redesign",
  slug: "launch-redesign",
  clientRef: client._id,  // single REFERENCE — inline is fine
});
```

### MULTI_REFERENCE — cannot be set via insert/update

Multi-reference values write through dedicated reference APIs (insert/update/patch silently drop them):

```typescript
import { items } from "@wix/data";

// After a successful insert/update, sync the multi-ref list:
await items.replaceReferences(
  "Projects",              // collection
  "contributors",          // multi-ref field key
  projectId,               // referring item _id
  [personA, personB],      // referenced _id[] (empty array clears all)
);
```

Signatures (from `@wix/data`):
- `items.replaceReferences(collectionId, field, referringItemId, referencedIds[])` — full replace; pass `[]` to clear.
- `items.insertReference(collectionId, field, referringItem, referencedItem)` — append only.
- `items.removeReference(collectionId, field, referringItem, referencedItem)` — remove single.

### Loading existing multi-references for an Edit form

```typescript
import { items } from "@wix/data";

const result = await items.queryReferenced(collectionId, rowId, fieldKey);
const currentIds = result.items.map((it) => it._id as string);
```

### End-to-end save pattern (add + edit, with multi-refs)

```typescript
// Strip multi-ref fields from the insert/update payload first.
const payload = stripMultiRefs(formValues);

// 1. Main write
const writtenId = mode === "add"
  ? (await items.insert(collectionId, payload))._id
  : (await items.update(collectionId, { _id, ...payload }))._id;

// 2. Sync each multi-ref field separately
await Promise.all(
  multiRefFields.map((f) =>
    items.replaceReferences(collectionId, f.key, writtenId!, formValues[f.key] as string[])
  )
);
```

If step 2 fails after step 1 succeeded, the row is saved but unlinked — surface a distinct error toast ("saved, but linked references could not be updated") and refetch.

---

## See Also

- [SDK_CORE.md](SDK_CORE.md) — CMS field types, `@wix/data` query patterns
- [DEPLOYMENT.md](DEPLOYMENT.md) — `npx astro check` + `npx wix build` + `wix release` ordering
- [MEDIA.md](MEDIA.md) — `wix:image://` URI handling, `getScaledToFillImageUrl`, image upload
