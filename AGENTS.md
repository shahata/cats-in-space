## CLI Commands

All CLI instructions can be found in:
node_modules/@wix/cli/agents/instructions.md

## Skills

This project comes with a set of skills that can be used when the user asks for help with specific tasks.
If you're using the instructions provided by a skill and fail, or if you do not find a relevant skill for the task,
you can try updating the skills by running the following command:

`wix skills update`

This will update the skills to the latest version.

## Base44 Dev Environment

This is a Wix Astro headless project. The dev server runs via `astro dev` (not `wix dev`) because the Wix CLI's
`wix dev` command hangs at "Preparing your dashboard..." when communicating with the Wix Dev Center in a
non-interactive container environment.

### Setup (one-time, already done)

1. **Wix CLI auth** — persisted in the `wix_auth` Docker volume at `/root/.wix`. To re-authenticate:
   - Run `wix login --api-key <key>` (API key from https://manage.wix.com/account/api-keys)
   - Or run `wix login` with `CODEX_SANDBOX=1` env var for non-interactive device-code flow
2. **Env vars** — `.env.local` is populated by `wix env pull` (requires auth). Contains:
   - `WIX_CLIENT_ID`, `WIX_CLIENT_INSTANCE_ID`, `WIX_CLIENT_PUBLIC_KEY`, `WIX_CLIENT_SECRET`
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (optional, for order-approved notifications)
   - `.env.local` is gitignored — it does NOT travel with the repo

### Running the app

```bash
docker compose -f docker-compose.base44.yml up -d
```

- Uses `node:22` base image with source bind-mounted at `/app`
- `node_modules` and `wix_auth` are in named volumes (persist across restarts)
- Dev server: `astro dev --port 3000 --host 0.0.0.0`
- Preview reachable on host port 3000

### Host check bypass

Astro's CLI config resolver overrides `vite.server.allowedHosts` to `[]` even when the astro.config.mjs
sets it to `true`. A Vite plugin (`base44-allow-all-hosts`) uses `configResolved` to force
`config.server.allowedHosts = true` after all overrides. This is required for the preview proxy hostname.

### Quirks

- `wix dev` does NOT work in the container (hangs at "Preparing your dashboard...") — use `astro dev` directly
- The `@wix/astro` integration requires `WIX_CLIENT_ID` at startup, loaded from `.env.local`
- Without `.env.local`, the app fails immediately with "Missing environment variable WIX_CLIENT_ID"
