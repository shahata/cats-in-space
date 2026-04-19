import { useState } from "react";
import { currentCart, checkout } from "@wix/ecom";
import { redirects } from "@wix/redirects";
import { i18n } from "@wix/essentials";
import { DONATIONS_APP_ID } from "../utils/appIds";

const CUSTOM_ID = "__custom__";

export type DonationFrequency = "ONE_TIME" | "WEEK" | "MONTH" | "YEAR";

export interface DonatePreset {
  _id: string;
  amount: number;
  formatted: string;
  description: string | null;
}

interface Props {
  campaignId: string;
  presets: DonatePreset[];
  customEnabled: boolean;
  customMin: number | null;
  customMax: number | null;
  customMinFormatted: string | null;
  customMaxFormatted: string | null;
  frequencies: DonationFrequency[];
  askDonorCoverFee: boolean;
  commentsEnabled: boolean;
}

export default function DonateCard({
  campaignId,
  presets,
  customEnabled,
  customMin,
  customMax,
  customMinFormatted,
  customMaxFormatted,
  frequencies,
  askDonorCoverFee,
  commentsEnabled,
}: Props) {
  const t = i18n.getTranslationFunction();
  const [selectedId, setSelectedId] = useState<string>(presets[0]?._id ?? (customEnabled ? CUSTOM_ID : ""));
  const [customAmount, setCustomAmount] = useState("");
  const defaultFreq: DonationFrequency = frequencies.includes("ONE_TIME")
    ? "ONE_TIME"
    : frequencies[0] ?? "ONE_TIME";
  const [frequency, setFrequency] = useState<DonationFrequency>(defaultFreq);
  const [coverFees, setCoverFees] = useState(false);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCustom = selectedId === CUSTOM_ID;
  const selectedPreset = presets.find((p) => p._id === selectedId);
  const parsedCustom = parseFloat(customAmount);
  const customValid =
    parsedCustom > 0 &&
    (customMin == null || parsedCustom >= customMin) &&
    (customMax == null || parsedCustom <= customMax);
  const amount = isCustom ? (customValid ? parsedCustom : 0) : selectedPreset?.amount ?? 0;
  const canDonate = !loading && amount > 0;

  const freqLabel = (f: DonationFrequency) => {
    if (f === "ONE_TIME") return t("research.oneTime");
    if (f === "WEEK") return t("research.weekly");
    if (f === "MONTH") return t("research.monthly");
    return t("research.yearly");
  };

  const handleDonate = async () => {
    if (!canDonate) return;
    setLoading(true);
    setError(null);

    try {
      const options: Record<string, unknown> = { amount };
      if (frequency !== "ONE_TIME") options.frequency = frequency;
      if (askDonorCoverFee && coverFees) options.donorCoveringFees = true;

      await currentCart.addToCurrentCart({
        lineItems: [
          {
            quantity: 1,
            catalogReference: {
              appId: DONATIONS_APP_ID,
              catalogItemId: campaignId,
              options,
            },
          },
        ],
      });

      const { checkoutId } = await currentCart.createCheckoutFromCurrentCart({
        channelType: "WEB",
      });

      const trimmedNote = note.trim();
      if (commentsEnabled && trimmedNote && checkoutId) {
        await checkout.updateCheckout(checkoutId, { buyerNote: trimmedNote });
      }

      const { redirectSession } = await redirects.createRedirectSession({
        ecomCheckout: { checkoutId: checkoutId! },
        callbacks: {
          thankYouPageUrl: window.location.origin + "/research/thank-you",
          postFlowUrl: window.location.origin + "/research",
        },
        preferences: { checkIfPublish: true },
      });

      if (redirectSession?.fullUrl) {
        window.location.href = redirectSession.fullUrl;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("research.donateFailed"));
      setLoading(false);
    }
  };

  return (
    <div className="donate-card">
      <label className="donate-label">{t("research.pickAmount")}</label>
      <div className="donate-amount-grid">
        {presets.map((p) => {
          const active = selectedId === p._id;
          return (
            <button
              key={p._id}
              type="button"
              className={`donate-amount-btn ${active ? "active" : ""}`}
              onClick={() => { setSelectedId(p._id); setError(null); }}
            >
              <span className="donate-amount-price">{p.formatted}</span>
              {p.description && <span className="donate-amount-desc">{p.description}</span>}
            </button>
          );
        })}
        {customEnabled && (
          <button
            type="button"
            className={`donate-amount-btn donate-amount-custom ${isCustom ? "active" : ""}`}
            onClick={() => { setSelectedId(CUSTOM_ID); setError(null); }}
          >
            <span className="donate-amount-price">{t("research.customAmount")}</span>
          </button>
        )}
      </div>

      {isCustom && (
        <div className="donate-custom-wrap">
          <input
            type="number"
            className="donate-custom-input"
            placeholder={t("research.enterAmount")}
            min={customMin ?? 1}
            max={customMax ?? undefined}
            step="0.01"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
          />
          {customMinFormatted && customMaxFormatted && (
            <span className="donate-custom-hint">
              {t("research.amountHint", { min: customMinFormatted, max: customMaxFormatted })}
            </span>
          )}
        </div>
      )}

      {frequencies.length > 1 && (
        <div className="donate-freq">
          <label className="donate-label">{t("research.frequency")}</label>
          <div className="donate-freq-options">
            {frequencies.map((f) => (
              <button
                key={f}
                type="button"
                className={`donate-freq-btn ${frequency === f ? "active" : ""}`}
                onClick={() => setFrequency(f)}
              >
                {freqLabel(f)}
              </button>
            ))}
          </div>
        </div>
      )}

      {askDonorCoverFee && (
        <label className="donate-fees">
          <input
            type="checkbox"
            checked={coverFees}
            onChange={(e) => setCoverFees(e.target.checked)}
          />
          <span>{t("research.coverFees")}</span>
        </label>
      )}

      {commentsEnabled && (
        <div className="donate-note">
          <label className="donate-label">{t("research.note")}</label>
          <textarea
            className="donate-note-input"
            rows={3}
            placeholder={t("research.notePlaceholder")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      )}

      <button
        type="button"
        className="donate-submit"
        disabled={!canDonate}
        onClick={handleDonate}
      >
        {loading ? t("research.processing") : t("research.donate")}
      </button>

      {error && <div className="donate-error">{error}</div>}
    </div>
  );
}
