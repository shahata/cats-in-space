# Deployment

## The 3-Step Deploy Sequence

All three steps are mandatory, in this order. Do not skip step 1 or 2.

```bash
# Step 1: Type check
npx astro check

# Step 2: Build
npm run build

# Step 3: Deploy
npm run preview   # or: npm run release
```

### Why all 3 steps matter

`npm run build` uses Vite which does **not** do strict type checking — it bundles `any`-typed code without complaint. `npx astro check` is the only tool that catches type errors in `.astro` files.

Skipping step 1 has repeatedly led to deploying broken code — for example, accessing `cat._id` when the REST API returns `cat.id`, or passing wrong argument shapes to SDK methods. These errors are invisible to Vite but crash at runtime.

Install `@astrojs/check` if not present.

⛔ Use `npx astro check`, **not** `tsc --noEmit`. `tsc` does not check `.astro` files at all.

## What `astro check` Catches

- Wrong field names from REST responses vs SDK responses (e.g., `.id` vs `._id`)
- Wrong method signatures (e.g., `searchOrders` takes `OrderSearch` directly, not `{ search: OrderSearch }`)
- Wrong return shapes (e.g., `createCheckoutFromCurrentCart` returns `{ checkoutId }`, not `{ _id }`)
- Missing properties on types
- Type mismatches in Astro template expressions
