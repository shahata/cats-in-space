import { useState, useEffect, useCallback } from "react";
import { currentCart } from "@wix/ecom";
import { redirects } from "@wix/redirects";

export default function CartSidebar() {
  const [open, setOpen] = useState(false);
  const [cart, setCart] = useState<any>(null);
  const [totals, setTotals] = useState<any>(null);
  const [itemCount, setItemCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const fetchCart = useCallback(async () => {
    try {
      const c = await currentCart.getCurrentCart();
      setCart(c);
      const count = (c?.lineItems || []).reduce(
        (sum: number, li: any) => sum + (li.quantity || 0),
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
        ecomCheckout: { checkoutId },
        callbacks: {
          postFlowUrl: window.location.origin + "/store?success=true",
        },
      });
      if (redirectSession?.fullUrl) {
        window.location.href = redirectSession.fullUrl;
      }
    } catch (e: any) {
      alert(e?.message || "Checkout failed");
      setCheckingOut(false);
    }
  };

  const lineItems = cart?.lineItems || [];
  const subtotal = totals?.estimatedTotals?.priceSummary?.subtotal?.formattedAmount
    || totals?.estimatedTotals?.priceSummary?.subtotal?.amount;
  const total = totals?.estimatedTotals?.priceSummary?.total?.formattedAmount
    || totals?.estimatedTotals?.priceSummary?.total?.amount;
  const discount = totals?.estimatedTotals?.priceSummary?.discount?.formattedAmount;

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
              {lineItems.map((li: any) => {
                const img = li.image?.url || li.media?.url;
                const optionText = li.descriptionLines
                  ?.map((dl: any) => {
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
                          onClick={() => updateQuantity(li._id, li.quantity - 1)}
                          disabled={loading || li.quantity <= 1}
                        >
                          &minus;
                        </button>
                        <span className="cs-qty-val">{li.quantity}</span>
                        <button
                          className="cs-qty-btn"
                          onClick={() => updateQuantity(li._id, li.quantity + 1)}
                          disabled={loading}
                        >
                          +
                        </button>
                        <button
                          className="cs-remove"
                          onClick={() => removeItem(li._id)}
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

      <style>{`
        .cs-badge { position: fixed; bottom: 24px; right: 24px; z-index: 90; width: 56px; height: 56px; border-radius: 50%; background: #ff6600; color: #000; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 16px rgba(255, 102, 0, 0.4); transition: transform 0.2s; }
        .cs-badge:hover { transform: scale(1.05); }
        .cs-count { position: absolute; top: -4px; right: -4px; background: #ffcc00; color: #000; font-size: 0.7rem; font-weight: 800; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
        .cs-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 99; }
        .cs-panel { position: fixed; top: 0; right: -420px; width: 400px; max-width: 90vw; height: 100vh; background: #0f0f0f; border-left: 1px solid #222; z-index: 100; display: flex; flex-direction: column; transition: right 0.3s ease; }
        .cs-panel-open { right: 0; }
        .cs-header { display: flex; align-items: center; justify-content: space-between; padding: 20px; border-bottom: 1px solid #222; }
        .cs-title { font-family: 'Bangers', cursive; font-size: 1.3rem; color: #ff6600; letter-spacing: 2px; }
        .cs-close { background: none; border: none; color: #888; font-size: 1.8rem; cursor: pointer; padding: 0; line-height: 1; }
        .cs-close:hover { color: #ff6600; }
        .cs-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #888; }
        .cs-empty a { color: #ff6600; font-family: 'Bangers', cursive; letter-spacing: 1px; text-decoration: none; }
        .cs-items { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }
        .cs-item { display: flex; gap: 12px; padding-bottom: 16px; border-bottom: 1px solid #1a1a1a; }
        .cs-item-img { width: 64px; height: 64px; border-radius: 8px; overflow: hidden; background: #1a1a2e; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
        .cs-item-img img { width: 100%; height: 100%; object-fit: cover; }
        .cs-item-placeholder { font-size: 2rem; }
        .cs-item-details { flex: 1; min-width: 0; }
        .cs-item-name { font-family: 'Bangers', cursive; font-size: 0.9rem; color: #e0e0e0; letter-spacing: 0.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cs-item-options { font-size: 0.75rem; color: #666; margin-top: 2px; }
        .cs-item-price { font-size: 0.85rem; color: #ffcc00; font-weight: 700; margin-top: 4px; }
        .cs-item-qty { display: flex; align-items: center; gap: 0; margin-top: 6px; }
        .cs-qty-btn { width: 26px; height: 26px; background: #1a1a1a; border: 1px solid #333; color: #aaa; font-size: 0.9rem; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .cs-qty-btn:first-child { border-radius: 4px 0 0 4px; }
        .cs-qty-btn:hover:not(:disabled) { background: #222; color: #ff6600; }
        .cs-qty-btn:disabled { opacity: 0.3; cursor: default; }
        .cs-qty-val { width: 32px; height: 26px; line-height: 26px; text-align: center; font-size: 0.8rem; font-weight: 700; color: #e0e0e0; background: #141414; border-top: 1px solid #333; border-bottom: 1px solid #333; }
        .cs-remove { margin-left: 8px; width: 26px; height: 26px; background: none; border: 1px solid #333; border-radius: 4px; color: #666; font-size: 1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .cs-remove:hover:not(:disabled) { color: #f44336; border-color: #f44336; }
        .cs-footer { padding: 16px 20px; border-top: 1px solid #222; }
        .cs-row { display: flex; justify-content: space-between; font-size: 0.85rem; color: #aaa; margin-bottom: 6px; }
        .cs-discount { color: #4caf50; }
        .cs-total { font-size: 1rem; font-weight: 700; color: #e0e0e0; margin-bottom: 16px; padding-top: 8px; border-top: 1px solid #222; }
        .cs-checkout-btn { width: 100%; padding: 14px; background: #ffcc00; color: #000; border: none; border-radius: 8px; font-family: 'Bangers', cursive; font-size: 1.1rem; letter-spacing: 2px; cursor: pointer; transition: background 0.2s; }
        .cs-checkout-btn:hover:not(:disabled) { background: #ffd633; }
        .cs-checkout-btn:disabled { opacity: 0.5; cursor: default; }
      `}</style>
    </>
  );
}
