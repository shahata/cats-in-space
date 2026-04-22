"use client";
import { useState } from "react";
import { orders } from "@wix/pricing-plans";
import { i18n } from "@wix/essentials";

export default function CancelSubscription({ orderId }: { orderId: string }) {
  const t = i18n.getTranslationFunction();
  const [cancelling, setCancelling] = useState(false);
  const [canceled, setCanceled] = useState(false);

  async function handleCancel() {
    if (!confirm(t("cancelSub.confirm"))) return;
    setCancelling(true);
    try {
      await orders.requestCancellation(
        orderId,
        orders.CancellationEffectiveAt.NEXT_PAYMENT_DATE,
      );
    } catch {
      try {
        await orders.requestCancellation(
          orderId,
          orders.CancellationEffectiveAt.IMMEDIATELY,
        );
      } catch (e) {
        alert(e instanceof Error ? e.message : t("common.errorGeneric"));
        setCancelling(false);
        return;
      }
    }
    setCanceled(true);
    setCancelling(false);
  }

  if (canceled) {
    return (
      <span
        style={{
          color: "#ff9800",
          fontSize: "0.8rem",
          fontFamily: "'Bangers', cursive",
          letterSpacing: "1px",
        }}
      >
        {t("cancelSub.requested")}
      </span>
    );
  }

  return (
    <button
      onClick={handleCancel}
      disabled={cancelling}
      style={{
        padding: "8px 16px",
        background: "transparent",
        color: "#f44336",
        border: "1px solid #f44336",
        borderRadius: "8px",
        fontFamily: "'Bangers', cursive",
        fontSize: "0.8rem",
        letterSpacing: "1px",
        cursor: "pointer",
      }}
    >
      {cancelling
        ? t("cancelSub.canceling")
        : t("cancelSub.cancelSubscription")}
    </button>
  );
}
