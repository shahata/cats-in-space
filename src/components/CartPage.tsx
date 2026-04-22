import { getImageUrl } from "../utils/image";
import { i18n } from "@wix/essentials";
import { useCart } from "../utils/useCart";
import { checkoutCallbacks } from "../utils/redirects";

export default function CartPage() {
  const t = i18n.getTranslationFunction();
  const {
    cart,
    totals,
    loading,
    checkingOut,
    updateQuantity,
    removeItem,
    checkout,
  } = useCart();

  const onCheckout = () =>
    checkout(
      checkoutCallbacks({
        thankYouPagePath: "/store/thank-you",
        postFlowPath: "/store",
      }),
    );

  const lineItems = cart?.lineItems || [];
  const subtotal =
    totals?.priceSummary?.subtotal?.formattedAmount ||
    totals?.priceSummary?.subtotal?.amount;
  const total =
    totals?.priceSummary?.total?.formattedAmount ||
    totals?.priceSummary?.total?.amount;
  const discount = totals?.priceSummary?.discount?.formattedAmount;

  if (!cart) {
    return <div className="cp-loading">{t("cart.loading")}</div>;
  }

  if (lineItems.length === 0) {
    return (
      <div className="cp-empty">
        <p>{t("cart.empty")}</p>
        <a href="/store" className="cp-browse">
          {t("cart.browseStore")}
        </a>
      </div>
    );
  }

  return (
    <div className="cp-grid">
      <div className="cp-items">
        {lineItems.map((li) => {
          const rawImg =
            typeof li.image === "string"
              ? li.image
              : (li.image as { url?: string } | undefined)?.url;
          const img = getImageUrl(rawImg, 200, 200);
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

          return (
            <div key={li._id} className="cp-item">
              <div className="cp-item-img">
                {img ? (
                  <img
                    src={img}
                    alt={
                      li.productName?.translated ||
                      li.productName?.original
                    }
                  />
                ) : (
                  <span className="cp-item-placeholder">&#128049;</span>
                )}
              </div>
              <div className="cp-item-details">
                <div className="cp-item-name">
                  {li.productName?.translated || li.productName?.original}
                </div>
                {modifierGroups.length > 0 && (
                  <div className="cp-item-mods">
                    {modifierGroups.map((g, gi) => (
                      <div key={gi} className="cp-mod-group">
                        {g.name && (
                          <div className="cp-mod-group-name">{g.name}:</div>
                        )}
                        {g.rows.map((r, ri) => (
                          <div key={ri} className="cp-mod-row">
                            {r.qty}x {r.label}
                            {r.price && ` (${r.price})`}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                {descriptionTags.length > 0 && (
                  <div className="cp-item-option-tags">
                    {descriptionTags.map((tag, i) => (
                      <span key={i} className="cp-item-option-tag">
                        {tag.name ? `${tag.name}: ${tag.val}` : tag.val}
                      </span>
                    ))}
                  </div>
                )}
                <div className="cp-item-qty">
                  <button
                    className="cp-qty-btn"
                    onClick={() =>
                      updateQuantity(li._id!, (li.quantity ?? 1) - 1)
                    }
                    disabled={loading || (li.quantity ?? 0) <= 1}
                  >
                    &minus;
                  </button>
                  <span className="cp-qty-val">{li.quantity}</span>
                  <button
                    className="cp-qty-btn"
                    onClick={() =>
                      updateQuantity(li._id!, (li.quantity ?? 0) + 1)
                    }
                    disabled={loading}
                  >
                    +
                  </button>
                  <button
                    className="cp-remove"
                    onClick={() => removeItem(li._id!)}
                    disabled={loading}
                  >
                    {t("payment.remove")}
                  </button>
                </div>
              </div>
              <div className="cp-item-price">
                {li.price?.formattedAmount || li.price?.amount}
              </div>
            </div>
          );
        })}
      </div>

      <aside className="cp-summary">
        <h2 className="cp-summary-title">{t("cart.orderSummary")}</h2>
        {subtotal && (
          <div className="cp-row">
            <span>{t("cart.subtotal")}</span>
            <span>{subtotal}</span>
          </div>
        )}
        {discount && (
          <div className="cp-row cp-discount">
            <span>{t("cart.discount")}</span>
            <span>-{discount}</span>
          </div>
        )}
        {total && (
          <div className="cp-row cp-total">
            <span>{t("cart.estimatedTotal")}</span>
            <span>{total}</span>
          </div>
        )}
        <button
          className="cp-checkout-btn"
          onClick={onCheckout}
          disabled={checkingOut || loading}
        >
          {checkingOut ? t("cart.redirecting") : t("cart.checkout")}
        </button>
        <a href="/store" className="cp-continue">
          {t("cart.continueShopping")}
        </a>
      </aside>
    </div>
  );
}
