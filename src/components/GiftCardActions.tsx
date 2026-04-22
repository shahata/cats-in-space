import { useState } from "react";
import { currentCart } from "@wix/ecom";
import { redirects } from "@wix/redirects";
import { i18n } from "@wix/essentials";
import { RISE_GIFT_CARDS_APP_ID } from "../utils/appIds";

const CUSTOM_VARIANT_ID = "custom";

interface VariantPrice {
  amount: string;
  formattedAmount: string;
}

interface PresetVariant {
  _id: string;
  price: VariantPrice;
  value: VariantPrice;
  image: string | null;
}

interface CustomVariant {
  minValue?: VariantPrice;
  maxValue?: VariantPrice;
}

interface Props {
  productId: string;
  productImage: string | null;
  presetVariants: PresetVariant[];
  customVariant: CustomVariant | null;
}

export default function GiftCardActions({
  productId,
  productImage,
  presetVariants,
  customVariant,
}: Props) {
  const t = i18n.getTranslationFunction();
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [customAmount, setCustomAmount] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCustom = selectedVariantId === CUSTOM_VARIANT_ID;
  const selectedPreset = presetVariants.find(
    (v) => v._id === selectedVariantId,
  );
  const parsedCustom = parseFloat(customAmount);
  const canBuy =
    selectedVariantId && (!isCustom || parsedCustom > 0) && !loading;

  // Current image: variant image > product image
  const currentImage = selectedPreset?.image || productImage || null;

  // Price vs value display
  const priceAmount = selectedPreset
    ? parseFloat(selectedPreset.price.amount)
    : 0;
  const valueAmount = selectedPreset
    ? parseFloat(selectedPreset.value.amount)
    : 0;
  const hasDiscount = selectedPreset && priceAmount < valueAmount;

  const handleBuyNow = async () => {
    if (!canBuy) return;
    setLoading(true);
    setError(null);

    try {
      const options: Record<string, unknown> = {
        quantity: 1,
        currency: "USD",
        wixGiftCardsAppNewCatalog: true,
      };

      if (isCustom) {
        options.customAmount = parsedCustom;
      } else {
        options.variantId = selectedVariantId;
      }

      if (recipientEmail) {
        const nameParts = recipientName.split(" ").filter(Boolean);
        const giftingInfo: Record<string, unknown> = {
          recipientInfo: {
            firstName: nameParts[0] || "",
            lastName: nameParts.slice(1).join(" "),
            email: recipientEmail,
          },
        };
        if (message) {
          giftingInfo.greetingMessage = message;
        }
        options.giftingInfo = giftingInfo;
      }

      await currentCart.addToCurrentCart({
        lineItems: [
          {
            quantity: 1,
            catalogReference: {
              appId: RISE_GIFT_CARDS_APP_ID,
              catalogItemId: productId,
              options,
            },
          },
        ],
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
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="gc-actions">
      {currentImage && (
        <div className="gc-image">
          <img src={currentImage} alt="" />
        </div>
      )}

      {selectedPreset && (
        <div className="gc-price-display">
          {hasDiscount && (
            <span className="gc-price-original">
              {selectedPreset.value.formattedAmount}
            </span>
          )}
          <span className="gc-price-cost">
            {selectedPreset.price.formattedAmount}
          </span>
        </div>
      )}

      <div className="gc-amounts">
        <label className="gc-label">{t("store.gcSelectAmount")}</label>
        <div className="gc-amount-options">
          {presetVariants.map((v) => (
            <button
              key={v._id}
              className={`gc-amount-btn ${selectedVariantId === v._id ? "active" : ""}`}
              onClick={() => {
                setSelectedVariantId(v._id);
                setError(null);
              }}
            >
              {v.value.formattedAmount}
            </button>
          ))}
          {customVariant && (
            <button
              className={`gc-amount-btn gc-custom-btn ${isCustom ? "active" : ""}`}
              onClick={() => {
                setSelectedVariantId(CUSTOM_VARIANT_ID);
                setError(null);
              }}
            >
              {t("store.gcCustomAmount")}
            </button>
          )}
        </div>
        {isCustom && customVariant && (
          <div className="gc-custom-input-wrap">
            <input
              type="number"
              className="gc-custom-input"
              placeholder={t("store.gcEnterAmount")}
              min={customVariant.minValue?.amount || "1"}
              max={customVariant.maxValue?.amount || "10000"}
              step="0.01"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
            />
            {customVariant.minValue && customVariant.maxValue && (
              <span className="gc-range-hint">
                {customVariant.minValue.formattedAmount} –{" "}
                {customVariant.maxValue.formattedAmount}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="gc-form">
        <div className="gc-field">
          <label>{t("store.gcRecipientEmail")}</label>
          <input
            type="email"
            className="gc-input"
            placeholder={t("store.gcRecipientEmailPlaceholder")}
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
          />
        </div>
        <div className="gc-field">
          <label>{t("store.gcRecipientName")}</label>
          <input
            type="text"
            className="gc-input"
            placeholder={t("store.gcRecipientNamePlaceholder")}
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
          />
        </div>
        <div className="gc-field">
          <label>{t("store.gcMessage")}</label>
          <textarea
            className="gc-input"
            rows={3}
            placeholder={t("store.gcMessagePlaceholder")}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
      </div>

      <button
        className="gc-purchase-btn"
        disabled={!canBuy}
        onClick={handleBuyNow}
      >
        {loading ? t("store.gcProcessing") : t("store.gcBuyNow")}
      </button>

      {error && <div className="gc-status gc-status-error">{error}</div>}
    </div>
  );
}
