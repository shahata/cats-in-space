## CLI Commands

All CLI instructions can be found at:
node_modules/@wix/cli/agents/instructions.md

## Skills

This project comes with a set of skills that can be used when the user asks for help with specific tasks.
If you're using the instructions provided by a skill and fail, or if you do not find a relevant skill for the task,
you can try updating the skills by running the following command:

`wix skills update`

This will update the skills to the latest version.

## Setup Notes

- **Wix Astro headless app** — requires 4 env vars at boot: `WIX_CLIENT_ID`, `WIX_CLIENT_SECRET`, `WIX_CLIENT_PUBLIC_KEY`, `WIX_CLIENT_INSTANCE_ID`. All delivered via `/run/base44/app.env`.
- These values come from running `npx wix env pull` in the project (after `npx wix login`), or directly from Wix Dashboard → OAuth Apps.
- Dev server runs via `npx astro dev` (NOT `wix dev` — the Wix CLI wraps Astro but `astro dev` works fine with the env vars set directly).
- `astro.config.mjs` has `allowedHosts: true` in Vite config so the preview proxy hostname is accepted.
- The `wix_auth` Docker volume persists Wix CLI auth state (not needed when env vars are set directly).
- The backend event handler (`src/backend/events/order-approved/`) optionally uses `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` for notifications — not required to boot.
- To verify: `curl http://localhost:3000/` should return full HTML with `<title>` content.
