import { useCallback, useEffect, useState } from "react";
import { currentCart } from "@wix/ecom";
import type { cart as cartTypes } from "@wix/ecom";
import { redirects } from "@wix/redirects";
import { i18n } from "@wix/essentials";
import type { CheckoutCallbacks } from "./redirects";

export function useCart() {
  const t = i18n.getTranslationFunction();
  const [cart, setCart] = useState<cartTypes.Cart | null>(null);
  const [totals, setTotals] = useState<cartTypes.EstimateTotalsResponse | null>(
    null,
  );
  const [itemCount, setItemCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const fetchCart = useCallback(async () => {
    try {
      const c = await currentCart.getCurrentCart();
      setCart(c);
      const count = (c?.lineItems || []).reduce(
        (sum, li) => sum + (li.quantity || 0),
        0,
      );
      setItemCount(count);

      if (c?.lineItems?.length) {
        try {
          const est = await currentCart.estimateCurrentCartTotals({});
          setTotals(est);
        } catch {
          setTotals(null);
        }
      } else {
        setTotals(null);
      }
    } catch {
      setCart(null);
      setItemCount(0);
      setTotals(null);
    }
  }, []);

  useEffect(() => {
    fetchCart();
    const handler = () => fetchCart();
    window.addEventListener("cart-updated", handler);
    return () => window.removeEventListener("cart-updated", handler);
  }, [fetchCart]);

  const updateQuantity = useCallback(
    async (lineItemId: string, newQty: number) => {
      if (newQty < 1) return;
      setLoading(true);
      try {
        await currentCart.updateCurrentCartLineItemQuantity([
          { _id: lineItemId, quantity: newQty },
        ]);
        await fetchCart();
        window.dispatchEvent(new Event("cart-updated"));
      } catch {}
      setLoading(false);
    },
    [fetchCart],
  );

  const removeItem = useCallback(
    async (lineItemId: string) => {
      setLoading(true);
      try {
        await currentCart.removeLineItemsFromCurrentCart([lineItemId]);
        await fetchCart();
        window.dispatchEvent(new Event("cart-updated"));
      } catch {}
      setLoading(false);
    },
    [fetchCart],
  );

  const checkout = useCallback(async (callbacks: CheckoutCallbacks) => {
    setCheckingOut(true);
    try {
      const { checkoutId } = await currentCart.createCheckoutFromCurrentCart({
        channelType: currentCart.ChannelType.WEB,
      });
      const { redirectSession } = await redirects.createRedirectSession({
        ecomCheckout: { checkoutId: checkoutId! },
        callbacks,
        preferences: { checkIfPublish: true },
      });
      if (redirectSession?.fullUrl) {
        window.location.href = redirectSession.fullUrl;
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : t("cart.checkoutFailed"));
      setCheckingOut(false);
    }
  }, [t]);

  return {
    cart,
    totals,
    itemCount,
    loading,
    checkingOut,
    fetchCart,
    updateQuantity,
    removeItem,
    checkout,
  };
}
