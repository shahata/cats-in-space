/**
 * Build the full `callbacks` object for `redirects.createRedirectSession`.
 *
 * `thankYouPageUrl` and `postFlowUrl` are context-specific (which flow we're
 * coming back from) and are passed in. The rest of the callbacks point at
 * globally-stable custom pages on this site — we always include them so Wix
 * can pick whichever it needs for the flow, and we don't have to second-guess.
 */
export function checkoutCallbacks(opts: {
  thankYouPagePath: string;
  postFlowPath: string;
}) {
  const origin = window.location.origin;
  return {
    thankYouPageUrl: origin + opts.thankYouPagePath,
    postFlowUrl: origin + opts.postFlowPath,
    cartPageUrl: origin + "/store/cart",
    bookingsServiceListUrl: origin + "/bookings",
    planListUrl: origin + "/plans",
  };
}

export type CheckoutCallbacks = ReturnType<typeof checkoutCallbacks>;
