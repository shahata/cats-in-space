"use client";
import React, { useState } from "react";
import { savedPaymentMethods } from "@wix/payments";
import type { savedPaymentMethods as spmTypes } from "@wix/payments";
import { i18n } from "@wix/essentials";

type SavedPaymentMethod = spmTypes.SavedPaymentMethod;

const brandIcons: Record<string, string> = {
  VISA: "Visa",
  MASTERCARD: "Mastercard",
  AMEX: "Amex",
  DISCOVER: "Discover",
  DINERS: "Diners",
  JCB: "JCB",
  MAESTRO: "Maestro",
  UNIONPAY: "UnionPay",
};

function detectBrandFromBin(bin: string | null | undefined): string {
  if (!bin) return "Card";
  if (bin.startsWith("4")) return "VISA";
  if (/^5[1-5]/.test(bin) || /^2[2-7]/.test(bin)) return "MASTERCARD";
  if (/^3[47]/.test(bin)) return "AMEX";
  if (/^6(?:011|5)/.test(bin)) return "DISCOVER";
  if (/^3(?:0[0-5]|[68])/.test(bin)) return "DINERS";
  if (bin.startsWith("35")) return "JCB";
  if (bin.startsWith("62")) return "UNIONPAY";
  return "Card";
}

function getCardDisplay(pm: SavedPaymentMethod) {
  const cardInfo = pm.paymentMethod?.cardInfo;
  const typeId = pm.paymentMethod?.typeId;
  const brand = detectBrandFromBin(cardInfo?.bin);
  const brandLabel = brandIcons[brand] ? `\uD83D\uDCB3 ${brandIcons[brand]}` : (typeId === "payPal" ? "\uD83C\uDD7F\uFE0F PayPal" : `\uD83D\uDCB3 ${brand}`);
  const last4 = cardInfo?.lastFourDigits || "\u00B7\u00B7\u00B7\u00B7";
  const expMonth = cardInfo?.expirationMonth;
  const expYear = cardInfo?.expirationYear;
  const exp =
    expMonth && expYear
      ? `${String(expMonth).padStart(2, "0")}/${String(expYear).slice(-2)}`
      : null;
  const holder = cardInfo?.cardholderName;
  return { brandLabel, last4, exp, holder, isPayPal: typeId === "payPal" };
}

export default function SavedPaymentMethodsPanel({
  initial,
}: {
  initial: SavedPaymentMethod[];
}) {
  const t = i18n.getTranslationFunction();
  const [methods, setMethods] = useState<SavedPaymentMethod[]>(initial);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm(t('payment.removeConfirm'))) return;
    setLoading(id);
    setError(null);
    try {
      await savedPaymentMethods.deleteSavedPaymentMethod(id);
      setMethods((prev) => prev.filter((m) => m._id !== id));
    } catch (e: any) {
      setError(e.message || t('payment.failedDelete'));
    } finally {
      setLoading(null);
    }
  }

  async function handleSetPrimary(id: string) {
    setLoading(id);
    setError(null);
    try {
      await savedPaymentMethods.markSavedPaymentMethodPrimary(id);
      setMethods((prev) =>
        prev.map((m) => ({ ...m, primary: m._id === id }))
      );
    } catch (e: any) {
      setError(e.message || t('payment.failedUpdate'));
    } finally {
      setLoading(null);
    }
  }

  if (methods.length === 0) {
    return (
      <div style={styles.empty}>
        <p style={styles.emptyText}>{t('payment.noSavedMethods')}</p>
        <p style={styles.emptyHint}>
          {t('payment.savedDuringCheckout')}
        </p>
      </div>
    );
  }

  return (
    <div>
      {error && <div style={styles.error}>{error}</div>}
      <div style={styles.list}>
        {methods.map((pm) => {
          const { brandLabel, last4, exp, holder } = getCardDisplay(pm);
          const isLoading = loading === pm._id;
          return (
            <div key={pm._id} style={styles.card}>
              <div style={styles.cardMain}>
                <div style={styles.cardInfo}>
                  <span style={styles.brand}>{brandLabel}</span>
                  <span style={styles.digits}>&bull;&bull;&bull;&bull; {last4}</span>
                  {pm.primary && <span style={styles.primaryBadge}>Primary</span>}
                </div>
                <div style={styles.cardMeta}>
                  {holder && <span style={styles.holder}>{holder}</span>}
                  {exp && <span style={styles.exp}>Exp {exp}</span>}
                </div>
              </div>
              <div style={styles.actions}>
                {!pm.primary && (
                  <button
                    onClick={() => handleSetPrimary(pm._id!)}
                    disabled={isLoading}
                    style={styles.btnSecondary}
                  >
                    {isLoading ? "..." : t('payment.setPrimary')}
                  </button>
                )}
                <button
                  onClick={() => handleDelete(pm._id!)}
                  disabled={isLoading}
                  style={styles.btnDanger}
                >
                  {isLoading ? "..." : t('payment.remove')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  empty: {
    padding: "30px",
    background: "#141414",
    border: "1px solid #222",
    borderRadius: "12px",
    textAlign: "center",
  },
  emptyText: { color: "#888", marginBottom: "8px" },
  emptyHint: { color: "#555", fontSize: "0.8rem" },
  error: {
    background: "rgba(244, 67, 54, 0.1)",
    border: "1px solid rgba(244, 67, 54, 0.3)",
    borderRadius: "8px",
    padding: "10px 16px",
    color: "#f44336",
    fontSize: "0.85rem",
    marginBottom: "16px",
  },
  list: { display: "flex", flexDirection: "column", gap: "12px" },
  card: {
    background: "#141414",
    border: "1px solid #222",
    borderRadius: "12px",
    padding: "20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
  },
  cardMain: { display: "flex", flexDirection: "column", gap: "6px" },
  cardInfo: { display: "flex", alignItems: "center", gap: "10px" },
  brand: {
    fontFamily: "'Bangers', cursive",
    fontSize: "1rem",
    color: "#ffcc00",
    letterSpacing: "1px",
  },
  digits: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: "0.9rem",
    color: "#e0e0e0",
  },
  primaryBadge: {
    fontSize: "0.65rem",
    fontWeight: "700",
    textTransform: "uppercase" as const,
    letterSpacing: "1px",
    padding: "2px 8px",
    borderRadius: "10px",
    background: "#ff6600",
    color: "#000",
  },
  cardMeta: { display: "flex", gap: "16px" },
  holder: { fontSize: "0.8rem", color: "#aaa" },
  exp: { fontSize: "0.8rem", color: "#888" },
  actions: { display: "flex", gap: "8px", flexShrink: 0 },
  btnSecondary: {
    padding: "6px 14px",
    background: "none",
    border: "1px solid #444",
    borderRadius: "8px",
    color: "#aaa",
    fontSize: "0.75rem",
    fontFamily: "'Bangers', cursive",
    letterSpacing: "1px",
    cursor: "pointer",
  },
  btnDanger: {
    padding: "6px 14px",
    background: "none",
    border: "1px solid rgba(244, 67, 54, 0.3)",
    borderRadius: "8px",
    color: "#f44336",
    fontSize: "0.75rem",
    fontFamily: "'Bangers', cursive",
    letterSpacing: "1px",
    cursor: "pointer",
  },
};
