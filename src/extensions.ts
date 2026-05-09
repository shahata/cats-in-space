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
      title: "Cats Content",
      routePath: "",
      component: "./dashboard/pages/content-page/content-page.tsx",
    }),
  );
