import { useState, useEffect, useCallback } from "react";
import { currentCart } from "@wix/ecom";
import type { cart as cartTypes } from "@wix/ecom";
import { redirects } from "@wix/redirects";
import { getImageUrl } from "../utils/image";

export default function CartSidebar() {
  const [open, setOpen] = useState(false);
  const [cart, setCart] = useState<cartTypes.Cart | null>(null);
  const [totals, setTotals] = useState<cartTypes.EstimateTotalsResponse | null>(null);
  const [itemCount, setItemCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const fetchCart = useCallback(async () => {
    try {
      const c = await currentCart.getCurrentCart();
      setCart(c);
      const count = (c?.lineItems || []).reduce(
        (sum, li) => sum + (li.quantity || 0),
        0
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

  const updateQuantity = async (lineItemId: string, newQty: number) => {
    if (newQty < 1) return;
    setLoading(true);
    try {
      await currentCart.updateCurrentCartLineItemQuantity([
        { _id: lineItemId, quantity: newQty },
      ]);
      await fetchCart();
    } catch {}
    setLoading(false);
  };

  const removeItem = async (lineItemId: string) => {
    setLoading(true);
    try {
      await currentCart.removeLineItemsFromCurrentCart([lineItemId]);
      await fetchCart();
    } catch {}
    setLoading(false);
  };

  const checkout = async () => {
    setCheckingOut(true);
    try {
      const { checkoutId } = await currentCart.createCheckoutFromCurrentCart({
        channelType: "WEB",
      });
      const { redirectSession } = await redirects.createRedirectSession({
        ecomCheckout: { checkoutId: checkoutId! },
        callbacks: {
          thankYouPageUrl: window.location.origin + "/store/thank-you",
          postFlowUrl: window.location.origin + "/store",
        },
      });
      if (redirectSession?.fullUrl) {
        window.location.href = redirectSession.fullUrl;
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Checkout failed");
      setCheckingOut(false);
    }
  };

  const lineItems = cart?.lineItems || [];
  const subtotal = totals?.priceSummary?.subtotal?.formattedAmount
    || totals?.priceSummary?.subtotal?.amount;
  const total = totals?.priceSummary?.total?.formattedAmount
    || totals?.priceSummary?.total?.amount;
  const discount = totals?.priceSummary?.discount?.formattedAmount;

  return (
    <>
      <button
        className="cs-badge"
        onClick={() => { setOpen(true); fetchCart(); }}
        aria-label="Open cart"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
        {itemCount > 0 && <span className="cs-count">{itemCount}</span>}
      </button>

      {open && <div className="cs-overlay" onClick={() => setOpen(false)} />}

      <div className={`cs-panel ${open ? "cs-panel-open" : ""}`}>
        <div className="cs-header">
          <h2 className="cs-title">Your Cart</h2>
          <button className="cs-close" onClick={() => setOpen(false)}>&times;</button>
        </div>

        {lineItems.length === 0 ? (
          <div className="cs-empty">
            <p>Your cart is empty</p>
            <a href="/store" onClick={() => setOpen(false)}>Browse Store</a>
          </div>
        ) : (
          <>
            <div className="cs-items">
              {lineItems.map((li) => {
                const rawImg = typeof li.image === 'string' ? li.image : (li.image as { url?: string } | undefined)?.url;
                const img = getImageUrl(rawImg, 128, 128);
                const optionText = li.descriptionLines
                  ?.map((dl) => {
                    const name = dl.name?.translated || dl.name?.original || '';
                    const val = dl.plainText?.translated || dl.plainText?.original
                      || dl.colorInfo?.translated || dl.colorInfo?.original || '';
                    return name ? `${name}: ${val}` : val;
                  })
                  .filter(Boolean)
                  .join(", ");

                return (
                  <div key={li._id} className="cs-item">
                    <div className="cs-item-img">
                      {img ? (
                        <img src={img} alt={li.productName?.translated || li.productName?.original} />
                      ) : (
                        <span className="cs-item-placeholder">&#128049;</span>
                      )}
                    </div>
                    <div className="cs-item-details">
                      <div className="cs-item-name">{li.productName?.translated || li.productName?.original}</div>
                      {optionText && <div className="cs-item-options">{optionText}</div>}
                      <div className="cs-item-price">
                        {li.price?.formattedAmount || li.price?.amount}
                      </div>
                      <div className="cs-item-qty">
                        <button
                          className="cs-qty-btn"
                          onClick={() => updateQuantity(li._id!, (li.quantity ?? 1) - 1)}
                          disabled={loading || (li.quantity ?? 0) <= 1}
                        >
                          &minus;
                        </button>
                        <span className="cs-qty-val">{li.quantity}</span>
                        <button
                          className="cs-qty-btn"
                          onClick={() => updateQuantity(li._id!, (li.quantity ?? 0) + 1)}
                          disabled={loading}
                        >
                          +
                        </button>
                        <button
                          className="cs-remove"
                          onClick={() => removeItem(li._id!)}
                          disabled={loading}
                          title="Remove"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="cs-footer">
              {subtotal && (
                <div className="cs-row">
                  <span>Subtotal</span>
                  <span>{subtotal}</span>
                </div>
              )}
              {discount && (
                <div className="cs-row cs-discount">
                  <span>Discount</span>
                  <span>-{discount}</span>
                </div>
              )}
              {total && (
                <div className="cs-row cs-total">
                  <span>Estimated Total</span>
                  <span>{total}</span>
                </div>
              )}
              <button
                className="cs-checkout-btn"
                onClick={checkout}
                disabled={checkingOut || loading}
              >
                {checkingOut ? "Redirecting..." : "Checkout"}
              </button>
            </div>
          </>
        )}
      </div>

    </>
  );
}
