// @ts-check
import { defineConfig } from "astro/config";
import wix from "@wix/astro";
import wixPages from "@wix/astro-pages";

import react from "@astrojs/react";
import cloudProviderFetchAdapter from "@wix/cloud-provider-fetch-adapter";
const isBuild = process.env.NODE_ENV == "production";

// https://astro.build/config
export default defineConfig({
  integrations: [
    wix({ essentials: true, translations: true }),
    wixPages(),
    react(),
  ],
  ...(isBuild && { adapter: cloudProviderFetchAdapter({}) }),

  image: {
    domains: ["static.wixstatic.com", "lh3.googleusercontent.com"],
  },

  vite: {
    server: {
      host: true,
      allowedHosts: true,
    },
    plugins: [
      {
        name: "base44-allow-all-hosts",
        configResolved(config) {
          config.server.allowedHosts = true;
        },
      },
    ],
  },

  security: {
    checkOrigin: false,
  },

  output: "server",
});
