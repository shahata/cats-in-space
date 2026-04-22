import { useState, useEffect, useCallback } from "react";
import { currentCart } from "@wix/ecom";
import type { cart as cartTypes } from "@wix/ecom";
import { redirects } from "@wix/redirects";
import { getImageUrl } from "../utils/image";
import { i18n } from "@wix/essentials";
import { RESTAURANTS_APP_ID } from "../utils/appIds";

export default function CartSidebar() {
  const t = i18n.getTranslationFunction();
  const [open, setOpen] = useState(false);
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
    const openHandler = () => {
      setOpen(true);
      fetchCart();
    };
    window.addEventListener("cart-updated", handler);
    window.addEventListener("cart-open", openHandler);
    return () => {
      window.removeEventListener("cart-updated", handler);
      window.removeEventListener("cart-open", openHandler);
    };
  }, [fetchCart]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const updateQuantity = async (lineItemId: string, newQty: number) => {
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
  };

  const removeItem = async (lineItemId: string) => {
    setLoading(true);
    try {
      await currentCart.removeLineItemsFromCurrentCart([lineItemId]);
      await fetchCart();
      window.dispatchEvent(new Event("cart-updated"));
    } catch {}
    setLoading(false);
  };

  const editRestaurantLine = (lineId: string, catalogItemId: string) => {
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent("restaurant-edit-line", {
        detail: { lineId, catalogItemId },
      }),
    );
  };

  const checkout = async () => {
    setCheckingOut(true);
    try {
      const { checkoutId } = await currentCart.createCheckoutFromCurrentCart({
        channelType: currentCart.ChannelType.WEB,
      });
      const { redirectSession } = await redirects.createRedirectSession({
        ecomCheckout: { checkoutId: checkoutId! },
        callbacks: {
          thankYouPageUrl: window.location.origin + "/store/thank-you",
          postFlowUrl: window.location.origin + "/store",
        },
        preferences: { checkIfPublish: true },
      });
      if (redirectSession?.fullUrl) {
        window.location.href = redirectSession.fullUrl;
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : t("cart.checkoutFailed"));
      setCheckingOut(false);
    }
  };

  const lineItems = cart?.lineItems || [];
  const subtotal =
    totals?.priceSummary?.subtotal?.formattedAmount ||
    totals?.priceSummary?.subtotal?.amount;
  const total =
    totals?.priceSummary?.total?.formattedAmount ||
    totals?.priceSummary?.total?.amount;
  const discount = totals?.priceSummary?.discount?.formattedAmount;

  return (
    <>
      <button
        className="cs-badge"
        onClick={() => {
          setOpen(true);
          fetchCart();
        }}
        aria-label={t("cart.openCart")}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
        {itemCount > 0 && <span className="cs-count">{itemCount}</span>}
      </button>

      {open && <div className="cs-overlay" onClick={() => setOpen(false)} />}

      <div className={`cs-panel ${open ? "cs-panel-open" : ""}`}>
        <div className="cs-header">
          <h2 className="cs-title">{t("cart.yourCart")}</h2>
          <button className="cs-close" onClick={() => setOpen(false)}>
            &times;
          </button>
        </div>

        {lineItems.length === 0 ? (
          <div className="cs-empty">
            <p>{t("cart.empty")}</p>
            <a href="/store" onClick={() => setOpen(false)}>
              {t("cart.browseStore")}
            </a>
          </div>
        ) : (
          <>
            <div className="cs-items">
              {lineItems.map((li) => {
                const rawImg =
                  typeof li.image === "string"
                    ? li.image
                    : (li.image as { url?: string } | undefined)?.url;
                const img = getImageUrl(rawImg, 128, 128);
                const modifierGroups = (
                  (
                    li as {
                      modifierGroups?: Array<{
                        name?: { translated?: string; original?: string };
                        modifiers?: Array<{
                          quantity?: number;
                          label?: { translated?: string; original?: string };
                          price?: { formattedAmount?: string; amount?: string };
                        }>;
                      }>;
                    }
                  ).modifierGroups || []
                )
                  .map((g) => {
                    const groupName =
                      g.name?.translated || g.name?.original || "";
                    const rows = (g.modifiers || [])
                      .map((m) => {
                        const label =
                          m.label?.translated || m.label?.original || "";
                        if (!label) return null;
                        return {
                          qty: m.quantity ?? 1,
                          label,
                          price:
                            m.price?.formattedAmount || m.price?.amount || "",
                        };
                      })
                      .filter(
                        (
                          r,
                        ): r is { qty: number; label: string; price: string } =>
                          r !== null,
                      );
                    if (rows.length === 0) return null;
                    return { name: groupName, rows };
                  })
                  .filter(
                    (
                      g,
                    ): g is {
                      name: string;
                      rows: Array<{
                        qty: number;
                        label: string;
                        price: string;
                      }>;
                    } => g !== null,
                  );
                const descriptionTags = (li.descriptionLines || [])
                  .map((dl) => {
                    const name = dl.name?.translated || dl.name?.original || "";
                    const val =
                      dl.plainText?.translated ||
                      dl.plainText?.original ||
                      dl.colorInfo?.translated ||
                      dl.colorInfo?.original ||
                      "";
                    return { name, val };
                  })
                  .filter((tag) => tag.name || tag.val);

                const isRestaurantLine =
                  li.catalogReference?.appId === RESTAURANTS_APP_ID;
                const canEditInModal =
                  isRestaurantLine &&
                  typeof window !== "undefined" &&
                  window.location.pathname.includes("/restaurant/order");
                const clickHandler = canEditInModal
                  ? () =>
                      editRestaurantLine(
                        li._id!,
                        li.catalogReference!.catalogItemId!,
                      )
                  : undefined;

                return (
                  <div
                    key={li._id}
                    className={`cs-item ${canEditInModal ? "cs-item-clickable" : ""}`}
                    onClick={clickHandler}
                    role={clickHandler ? "button" : undefined}
                  >
                    <div className="cs-item-img">
                      {img ? (
                        <img
                          src={img}
                          alt={
                            li.productName?.translated ||
                            li.productName?.original
                          }
                        />
                      ) : (
                        <span className="cs-item-placeholder">&#128049;</span>
                      )}
                    </div>
                    <div className="cs-item-details">
                      <div className="cs-item-name">
                        {li.productName?.translated || li.productName?.original}
                      </div>
                      {modifierGroups.length > 0 && (
                        <div className="cs-item-mods">
                          {modifierGroups.map((g, gi) => (
                            <div key={gi} className="cs-mod-group">
                              {g.name && (
                                <div className="cs-mod-group-name">
                                  {g.name}:
                                </div>
                              )}
                              {g.rows.map((r, ri) => (
                                <div key={ri} className="cs-mod-row">
                                  {r.qty}x {r.label}
                                  {r.price && ` (${r.price})`}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                      {descriptionTags.length > 0 && (
                        <div className="cs-item-option-tags">
                          {descriptionTags.map((tag, i) => (
                            <span key={i} className="cs-item-option-tag">
                              {tag.name ? `${tag.name}: ${tag.val}` : tag.val}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="cs-item-price">
                        {li.price?.formattedAmount || li.price?.amount}
                      </div>
                      <div
                        className="cs-item-qty"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="cs-qty-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateQuantity(li._id!, (li.quantity ?? 1) - 1);
                          }}
                          disabled={loading || (li.quantity ?? 0) <= 1}
                        >
                          &minus;
                        </button>
                        <span className="cs-qty-val">{li.quantity}</span>
                        <button
                          className="cs-qty-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateQuantity(li._id!, (li.quantity ?? 0) + 1);
                          }}
                          disabled={loading}
                        >
                          +
                        </button>
                        <button
                          className="cs-remove"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeItem(li._id!);
                          }}
                          disabled={loading}
                          title={t("payment.remove")}
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
                  <span>{t("cart.subtotal")}</span>
                  <span>{subtotal}</span>
                </div>
              )}
              {discount && (
                <div className="cs-row cs-discount">
                  <span>{t("cart.discount")}</span>
                  <span>-{discount}</span>
                </div>
              )}
              {total && (
                <div className="cs-row cs-total">
                  <span>{t("cart.estimatedTotal")}</span>
                  <span>{total}</span>
                </div>
              )}
              <button
                className="cs-checkout-btn"
                onClick={checkout}
                disabled={checkingOut || loading}
              >
                {checkingOut ? t("cart.redirecting") : t("cart.checkout")}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
