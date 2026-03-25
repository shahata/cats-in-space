import { useState, useMemo, useEffect, useRef } from "react";
import { currentCart, backInStockNotifications } from "@wix/ecom";
import type { cart as cartTypes } from "@wix/ecom";
import { redirects } from "@wix/redirects";
import type { productsV3 } from "@wix/stores";
import { i18n } from "@wix/essentials";

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
  const t = i18n.getTranslationFunction();
  const options = product.options || [];
  const variants = product.variants || [];
  const modifiers = product.modifiers || [];
  const freeTextModifiers = modifiers.filter(
    (m) => m.modifierRenderType === "FREE_TEXT",
  );
  const choiceModifiers = modifiers.filter(
    (m) =>
      m.modifierRenderType === "TEXT_CHOICES" ||
      m.modifierRenderType === "SWATCH_CHOICES",
  );
  const hasOptions = options.length > 0;
  const isPreOrder = product.inventory?.preorderStatus === "ENABLED";

  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const opt of options) {
      const choices = opt.choicesSettings?.choices;
      if (choices?.length && opt.name) {
        init[opt.name] = choices[0]?.name ?? "";
      }
    }
    return init;
  });
  const [customTexts, setCustomTexts] = useState<Record<string, string>>({});
  const [modifierSelections, setModifierSelections] = useState<
    Record<string, string>
  >(() => {
    const init: Record<string, string> = {};
    for (const mod of choiceModifiers) {
      const choices = mod.choicesSettings?.choices;
      if (choices?.length && mod.key) {
        init[mod.key] = choices[0]?.key ?? choices[0]?.name ?? "";
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
    ? selectedVariant.inventoryStatus?.inStock !== false ||
      variantPreorder === true
    : product.inventory?.availabilityStatus !== "OUT_OF_STOCK" || isPreOrder;

  const displayPrice =
    selectedVariant?.price?.actualPrice?.formattedAmount ||
    (selectedVariant?.price?.actualPrice?.amount
      ? `${product.currency || ""}${selectedVariant.price.actualPrice.amount}`
      : null) ||
    product.priceRange?.minValue?.formattedAmount ||
    (product.priceRange?.minValue?.amount
      ? `${product.currency || ""}${product.priceRange.minValue.amount}`
      : null);
  const comparePrice = selectedVariant?.price?.compareAtPrice?.formattedAmount;
  const onSale = !!comparePrice && comparePrice !== displayPrice;

  const handleOptionChange = (optionName: string, value: string) => {
    setSelections((prev) => ({ ...prev, [optionName]: value }));
    setMessage(null);
    setBisSubmitted(false);
  };

  const buildCatalogRef = (): cartTypes.CatalogReference => {
    const ref: cartTypes.CatalogReference = {
      catalogItemId: product._id,
      appId: STORES_APP_ID,
    };
    const opts: Record<string, unknown> = {};
    if (variantId) {
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
        modChoices[mod.key] = modifierSelections[mod.key]!;
      }
    }
    if (Object.keys(modChoices).length > 0) {
      if (!opts.options) opts.options = {};
      Object.assign(opts.options as Record<string, string>, modChoices);
    }
    if (isPreOrder || variantPreorder) {
      opts.preOrderRequested = true;
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
      setMessage({ type: "error", text: t('product.fillRequired') });
      return;
    }
    setLoading("cart");
    setMessage(null);
    try {
      await currentCart.addToCurrentCart({
        lineItems: [
          {
            quantity: Math.max(1, quantity),
            catalogReference: buildCatalogRef(),
          },
        ],
      });
      setMessage({
        type: "success",
        text: isPreOrder ? t('product.preorderAdded') : t('product.addedToCart'),
      });
      window.dispatchEvent(new CustomEvent("cart-updated"));
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : t('product.failedAddToCart'),
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
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : t('product.failedCheckout'),
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
        text: t('product.backInStockNotified'),
      });
    } catch (e) {
      setMessage({
        type: "error",
        text:
          e instanceof Error ? e.message : t('product.failedNotification'),
      });
    } finally {
      setLoading(null);
    }
  };

  const priceRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const slot = document.getElementById("product-price-slot");
    if (slot && priceRef.current) {
      slot.innerHTML = priceRef.current.innerHTML;
    }
  }, [displayPrice, comparePrice, onSale]);

  return (
    <div className="pa-root">
      <div ref={priceRef} style={{ display: "none" }}>
        {displayPrice && (
          <div className="pa-selected-price">
            {onSale && comparePrice && (
              <span className="pa-original-price">{comparePrice}</span>
            )}
            <span className={onSale ? "pa-sale-price" : ""}>
              {displayPrice}
            </span>
          </div>
        )}
      </div>

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
                        onClick={() =>
                          handleOptionChange(opt.name!, choice.name!)
                        }
                        title={choice.name ?? ""}
                      />
                    ) : (
                      <button
                        key={choice.name}
                        className={`pa-choice ${isActive ? "pa-choice-active" : ""}`}
                        onClick={() =>
                          handleOptionChange(opt.name!, choice.name!)
                        }
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
                  {mod.name}
                  {mod.mandatory && <span className="pa-required">*</span>}
                </label>
                <div className="pa-choices">
                  {mod.choicesSettings?.choices?.map((choice) => {
                    const isActive =
                      modifierSelections[mod.key!] ===
                      (choice.key ?? choice.name);
                    const colorCode = choice.colorCode;
                    return isSwatch && colorCode ? (
                      <button
                        key={choice.key}
                        className={`pa-swatch ${isActive ? "pa-swatch-active" : ""}`}
                        style={{ backgroundColor: colorCode }}
                        onClick={() =>
                          setModifierSelections((prev) => ({
                            ...prev,
                            [mod.key!]: choice.key ?? choice.name ?? "",
                          }))
                        }
                        title={choice.name ?? ""}
                      />
                    ) : (
                      <button
                        key={choice.key}
                        className={`pa-choice ${isActive ? "pa-choice-active" : ""}`}
                        onClick={() =>
                          setModifierSelections((prev) => ({
                            ...prev,
                            [mod.key!]: choice.key ?? choice.name ?? "",
                          }))
                        }
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
                  {title}
                  {mod.mandatory && <span className="pa-required">*</span>}
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
                  <span className="pa-char-count">
                    {currentLen}/{maxChars}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="pa-stock-status">
        {isInStock ? (
          <span className="pa-in-stock">{t('product.inStock')}</span>
        ) : (
          <span className="pa-oos">{t('product.outOfStock')}</span>
        )}
      </div>

      {isInStock ? (
        <>
          <div className="pa-quantity">
            <label className="pa-option-label">{t('product.quantity')}</label>
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
                ? t('product.adding')
                : isPreOrder
                  ? t('product.preOrder')
                  : t('product.addToCart')}
            </button>
            <button
              className="pa-btn pa-btn-buy"
              onClick={buyNow}
              disabled={loading !== null}
            >
              {loading === "buy" ? t('product.processingBuy') : t('product.buyNow')}
            </button>
          </div>
        </>
      ) : (
        <div className="pa-bis">
          {!bisSubmitted ? (
            <>
              <p className="pa-bis-text">
                {t('product.backInStockText')}
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
                  {loading === "bis" ? "..." : t('product.notifyMe')}
                </button>
              </div>
            </>
          ) : (
            <p className="pa-bis-done">{t('product.backInStockDone')}</p>
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
