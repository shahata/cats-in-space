# Project Setup & Scaffolding

## Scaffolding a New Project

Before scaffolding, list the working directory to check for existing folders and pick a `--project-name` that doesn't conflict.

**Non-interactive (preferred):**
```bash
npm create @wix/new@latest headless -- \
  --business-name "My Business" \
  --project-name myfolder \
  --site-template-id 212b41cb-0da6-4401-9c72-7c579e6477a2
```

| Flag | Description |
|------|-------------|
| `--business-name` | Name shown in your Wix sites list |
| `--project-name` | Local directory name (3-20 chars, lowercase letters and numbers only — rename after creation if needed) |
| `--site-template-id` | Template UUID |

**Interactive:**
```bash
npm create @wix/new@latest headless
```

The scaffold creates an **Astro** project with Wix integrations pre-configured.

## Post-Scaffold: Upgrade @wix/essentials

⛔ **Breaks at runtime** — The scaffold ships `@wix/essentials` ~0.1.x which does NOT have `i18n.getTranslationFunction()`. This causes a runtime `TypeError` that build does NOT catch.

```bash
npm install @wix/essentials@latest
npm install --save-dev @types/node
```

You must upgrade to >= 1.0.6 before using translations. Install `@types/node` because the scaffold's `astro.config.mjs` uses `process.env.NODE_ENV` — without it, `npx astro check` reports a type error.

## Post-Scaffold: Set Up ESLint no-explicit-any Rule

⛔ **Do this immediately after scaffolding every new project.** This prevents using `any` types anywhere in the codebase, which is the #1 source of silent runtime bugs when using Wix SDK types.

**Install:**
```bash
npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-astro
```

**Create `eslint.config.mjs`:**
```js
import eslintPluginAstro from 'eslint-plugin-astro';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  ...eslintPluginAstro.configs.recommended.map(config => ({
    ...config,
    ...(config.files?.[0]?.includes('astro') ? {
      plugins: {
        ...config.plugins,
        '@typescript-eslint': tseslint,
      },
      rules: {
        ...config.rules,
        '@typescript-eslint/no-explicit-any': 'error',
      },
    } : {}),
  })),
];
```

**Add scripts to `package.json`:**
```json
{
  "scripts": {
    "lint": "eslint src/",
    "check": "npx astro check && eslint src/"
  }
}
```

Now `npm run check` is the single command that catches both type errors AND explicit `any` usage.

## Key Files

| File | Purpose |
|------|---------|
| `wix.config.json` | Contains `appId` and `siteId` — links local project to Wix |
| `astro.config.mjs` | Astro config with `wix()`, `wixPages()`, `react()` integrations |
| `.env.local` | Client ID, secret, public key, cloud provider setting |
| `.wix/topology.json` | Production URLs |

## CLI Commands

```bash
npm run dev        # wix dev — local dev server with hot reload
npm run build      # wix build — production build
npm run preview    # wix preview — deploy a preview (unique URL each time)
npm run release    # wix release — deploy to production
npm run generate   # wix generate — code generation
```

## SDK Packages

Install only what you need:

```bash
npm install @wix/data        # CMS data operations
npm install @wix/members     # Members API
npm install @wix/stores      # Stores API (products, NOT categories)
npm install @wix/categories  # Categories API (for store categories)
npm install @wix/blog        # Blog API
npm install @wix/comments    # Comments API
npm install @wix/ecom        # Cart, checkout, orders
npm install @wix/redirects   # Redirect sessions (checkout, plans)
```

## Translations Setup

Enable in `astro.config.mjs`:
```js
wix({ essentials: true, translations: true })
```

Without these flags, `i18n.getTranslationFunction()` throws `"Host translation resources are not available"` at runtime.

**Required files** (build fails without all three when `translations: true`):
1. `src/translations.json` — flat key-value pairs
2. `.wix/multilingual/metadata.json` — must contain `{"primaryLanguageCode": "en"}`
3. `.wix/multilingual/translations/` — directory must exist (can be empty for single-language)

**Git**: The scaffold gitignores `.wix/` entirely. Add `!.wix/multilingual/` to `.gitignore` so metadata and translations are committed.
