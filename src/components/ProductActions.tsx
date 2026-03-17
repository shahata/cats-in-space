import { useState, useMemo } from "react";
import { currentCart, backInStockNotifications } from "@wix/ecom";
import { redirects } from "@wix/redirects";
import type { products } from "@wix/stores";

const STORES_APP_ID = "1380b703-ce81-ff05-f115-39571d94dfcd";

export interface ProductData {
  _id: string;
  name: string;
  productOptions: products.ProductOption[];
  variants: products.Variant[];
  stock: products.Stock | undefined;
  manageVariants: boolean | null | undefined;
  priceData: products.PriceData | undefined;
  customTextFields: products.CustomTextField[];
}

interface Props {
  product: ProductData;
}

export default function ProductActions({ product }: Props) {
  const options = product.productOptions || [];
  const variants = product.variants || [];
  const customTextFields = product.customTextFields || [];
  const hasOptions = options.length > 0;

  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const opt of options) {
      if (opt.choices?.length && opt.name) {
        init[opt.name] = opt.choices[0].value ?? '';
      }
    }
    return init;
  });
  const [customTexts, setCustomTexts] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [bisEmail, setBisEmail] = useState("");
  const [bisSubmitted, setBisSubmitted] = useState(false);

  const selectedVariant = useMemo(() => {
    if (!hasOptions) {
      return variants[0];
    }
    return variants.find((v) => {
      const choices = (v.choices || {}) as Record<string, string>;
      return Object.entries(selections).every(
        ([optName, choiceVal]) => choices[optName] === choiceVal,
      );
    });
  }, [selections, variants, hasOptions]);

  const variantId = selectedVariant?._id;
  const isInStock = selectedVariant
    ? selectedVariant.stock?.inStock !== false
    : product.stock?.inStock !== false;

  const variantPrice = selectedVariant?.variant?.priceData;
  const activePrice = variantPrice || product.priceData;
  const displayPrice = activePrice?.formatted?.discountedPrice || activePrice?.formatted?.price;
  const originalPrice = activePrice?.formatted?.price;
  const onSale = activePrice?.discountedPrice != null && activePrice.discountedPrice < (activePrice.price ?? 0);

  const handleOptionChange = (optionName: string, value: string) => {
    setSelections((prev) => ({ ...prev, [optionName]: value }));
    setMessage(null);
    setBisSubmitted(false);
  };

  const buildCatalogRef = () => {
    const ref: Record<string, unknown> = {
      catalogItemId: product._id,
      appId: STORES_APP_ID,
    };
    const opts: Record<string, unknown> = {};
    if (hasOptions && variantId) {
      opts.variantId = variantId;
    }
    const filledTexts = Object.fromEntries(
      Object.entries(customTexts).filter(([, v]) => v.trim())
    );
    if (Object.keys(filledTexts).length > 0) {
      opts.customTextFields = filledTexts;
    }
    if (Object.keys(opts).length > 0) {
      ref.options = opts;
    }
    return ref;
  };

  const missingRequired = customTextFields
    .filter((f) => f.mandatory)
    .some((f) => !customTexts[f.title!]?.trim());

  const addToCart = async () => {
    if (missingRequired) {
      setMessage({ type: "error", text: "Please fill in all required fields" });
      return;
    }
    setLoading("cart");
    setMessage(null);
    try {
      await currentCart.addToCurrentCart({
        lineItems: [{ quantity, catalogReference: buildCatalogRef() }],
      });
      setMessage({ type: "success", text: "Added to cart!" });
      window.dispatchEvent(new CustomEvent("cart-updated"));
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : "Failed to add to cart",
      });
    } finally {
      setLoading(null);
    }
  };

  const buyNow = async () => {
    setLoading("buy");
    setMessage(null);
    try {
      await currentCart.addToCurrentCart({
        lineItems: [{ quantity, catalogReference: buildCatalogRef() }],
      });
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
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : "Failed to start checkout",
      });
      setLoading(null);
    }
  };

  const submitBackInStock = async () => {
    if (!bisEmail) return;
    setLoading("bis");
    try {
      const catalogRef: Record<string, unknown> = {
        catalogItemId: product._id,
        appId: STORES_APP_ID,
      };
      if (hasOptions && variantId) {
        catalogRef.options = { variantId };
      }
      // SDK takes two separate args: (request, itemDetails)
      await (backInStockNotifications.createBackInStockNotificationRequest as Function)(
        { catalogReference: catalogRef, email: bisEmail },
        {
          name: product.name || "Product",
          price: String(product.priceData?.price || "0"),
        },
      );
      setBisSubmitted(true);
      setMessage({
        type: "success",
        text: "You'll be notified when this item is back in stock!",
      });
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : "Failed to register notification",
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="pa-root">
      {hasOptions && (
        <div className="pa-options">
          {options.map((opt) => (
            <div key={opt.name} className="pa-option">
              <label className="pa-option-label">{opt.name}</label>
              <div className="pa-choices">
                {opt.choices?.map((choice) => (
                  <button
                    key={choice.value}
                    className={`pa-choice ${selections[opt.name!] === choice.value ? "pa-choice-active" : ""}`}
                    onClick={() => handleOptionChange(opt.name!, choice.value!)}
                  >
                    {choice.description || choice.value}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {customTextFields.length > 0 && (
        <div className="pa-options">
          {customTextFields.map((field) => (
            <div key={field.title} className="pa-option">
              <label className="pa-option-label">
                {field.title}{field.mandatory && <span className="pa-required">*</span>}
              </label>
              <input
                type="text"
                className="pa-text-input"
                maxLength={field.maxLength ?? undefined}
                value={customTexts[field.title!] || ""}
                onChange={(e) => setCustomTexts((prev) => ({ ...prev, [field.title!]: e.target.value }))}
                placeholder={field.title ?? ""}
              />
            </div>
          ))}
        </div>
      )}

      {displayPrice && (
        <div className="pa-selected-price">
          {onSale && originalPrice && <span className="pa-original-price">{originalPrice}</span>}
          <span className={onSale ? "pa-sale-price" : ""}>{displayPrice}</span>
        </div>
      )}

      <div className="pa-stock-status">
        {isInStock ? (
          <span className="pa-in-stock">In Stock</span>
        ) : (
          <span className="pa-oos">Out of Stock</span>
        )}
      </div>

      {isInStock ? (
        <>
          <div className="pa-quantity">
            <label className="pa-option-label">Quantity</label>
            <div className="pa-qty-controls">
              <button
                className="pa-qty-btn"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
              >
                &minus;
              </button>
              <span className="pa-qty-value">{quantity}</span>
              <button
                className="pa-qty-btn"
                onClick={() => setQuantity(quantity + 1)}
              >
                +
              </button>
            </div>
          </div>

          <div className="pa-actions">
            <button
              className="pa-btn pa-btn-cart"
              onClick={addToCart}
              disabled={loading !== null}
            >
              {loading === "cart" ? "Adding..." : "Add to Cart"}
            </button>
            <button
              className="pa-btn pa-btn-buy"
              onClick={buyNow}
              disabled={loading !== null}
            >
              {loading === "buy" ? "Processing..." : "Buy Now"}
            </button>
          </div>
        </>
      ) : (
        <div className="pa-bis">
          {!bisSubmitted ? (
            <>
              <p className="pa-bis-text">
                Want to know when this is back? Enter your email:
              </p>
              <div className="pa-bis-form">
                <input
                  type="email"
                  className="pa-bis-input"
                  placeholder="your@email.com"
                  value={bisEmail}
                  onChange={(e) => setBisEmail(e.target.value)}
                />
                <button
                  className="pa-btn pa-btn-bis"
                  onClick={submitBackInStock}
                  disabled={loading !== null || !bisEmail}
                >
                  {loading === "bis" ? "..." : "Notify Me"}
                </button>
              </div>
            </>
          ) : (
            <p className="pa-bis-done">We'll email you when it's back!</p>
          )}
        </div>
      )}

      {message && (
        <div className={`pa-message pa-message-${message.type}`}>
          {message.text}
        </div>
      )}
    </div>
  );
}
