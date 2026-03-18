import { useState, useMemo } from "react";
import { currentCart, backInStockNotifications } from "@wix/ecom";
import { redirects } from "@wix/redirects";
import type { productsV3 } from "@wix/stores";

const STORES_APP_ID = "215238eb-22a5-4c36-9e7b-e7c08025e04e";
const ECOM_PLATFORM_APP_ID = "1380b703-ce81-ff05-f115-39571d94dfcd";

export interface ProductData {
  _id: string;
  name: string;
  options: productsV3.ConnectedOption[];
  variants: productsV3.Variant[];
  inventory: productsV3.Inventory | undefined;
  priceRange?: {
    minValue?: { amount?: string; formattedAmount?: string | null };
    maxValue?: { amount?: string; formattedAmount?: string | null };
  };
  compareAtPriceRange?: {
    minValue?: { amount?: string; formattedAmount?: string | null };
    maxValue?: { amount?: string; formattedAmount?: string | null };
  };
  currency?: string | null;
  modifiers: productsV3.ConnectedModifier[];
  ribbon?: string | null;
}

interface Props {
  product: ProductData;
}

export default function ProductActions({ product }: Props) {
  const options = product.options || [];
  const variants = product.variants || [];
  const modifiers = product.modifiers || [];
  const freeTextModifiers = modifiers.filter(
    (m) => m.modifierRenderType === "FREE_TEXT",
  );
  const choiceModifiers = modifiers.filter(
    (m) => m.modifierRenderType === "TEXT_CHOICES" || m.modifierRenderType === "SWATCH_CHOICES",
  );
  const hasOptions = options.length > 0;
  const isPreOrder = product.inventory?.preorderStatus === "ENABLED";

  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const opt of options) {
      const choices = opt.choicesSettings?.choices;
      if (choices?.length && opt.name) {
        init[opt.name] = choices[0].name ?? "";
      }
    }
    return init;
  });
  const [customTexts, setCustomTexts] = useState<Record<string, string>>({});
  const [modifierSelections, setModifierSelections] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const mod of choiceModifiers) {
      const choices = mod.choicesSettings?.choices;
      if (choices?.length && mod.key) {
        init[mod.key] = choices[0].key ?? choices[0].name ?? "";
      }
    }
    return init;
  });
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
      const choices = v.choices || [];
      return Object.entries(selections).every(([optName, choiceVal]) =>
        choices.some(
          (c) =>
            c.optionChoiceNames?.optionName === optName &&
            c.optionChoiceNames?.choiceName === choiceVal,
        ),
      );
    });
  }, [selections, variants, hasOptions]);

  const variantId = selectedVariant?._id;
  const variantPreorder = selectedVariant?.inventoryStatus?.preorderEnabled;
  const isInStock = selectedVariant
    ? (selectedVariant.inventoryStatus?.inStock !== false) || variantPreorder === true
    : product.inventory?.availabilityStatus !== "OUT_OF_STOCK" || isPreOrder;

  const displayPrice = selectedVariant?.price?.actualPrice?.formattedAmount;
  const comparePrice = selectedVariant?.price?.compareAtPrice?.formattedAmount;
  const onSale = !!comparePrice && comparePrice !== displayPrice;

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
    const filledTexts: Record<string, string> = {};
    for (const mod of freeTextModifiers) {
      const key = mod.freeTextSettings?.key;
      const val = customTexts[mod.name!];
      if (key && val?.trim()) {
        filledTexts[key] = val;
      }
    }
    if (Object.keys(filledTexts).length > 0) {
      opts.customTextFields = filledTexts;
    }
    // TEXT_CHOICES modifiers go in options keyed by modifier key
    const modChoices: Record<string, string> = {};
    for (const mod of choiceModifiers) {
      if (mod.key && modifierSelections[mod.key]) {
        modChoices[mod.key] = modifierSelections[mod.key];
      }
    }
    if (Object.keys(modChoices).length > 0) {
      if (!opts.options) opts.options = {};
      Object.assign(opts.options as Record<string, string>, modChoices);
    }
    if (Object.keys(opts).length > 0) {
      ref.options = opts;
    }
    return ref;
  };

  const missingRequired = freeTextModifiers
    .filter((m) => m.mandatory)
    .some((m) => !customTexts[m.name!]?.trim());

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
          thankYouPageUrl: window.location.origin + "/store/thank-you",
          postFlowUrl: window.location.origin + "/store",
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
      // Back-in-stock settings only supports the V1 Stores appId
      const catalogRef: Record<string, unknown> = {
        catalogItemId: product._id,
        appId: ECOM_PLATFORM_APP_ID,
      };
      if (hasOptions && variantId) {
        catalogRef.options = { variantId };
      }
      // SDK takes two separate args: (request, itemDetails)
      await (
        backInStockNotifications.createBackInStockNotificationRequest as Function
      )(
        { catalogReference: catalogRef, email: bisEmail },
        {
          name: product.name || "Product",
          price: String(product.priceRange?.minValue?.amount || "0"),
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
        text:
          e instanceof Error ? e.message : "Failed to register notification",
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="pa-root">
      {hasOptions && (
        <div className="pa-options">
          {options.map((opt) => {
            const isSwatch = opt.optionRenderType === "SWATCH_CHOICES";
            return (
              <div key={opt.name} className="pa-option">
                <label className="pa-option-label">{opt.name}</label>
                <div className="pa-choices">
                  {opt.choicesSettings?.choices?.map((choice) => {
                    const isActive = selections[opt.name!] === choice.name;
                    const colorCode = choice.colorCode;
                    return isSwatch && colorCode ? (
                      <button
                        key={choice.name}
                        className={`pa-swatch ${isActive ? "pa-swatch-active" : ""}`}
                        style={{ backgroundColor: colorCode }}
                        onClick={() => handleOptionChange(opt.name!, choice.name!)}
                        title={choice.name ?? ""}
                      />
                    ) : (
                      <button
                        key={choice.name}
                        className={`pa-choice ${isActive ? "pa-choice-active" : ""}`}
                        onClick={() => handleOptionChange(opt.name!, choice.name!)}
                      >
                        {choice.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {choiceModifiers.length > 0 && (
        <div className="pa-options">
          {choiceModifiers.map((mod) => {
            const isSwatch = mod.modifierRenderType === "SWATCH_CHOICES";
            return (
              <div key={mod.key} className="pa-option">
                <label className="pa-option-label">
                  {mod.name}{mod.mandatory && <span className="pa-required">*</span>}
                </label>
                <div className="pa-choices">
                  {mod.choicesSettings?.choices?.map((choice) => {
                    const isActive = modifierSelections[mod.key!] === (choice.key ?? choice.name);
                    const colorCode = choice.colorCode;
                    return isSwatch && colorCode ? (
                      <button
                        key={choice.key}
                        className={`pa-swatch ${isActive ? "pa-swatch-active" : ""}`}
                        style={{ backgroundColor: colorCode }}
                        onClick={() => setModifierSelections((prev) => ({ ...prev, [mod.key!]: choice.key ?? choice.name ?? "" }))}
                        title={choice.name ?? ""}
                      />
                    ) : (
                      <button
                        key={choice.key}
                        className={`pa-choice ${isActive ? "pa-choice-active" : ""}`}
                        onClick={() => setModifierSelections((prev) => ({ ...prev, [mod.key!]: choice.key ?? choice.name ?? "" }))}
                      >
                        {choice.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {freeTextModifiers.length > 0 && (
        <div className="pa-options">
          {freeTextModifiers.map((mod) => {
            const title = mod.freeTextSettings?.title || mod.name;
            const maxChars = mod.freeTextSettings?.maxCharCount;
            const currentLen = (customTexts[mod.name!] || "").length;
            return (
              <div key={mod.name} className="pa-option">
                <label className="pa-option-label">
                  {title}{mod.mandatory && <span className="pa-required">*</span>}
                </label>
                <input
                  type="text"
                  className="pa-text-input"
                  maxLength={maxChars ?? undefined}
                  value={customTexts[mod.name!] || ""}
                  onChange={(e) =>
                    setCustomTexts((prev) => ({
                      ...prev,
                      [mod.name!]: e.target.value,
                    }))
                  }
                  placeholder={title ?? ""}
                />
                {maxChars && (
                  <span className="pa-char-count">{currentLen}/{maxChars}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {displayPrice && (
        <div className="pa-selected-price">
          {onSale && comparePrice && (
            <span className="pa-original-price">{comparePrice}</span>
          )}
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
              {loading === "cart"
                ? "Adding..."
                : isPreOrder
                  ? "Pre-Order"
                  : "Add to Cart"}
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
