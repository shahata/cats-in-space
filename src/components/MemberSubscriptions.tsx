"use client";
import React, { useState, useEffect } from "react";
import { orders } from "@wix/pricing-plans";

interface OrderItem {
  _id: string;
  planId: string;
  planName: string;
  planDescription: string;
  status: string;
  type: string;
  startDate: string | null;
  endDate: string | null;
  autoRenewCanceled: boolean;
  lastPaymentStatus: string;
  pricing: {
    total: string;
    currency: string;
    planPrice: string;
  };
  currentCycle: { index: number } | null;
  cancellable: boolean;
}

export default function MemberSubscriptions() {
  const [myOrders, setMyOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    loadOrders();
  }, []);

  async function loadOrders() {
    setLoading(true);
    try {
      const result = await orders.memberListOrders();
      const items: OrderItem[] = (result.orders || []).map((o: any) => ({
        _id: o._id,
        planId: o.planId,
        planName: o.planName || "Unknown Plan",
        planDescription: o.planDescription || "",
        status: o.status || "UNKNOWN",
        type: o.type || "UNKNOWN",
        startDate: o.startDate || null,
        endDate: o.endDate || null,
        autoRenewCanceled: o.autoRenewCanceled || false,
        lastPaymentStatus: o.lastPaymentStatus || "",
        pricing: {
          total: o.priceDetails?.total || "0",
          currency: o.priceDetails?.currency || "USD",
          planPrice: o.priceDetails?.planPrice || "0",
        },
        currentCycle: o.currentCycle || null,
        cancellable: o.status === "ACTIVE" && !o.autoRenewCanceled,
      }));
      setMyOrders(items);
    } catch (e: any) {
      console.error("Failed to load orders:", e);
    }
    setLoading(false);
  }

  async function handleCancel(orderId: string) {
    if (!confirm("Are you sure you want to cancel this subscription? It will be canceled at the next payment date.")) return;
    setCancellingId(orderId);
    try {
      await orders.requestCancellation(orderId, "NEXT_PAYMENT_DATE");
      alert("Subscription cancellation requested. It will end at the next payment date.");
      await loadOrders();
    } catch (e: any) {
      // If NEXT_PAYMENT_DATE fails (e.g. single payment), try IMMEDIATELY
      try {
        await orders.requestCancellation(orderId, "IMMEDIATELY");
        alert("Subscription canceled.");
        await loadOrders();
      } catch (e2: any) {
        alert(e2?.message || e?.message || "Failed to cancel subscription");
      }
    }
    setCancellingId(null);
  }

  function formatDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    });
  }

  function statusBadge(status: string, autoRenewCanceled: boolean) {
    if (autoRenewCanceled) return { label: "Canceling", color: "#ff9800" };
    switch (status) {
      case "ACTIVE": return { label: "Active", color: "#4caf50" };
      case "CANCELED": return { label: "Canceled", color: "#f44336" };
      case "ENDED": return { label: "Ended", color: "#888" };
      case "PAUSED": return { label: "Paused", color: "#ff9800" };
      case "PENDING": return { label: "Pending", color: "#2196f3" };
      default: return { label: status, color: "#888" };
    }
  }

  if (loading) {
    return <div style={{ color: "#888", fontSize: "0.9rem", padding: "20px 0" }}>Loading subscriptions...</div>;
  }

  if (myOrders.length === 0) {
    return (
      <div style={emptyStyle}>
        <p style={{ color: "#888", marginBottom: "12px" }}>You don't have any subscriptions yet.</p>
        <a href="/plans" style={viewPlansLinkStyle}>Browse Plans</a>
      </div>
    );
  }

  return (
    <div>
      {myOrders.map((order) => {
        const badge = statusBadge(order.status, order.autoRenewCanceled);
        const isFree = parseFloat(order.pricing.planPrice) === 0;

        return (
          <div key={order._id} style={cardStyle}>
            <div style={cardHeaderStyle}>
              <div>
                <div style={planNameStyle}>{order.planName}</div>
                {order.planDescription && (
                  <div style={planDescStyle}>{order.planDescription}</div>
                )}
              </div>
              <span style={{ ...badgeStyle, background: badge.color }}>{badge.label}</span>
            </div>

            <div style={detailsGridStyle}>
              <div style={detailStyle}>
                <span style={detailLabelStyle}>Price</span>
                <span style={detailValueStyle}>
                  {isFree ? "Free" : `${order.pricing.currency === "USD" ? "$" : order.pricing.currency}${order.pricing.planPrice}`}
                </span>
              </div>
              <div style={detailStyle}>
                <span style={detailLabelStyle}>Started</span>
                <span style={detailValueStyle}>{formatDate(order.startDate)}</span>
              </div>
              {order.endDate && (
                <div style={detailStyle}>
                  <span style={detailLabelStyle}>Ends</span>
                  <span style={detailValueStyle}>{formatDate(order.endDate)}</span>
                </div>
              )}
              {order.currentCycle && (
                <div style={detailStyle}>
                  <span style={detailLabelStyle}>Cycle</span>
                  <span style={detailValueStyle}>#{order.currentCycle.index}</span>
                </div>
              )}
              <div style={detailStyle}>
                <span style={detailLabelStyle}>Type</span>
                <span style={detailValueStyle}>{order.type === "ONLINE" ? "Online" : order.type === "OFFLINE" ? "Offline" : order.type}</span>
              </div>
            </div>

            {order.cancellable && (
              <div style={cardFooterStyle}>
                <button
                  onClick={() => handleCancel(order._id)}
                  disabled={cancellingId === order._id}
                  style={cancelBtnStyle}
                >
                  {cancellingId === order._id ? "Canceling..." : "Cancel Subscription"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const emptyStyle: React.CSSProperties = {
  padding: "30px", background: "#141414", border: "1px solid #222",
  borderRadius: "12px", textAlign: "center",
};

const viewPlansLinkStyle: React.CSSProperties = {
  color: "#ff6600", fontFamily: "'Bangers', cursive",
  fontSize: "0.9rem", letterSpacing: "1px",
};

const cardStyle: React.CSSProperties = {
  background: "#141414", border: "1px solid #222", borderRadius: "12px",
  padding: "24px", marginBottom: "16px",
};

const cardHeaderStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
  marginBottom: "16px", gap: "12px",
};

const planNameStyle: React.CSSProperties = {
  fontFamily: "'Bangers', cursive", fontSize: "1.2rem",
  color: "#ffcc00", letterSpacing: "1px",
};

const planDescStyle: React.CSSProperties = {
  fontSize: "0.8rem", color: "#888", marginTop: "4px", lineHeight: "1.4",
};

const badgeStyle: React.CSSProperties = {
  fontSize: "0.7rem", fontFamily: "'Bangers', cursive",
  letterSpacing: "1px", padding: "4px 12px", borderRadius: "12px",
  color: "#000", whiteSpace: "nowrap", flexShrink: 0,
};

const detailsGridStyle: React.CSSProperties = {
  display: "flex", flexWrap: "wrap", gap: "16px",
  paddingTop: "12px", borderTop: "1px solid #222",
};

const detailStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: "2px",
};

const detailLabelStyle: React.CSSProperties = {
  fontSize: "0.65rem", color: "#666", textTransform: "uppercase",
  letterSpacing: "1px",
};

const detailValueStyle: React.CSSProperties = {
  fontSize: "0.85rem", color: "#e0e0e0",
};

const cardFooterStyle: React.CSSProperties = {
  marginTop: "16px", paddingTop: "12px", borderTop: "1px solid #222",
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "8px 16px", background: "transparent", color: "#f44336",
  border: "1px solid #f44336", borderRadius: "8px",
  fontFamily: "'Bangers', cursive", fontSize: "0.8rem",
  letterSpacing: "1px", cursor: "pointer",
};
