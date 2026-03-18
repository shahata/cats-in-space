"use client";
import { useState } from "react";
import { orders } from "@wix/pricing-plans";

export default function CancelSubscription({ orderId }: { orderId: string }) {
  const [cancelling, setCancelling] = useState(false);
  const [canceled, setCanceled] = useState(false);

  async function handleCancel() {
    if (!confirm("Are you sure you want to cancel this subscription?")) return;
    setCancelling(true);
    try {
      await orders.requestCancellation(orderId, "NEXT_PAYMENT_DATE");
    } catch {
      try {
        await orders.requestCancellation(orderId, "IMMEDIATELY");
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed to cancel subscription");
        setCancelling(false);
        return;
      }
    }
    setCanceled(true);
    setCancelling(false);
  }

  if (canceled) {
    return <span style={{ color: "#ff9800", fontSize: "0.8rem", fontFamily: "'Bangers', cursive", letterSpacing: "1px" }}>Cancellation requested</span>;
  }

  return (
    <button
      onClick={handleCancel}
      disabled={cancelling}
      style={{
        padding: "8px 16px", background: "transparent", color: "#f44336",
        border: "1px solid #f44336", borderRadius: "8px",
        fontFamily: "'Bangers', cursive", fontSize: "0.8rem",
        letterSpacing: "1px", cursor: "pointer",
      }}
    >
      {cancelling ? "Canceling..." : "Cancel Subscription"}
    </button>
  );
}
