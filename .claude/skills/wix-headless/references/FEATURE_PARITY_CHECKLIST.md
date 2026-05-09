# Wix Headless Feature Richness Checklist

Use this guide before building or auditing a Wix Headless site from these references. It describes the level of UX, data rendering, and workflow coverage expected for each Wix integration.

The target is not to include every integration in every site. The target is richness for the integrations that were requested or enabled: if a site has Bookings, the booking experience should be complete; if it has CMS collections, the CMS pages should feel data-rich; if it has eCommerce, the cart and member order flows should be real.

## Core Principle

Do not build brochure pages around Wix data. Build API-backed product experiences.

For every requested or enabled Wix business feature:

1. Render the real entity fields returned by Wix, not a minimal title/description subset.
2. Include the full user flow: listing, detail, interactive action, hosted checkout or confirmation, thank-you page, and member-dashboard follow-up.
3. Respect the site's active locale for all dates, times, prices, labels, and routes.
4. Use the shared patterns: `getImageUrl()` for Wix media, `checkoutCallbacks()` for redirects, `cart-updated` for cart refresh, and `catalogReference.appId` for order classification.
5. Seed data that exercises every branch of the UI: options, variants, modifiers, status badges, empty states, premium content, closed campaigns, scheduled orders, recurring events, and missing images.

## Integration Map

Use only the rows that match the requested site. Do not add Blog, Store, Donations, Restaurants, Events, or any other business solution unless the user asked for it or the project already uses it.

| Feature area | Typical surfaces | Wix APIs used | Richness target | Primary docs |
|---|---|---|---|---|
| Global shell, navigation, language, cart | Layout, navigation, language switcher, optional cart sidebar | `@wix/essentials`, `@wix/site`, `@wix/ecom` | Sticky grouped nav, login/logout state, locale links, RTL, route-scoped cart sidebar, cart badge refresh on every cart mutation | [HOMEPAGE_LAYOUT.md](HOMEPAGE_LAYOUT.md), [TRANSLATIONS_STATIC.md](TRANSLATIONS_STATIC.md), [AUTHENTICATION.md](AUTHENTICATION.md) |
| Homepage / entry page | Brand hero plus sections that link into requested features | Wix APIs used by enabled features | Real data previews, metrics, and CTAs into the site's actual flows, not a generic marketing-only page | [HOMEPAGE_LAYOUT.md](HOMEPAGE_LAYOUT.md), [CMS_DATA_PAGES.md](CMS_DATA_PAGES.md) |
| CMS collections | Listing pages, detail pages, related-entity sections, optional admin UI | `@wix/data` | Cards with images, status/metadata, progress or score fields, detail pages, cross-links, references, conditional sections | [CMS_DATA_PAGES.md](CMS_DATA_PAGES.md), [EXTENSIONS.md](EXTENSIONS.md) |
| Blog | Listing, post detail, engagement component, premium-content resolver when plans exist | `@wix/blog`, `@wix/comments`, `@wix/members`, `@wix/essentials` | Posts with tags, writers, rich content, SEO, metrics, views, likes, comments/replies, edit/delete own comments, optional premium previews and paywall | [BLOG_POSTS.md](BLOG_POSTS.md), [BLOG_ENGAGEMENT.md](BLOG_ENGAGEMENT.md), [PRICING_PLANS.md](PRICING_PLANS.md) |
| Bookings | Services list, service detail, booking flow, member bookings tab | `@wix/bookings`, `@wix/redirects`, `@wix/members` | Service cards, staff/category display, date picker, real availability, staff filtering, hosted booking checkout, thank-you redirect, member bookings with cancel/reschedule | [BOOKINGS.md](BOOKINGS.md), [MEMBER_AREA.md](MEMBER_AREA.md) |
| Store | Product listing, product detail, cart, checkout, thank-you, member orders | `@wix/stores`, `@wix/categories`, `@wix/ecom`, `@wix/redirects`, `@wix/seo` | Category filtering, product badges, gallery, options, variants, modifiers, info accordion, add-to-cart, buy-now, back-in-stock, cart editing, checkout, order confirmation | [ECOMMERCE.md](ECOMMERCE.md), [ECOMMERCE_V3.md](ECOMMERCE_V3.md), [PRODUCT_SEEDING.md](PRODUCT_SEEDING.md) |
| Gift cards | Conditional gift-card purchase surface inside a store experience | `@wix/gift-vouchers`, `@wix/ecom`, `@wix/redirects` | Self-hiding entry point, preset and custom amounts, variant images, recipient form, Add to Cart, Buy Now, cart/sidebar refresh, order badging | [GIFT_CARDS.md](GIFT_CARDS.md), [ECOMMERCE.md](ECOMMERCE.md) |
| Pricing plans | Plans listing, hosted plan checkout, thank-you, subscriptions tab | `@wix/pricing-plans`, `@wix/redirects` | Plan cards with perks/trials/price periods, one redirect flow for free and paid plans, thank-you page, subscriptions tab with cancellation | [PRICING_PLANS.md](PRICING_PLANS.md), [MEMBER_AREA.md](MEMBER_AREA.md) |
| Donations | Campaign listing, donation form, checkout redirect, thank-you, member order badge | `@wix/donations`, `@wix/ecom`, `@wix/redirects` | Campaign cards with cover image, progress, donor count, preset/custom amount, frequency, donor-fee opt-in, donor note, checkout redirect, order badging | [DONATIONS.md](DONATIONS.md), [MEMBER_AREA.md](MEMBER_AREA.md) |
| Events | Event listing, event detail, ticket picker, thank-you, member tickets tab | `@wix/events`, `@wix/redirects` | Recurring-series grouping, stable detail routes, occurrence selector, ticket quantities by tier, hosted ticket checkout, thank-you ticket/calendar actions, member tickets tab | [EVENTS.md](EVENTS.md), [MEMBER_AREA.md](MEMBER_AREA.md) |
| Restaurant menu, ordering, reservations | Browseable menu, online ordering flow, table reservation wizard | `@wix/restaurants`, `@wix/table-reservations`, `@wix/business-tools`, `@wix/ecom`, `@wix/redirects` | Online-orderable menu filtering, item labels/icons, modifier modal, price variants, cart-backed quantities, pickup/delivery dispatch, scheduling popover, locale-aware reservations | [RESTAURANTS.md](RESTAURANTS.md), [HOMEPAGE_LAYOUT.md](HOMEPAGE_LAYOUT.md) |
| Member dashboard | Protected member area, public profile, feature-specific tabs | `@wix/members`, `@wix/ecom`, `@wix/pricing-plans`, `@wix/bookings`, `@wix/events`, `@wix/payments`, `@wix/media` | Editable profile, personal info, orders, bookings, tickets, subscriptions, payment methods, account/email/password for enabled features | [MEMBER_AREA.md](MEMBER_AREA.md), [AUTHENTICATION.md](AUTHENTICATION.md) |
| Backend and dashboard extensions | Backend event handlers, dashboard pages, dashboard modals | `@wix/astro/builders`, `@wix/data`, `@wix/dashboard`, WDS | Durable event handling and admin-only backoffice tools: reports, approval queues, fulfillment workflows, settings, content management, media picker, side panel forms, tables, toasts | [EXTENSIONS.md](EXTENSIONS.md), [CMS_DATA_PAGES.md](CMS_DATA_PAGES.md) |

## Cross-Feature UX Requirements

- **Every checkout flow has a proper landing page.** Store, restaurant, donations, events, and pricing plans each get a dedicated thank-you page. Do not redirect users to a member tab as the primary post-checkout experience.
- **Every eCom-backed purchase appears in the member dashboard.** Store products, gift cards, donations, restaurant orders, pricing-plan checkout lines, and other eCom lines all flow through `ecomOrders.searchOrders`. Classify them by `catalogReference.appId`.
- **Events tickets are separate from eCom orders.** Wix Events stores orders in `@wix/events`; render a Tickets tab with PDF download and calendar actions.
- **All cart-bearing surfaces share the cart contract.** Product, gift-card, and restaurant components call Wix cart APIs immediately, then dispatch `window.dispatchEvent(new CustomEvent("cart-updated"))`.
- **Buy Now does not replace Add to Cart.** If regular products have both, gift cards should too. Buy Now can add the item then create checkout; Add to Cart should stop at the cart and show feedback.
- **Locale is explicit in React.** Do not call `toLocaleDateString(undefined, ...)`, `toLocaleTimeString(undefined, ...)`, or `Intl.NumberFormat(undefined, ...)`. Import `i18n` and pass `i18n.getLocale()`.
- **Server data is flattened before React islands.** Astro pages should query Wix APIs, resolve images, build maps, and pass minimal DTOs. React islands should own interaction, not expensive reference joining.
- **Empty and disabled states are first-class.** App not installed, no products, no campaign goal, no ticket availability, no reservation slots, closed restaurant hours, and logged-out member states should render intentionally.

## Pages Must Be Feature-Complete

### Listing Pages

Every listing page should include:

- Real Wix media resolved through the media helper.
- Filter controls if the API has categories, tags, or statuses.
- Key metadata, not only title/description.
- Status, availability, price, or progress indicators where the API provides them.
- Locale-aware links via `getRelativeLocaleUrl()`.
- A meaningful empty state.

### Detail Pages

Every detail page should include:

- Full entity content and media gallery when available.
- Related data fetched from references or adjacent APIs.
- A primary user action that completes the business flow.
- SEO tags for APIs that support them.
- Conditional sections rather than empty headings.

### Interactive Components

Every interactive component should include:

- Loading, disabled, success, and error states.
- Client-side validation matching the Wix API contract.
- Locale-aware formatting for dates, times, numbers, and currency.
- A clear split between Add to Cart and immediate checkout when both are useful.
- A refresh event or callback so global UI updates after mutation.

### Member Follow-Up

After a visitor acts, make sure the member area can show or manage the result:

- Store, gift-card, restaurant, donation, or plan purchase -> Orders tab with type badges.
- Pricing plan subscription -> Subscriptions tab with cancellation action.
- Booking -> Bookings tab with cancel/reschedule actions.
- Event ticket -> Tickets tab with PDF and calendar actions.
- Profile/account changes -> Profile, Personal Info, Payment, and Account tabs.

## Seeding Coverage Standard

Seed scripts must create data that proves the UI is real:

- Store: variants, text options, swatches, modifiers, ribbons, sale price, preorder, out-of-stock, info sections, multi-image gallery.
- Gift cards: at least three presets, variant images, optional custom amount, recipient/greeting copy.
- Blog: tags, rich content, cover images, premium preview, comments enabled.
- Bookings: multiple services, staff, categories, real availability windows, online and in-person payment settings as appropriate.
- Plans: free, recurring paid, single-payment, perks, free trial, primary plan.
- Donations: campaign with goal/progress, no-goal campaign, frequency options, donor fee, comments.
- Events: recurring series, multiple ticket tiers, at least one manual category, thank-you data.
- Restaurants: labels, price variants, required and optional modifier groups, paid modifiers, future scheduling, pickup/delivery.
- CMS: references and multi-references, status fields, ranking/progress fields, missing-image fallback.

If a generated site only looks good with demo records that avoid these branches, the docs were not followed completely.
