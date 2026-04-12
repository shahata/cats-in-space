# Deployment

## The 4-Step Deploy Sequence

All four steps are mandatory, in this order. Do not skip any.

```bash
# Step 1: Type check + lint (catches type errors AND explicit `any` usage)
npm run check

# Step 2: Build
npm run build

# Step 3: Commit
git add <files> && git commit -m "description of changes"

# Step 4: Deploy
npm run preview   # or: npm run release
```

### Why all steps matter

`npm run build` uses Vite which does **not** do strict type checking — it bundles `any`-typed code without complaint.

`npm run check` runs two tools:
1. `npx astro check` — catches type errors in `.astro` files (wrong field names, wrong method signatures, missing properties)
2. `eslint src/` — catches explicit `any` usage via the `@typescript-eslint/no-explicit-any` rule

⛔ **Never use `any` to silence type errors.** When `astro check` reports a type error, fix the code to match the SDK types — don't cast to `any`, `any[]`, or `as any`. A type error is a bug report: the code is accessing a field that doesn't exist, which will crash at runtime. See [SETUP.md](SETUP.md) → "Post-Scaffold: Set Up ESLint no-explicit-any Rule" for the ESLint configuration.

Skipping step 1 has repeatedly led to deploying broken code — for example, accessing `cat._id` when the REST API returns `cat.id`, or using V1 field paths on a V3 catalog. These errors are invisible to Vite but crash at runtime.

Install `@astrojs/check` if not present.

⛔ Use `npx astro check`, **not** `tsc --noEmit`. `tsc` does not check `.astro` files at all.

## What `astro check` Catches

- Wrong field names from REST responses vs SDK responses (e.g., `.id` vs `._id`)
- Wrong method signatures (e.g., `searchOrders` takes `OrderSearch` directly, not `{ search: OrderSearch }`)
- Wrong return shapes (e.g., `createCheckoutFromCurrentCart` returns `{ checkoutId }`, not `{ _id }`)
- Missing properties on types
- Type mismatches in Astro template expressions

## What `npm run check` Does NOT Catch

⚠️ **Rendering SDK objects in Astro templates.** Astro allows `{expr}` where `expr` is any value — including objects. It silently calls `.toString()` producing `[object Object]`. Neither `astro check`, `tsc`, nor ESLint flags this. React JSX would reject objects as children, but Astro does not.

**You must manually ensure** that every `{expr}` in Astro templates resolves to a string or number — never an SDK object. Always access the primitive field: `{product.ribbon.name}` not `{product.ribbon}`, `{price.amount}` not `{price}`. See [SDK_CORE.md](SDK_CORE.md) → "Never render SDK objects directly in Astro templates" for the full list of common object fields.
