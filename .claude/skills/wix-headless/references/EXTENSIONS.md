# Backend Event & Dashboard Page Extensions

Wix Managed Headless Astro projects support the same CLI-app extension types you'd find in a standalone `@wix/cli` app — backend events, service plugins, dashboard pages, dashboard modals. Use them for things Astro pages can't do: react to webhooks, run admin UIs inside `manage.wix.com`, customize business flows.

⚠️ **Don't reject the request because there's no `src/extensions.ts` yet.** Headless Astro projects do support extensions — the file just hasn't been created yet. Create it and register from there.

## Registration: `src/extensions.ts`

Single default export, builder-style. Each extension declared inline with a fresh UUID `id` and a `source` (event/service plugin) or `component` (dashboard page) path relative to `src/`.

```typescript
// src/extensions.ts
import { app, extensions } from "@wix/astro/builders";

export default app()
  .use(
    extensions.event({
      id: "7739fb92-4087-4719-a000-48e306badfaa",
      source: "./backend/events/order-created/order-created.ts",
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

---

## Backend Event Extensions

React to Wix domain events server-side — order created/approved, cart updated, blog post published, etc. Common events live in the `wix-cli-backend-event` skill's `references/COMMON-EVENTS.md`.

### File pattern

```
src/backend/events/<name>/<name>.ts
```

### `export default` is mandatory

⛔ **The event listener call MUST be the default export.** A plain top-level invocation fails the build with:

```
[ERROR] [@wix/astro] Invalid export for event source at `./backend/events/...`.
Expected event listener call to be the default export.
```

`@wix/astro` reads `module.default` to register the webhook slug at build time and to invoke the handler at request time.

```typescript
// src/backend/events/order-created/order-created.ts
import { orders } from "@wix/ecom";

// ✅ default export — required
export default orders.onOrderCreated(async (event) => {
  const order = event.entity;
  console.log("Order created:", order._id);
});
```

```typescript
// ❌ Build will fail — no default export
import { orders } from "@wix/ecom";
orders.onOrderCreated(async (event) => { /* ... */ });
```

### Event payload shape

For domain events, the entity lives at `event.entity` (not `event.data.order` — that path is stale documentation in some skills). The shape is `{ entity: T; metadata: EventMetadata }`. Use TypeScript to autocomplete fields.

### Auth context: webhook ≠ member

Webhooks fire without member identity. To write to admin-only collections, elevate via `@wix/essentials`:

```typescript
import { items } from "@wix/data";
import { auth } from "@wix/essentials";

const insertOrderLog = auth.elevate(items.insert);

export default orders.onOrderCreated(async (event) => {
  await insertOrderLog("OrderLog", {
    orderId: event.entity._id,
    orderNumber: event.entity.number,
    total: event.entity.priceSummary?.total?.formattedAmount,
    buyerEmail: event.entity.buyerInfo?.email,
    orderCreatedDate: event.entity._createdDate,
  });
});
```

### Cloudflare runtime: no filesystem

Headless Astro deploys to Cloudflare Workers. **No `fs.appendFile`, no local files** — Workers have no persistent filesystem. Two real options:
1. `console.log` → visible via `wrangler tail` or Cloudflare dashboard → Workers → Logs.
2. Persist to a CMS collection via `@wix/data` (see above).

### `console.log` is NOT forwarded to Wix

There's no Wix-side trick that captures console output and ships it to a Wix logging API. `astro-monitor` middleware forwards **unhandled exceptions** (not logs) to `monitoring.captureException()` (which is a Sentry pipe), and that middleware explicitly skips `/_wix/extensions/*` routes. Webhook handlers are not auto-instrumented. If you want events surfaced beyond Workers logs, write them to a CMS collection or call `monitoring.captureMessage(...)` from `@wix/essentials`.

### Required permissions

Each event has a permission scope (e.g., "Read Orders" → `SCOPE.STORES.READ-ORDERS` for `orders.onOrderCreated`). Without it, the webhook never fires. Manual step: grant the scope in the Wix Dev Center Permissions page for this project.

---

## Dashboard Page Extensions

Custom admin pages rendered inside `manage.wix.com`. Use for: viewing/managing data the standard CMS can't model nicely, app-specific reports, multi-step admin workflows.

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

1. **`SidePanel`** — for inline add/edit forms that overlay the page. Position-fixed on the right.
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

## Building CMS-Style Admin UIs in Dashboard Pages

A common pattern: tabs of collections, table per tab, inline add/edit/delete. The pieces:

| Need | WDS component | Notes |
|---|---|---|
| Switch between collections | `Tabs` (in `Page.Tail`, `compactSide`) | Selected ID drives the active table |
| Tabular data | `Table` inside `Card` | Provide explicit `width` per column for strict TS |
| Row actions (Edit/Delete) | `TableActionCell` | `numOfVisibleSecondaryActions={2}` to surface both |
| Add/edit form | `SidePanel` (right-side fixed overlay) | NOT `<Modal />` |
| Image field | `ImageViewer` | Built-in Add/Update/Remove buttons + preview area |
| Reference (single) | `Dropdown` | Options from `items.query(<refCollection>).limit(200).find()` |
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

⛔ **Don't roll a custom image preview with `<Image>` + URL text + Change/Clear buttons.** WDS has `ImageViewer` — a dedicated image-field control with a proper preview area, built-in Add/Update/Remove icon buttons, loading state, and tooltips:

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
await items.insert("Missions", {
  title: "Andromeda Run",
  slug: "andromeda-run",
  planetRef: planet._id,  // single REFERENCE — inline is fine
});
```

### MULTI_REFERENCE — cannot be set via insert/update

⛔ **Multi-reference values cannot be written via `items.insert`, `items.update`, or `items.patch`.** They are silently dropped. Use the dedicated reference APIs:

```typescript
import { items } from "@wix/data";

// After a successful insert/update, sync the multi-ref list:
await items.replaceReferences(
  "CatExplorers",     // collection
  "crew",             // multi-ref field key
  explorerId,         // referring item _id
  [missionA, missionB] // referenced _id[] (empty array clears all)
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
