"use client";
import React, { useState, useEffect } from "react";
import { extendedBookings, bookings } from "@wix/bookings";
import type { extendedBookings as extendedBookingsTypes } from "@wix/bookings";
import { i18n } from "@wix/essentials";

export default function MyBookings() {
  const t = i18n.getTranslationFunction();
  const [items, setItems] = useState<extendedBookingsTypes.ExtendedBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadBookings();
  }, []);

  async function loadBookings() {
    setLoading(true);
    setError(null);
    try {
      const result = await extendedBookings.queryExtendedBookings({
        withBookingAllowedActions: true,
      }).limit(50).find();
      setItems(result.items);
    } catch (err) {
      console.error("Failed to load bookings:", err);
      setError(t('common.errorLoadBookings'));
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(bookingId: string, revision: string) {
    if (!confirm(t('common.confirmCancelAppointment'))) return;
    setActionLoading(bookingId);
    try {
      await bookings.cancelBooking(bookingId, {
        revision,
        participantNotification: { notifyParticipants: true },
      });
      await loadBookings();
    } catch (err) {
      console.error("Cancel error:", err);
      alert(t('common.errorCancelBooking'));
    } finally {
      setActionLoading(null);
    }
  }

  function getSlotDate(b: extendedBookingsTypes.ExtendedBooking) {
    const startDate = b.booking?.bookedEntity?.slot?.startDate;
    if (!startDate) return null;
    return new Date(startDate);
  }

  function getEndDate(b: extendedBookingsTypes.ExtendedBooking) {
    const endDate = b.booking?.bookedEntity?.slot?.endDate;
    if (!endDate) return null;
    return new Date(endDate);
  }

  function formatDate(d: Date) {
    return d.toLocaleDateString(i18n.getLocale(), { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }

  function formatTime(d: Date) {
    return d.toLocaleTimeString(i18n.getLocale(), { hour: "numeric", minute: "2-digit" });
  }

  function getServiceName(b: extendedBookingsTypes.ExtendedBooking) {
    return b.booking?.bookedEntity?.title ?? t('bookings.appointment');
  }

  function getStaffName(b: extendedBookingsTypes.ExtendedBooking) {
    return b.booking?.bookedEntity?.slot?.resource?.name ?? null;
  }

  function getStatusBadge(status: string | undefined) {
    const colors: Record<string, string> = {
      CONFIRMED: "#4caf50",
      PENDING: "#2196f3",
      CREATED: "#ff9800",
      CANCELED: "#f44336",
      DECLINED: "#f44336",
    };
    const s = status ?? "";
    return {
      background: colors[s] || "#888",
      label: s === "CONFIRMED" ? t('bookings.confirmed') : s === "PENDING" ? t('bookings.pending') : s === "CANCELED" ? t('bookings.canceled') : s === "DECLINED" ? t('bookings.declined') : s,
    };
  }

  const now = new Date();
  const upcoming = items.filter(b => {
    const d = getSlotDate(b);
    return d && d > now && b.booking?.status !== "CANCELED" && b.booking?.status !== "DECLINED";
  });
  const past = items.filter(b => {
    const d = getSlotDate(b);
    return (d && d <= now) || b.booking?.status === "CANCELED" || b.booking?.status === "DECLINED";
  });

  if (loading) {
    return <div style={{ textAlign: "center", padding: 40, color: "#999" }}>{t('common.loadingAppointments')}</div>;
  }

  if (error) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#f44336" }}>
        {error}
        <button onClick={loadBookings} style={styles.retryBtn}>{t('common.retry')}</button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={styles.empty}>
        <p>{t('member.emptyBookings')}</p>
        <a href="/bookings" style={styles.bookLink}>{t('bookings.visitMedicalBay')}</a>
      </div>
    );
  }

  return (
    <div>
      {upcoming.length > 0 && (
        <div>
          <h3 style={styles.sectionTitle}>{t('bookings.upcomingAppointments')}</h3>
          {upcoming.map(b => {
            const d = getSlotDate(b);
            const endD = getEndDate(b);
            const badge = getStatusBadge(b.booking?.status);
            const canCancel = b.allowedActions?.cancel;
            const canReschedule = b.allowedActions?.reschedule;

            return (
              <div key={b.booking?._id} style={styles.card}>
                <div style={styles.cardHeader}>
                  <div>
                    <div style={styles.serviceName}>{getServiceName(b)}</div>
                    {getStaffName(b) && <div style={styles.staffName}>{t('bookings.with')} {getStaffName(b)}</div>}
                  </div>
                  <span style={{ ...styles.badge, background: badge.background }}>{badge.label}</span>
                </div>
                <div style={styles.cardDetails}>
                  {d && (
                    <div style={styles.detailItem}>
                      <span style={styles.detailIcon}>&#128197;</span>
                      <span>{formatDate(d)}</span>
                    </div>
                  )}
                  {d && (
                    <div style={styles.detailItem}>
                      <span style={styles.detailIcon}>&#9200;</span>
                      <span>{formatTime(d)}{endD ? ` — ${formatTime(endD)}` : ""}</span>
                    </div>
                  )}
                </div>
                {(canCancel || canReschedule) && (
                  <div style={styles.cardActions}>
                    {canReschedule && <a href="/bookings" style={styles.rescheduleBtn}>{t('bookings.reschedule')}</a>}
                    {canCancel && b.booking?._id && b.booking?.revision && (
                      <button
                        onClick={() => handleCancel(b.booking!._id!, b.booking!.revision!)}
                        disabled={actionLoading === b.booking?._id}
                        style={styles.cancelBtn}
                      >
                        {actionLoading === b.booking?._id ? t('bookings.canceling') : t('bookings.cancel')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {past.length > 0 && (
        <div style={{ marginTop: upcoming.length > 0 ? 32 : 0 }}>
          <h3 style={styles.sectionTitle}>{t('bookings.pastAppointments')}</h3>
          {past.map(b => {
            const d = getSlotDate(b);
            const badge = getStatusBadge(b.booking?.status);
            return (
              <div key={b.booking?._id} style={{ ...styles.card, opacity: 0.6 }}>
                <div style={styles.cardHeader}>
                  <div>
                    <div style={styles.serviceName}>{getServiceName(b)}</div>
                    {getStaffName(b) && <div style={styles.staffName}>{t('bookings.with')} {getStaffName(b)}</div>}
                  </div>
                  <span style={{ ...styles.badge, background: badge.background }}>{badge.label}</span>
                </div>
                {d && (
                  <div style={styles.cardDetails}>
                    <div style={styles.detailItem}>
                      <span style={styles.detailIcon}>&#128197;</span>
                      <span>{formatDate(d)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 24 }}>
        <a href="/bookings" style={styles.bookLink}>{t('bookings.bookNewAppointment')}</a>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  empty: { padding: 30, background: "#111", border: "1px solid #222", borderRadius: 12, textAlign: "center", color: "#666" },
  bookLink: { display: "inline-block", color: "#ff6600", fontFamily: "'Bangers', cursive", fontSize: "0.9rem", letterSpacing: 1, textDecoration: "none", marginTop: 8 },
  retryBtn: { display: "block", margin: "12px auto 0", background: "none", border: "1px solid #333", color: "#999", padding: "8px 16px", borderRadius: 8, cursor: "pointer" },
  sectionTitle: { fontFamily: "'Bangers', cursive", fontSize: "1.1rem", color: "#ffcc00", letterSpacing: 1, marginBottom: 12 },
  card: { background: "#111", border: "1px solid #222", borderRadius: 12, padding: 20, marginBottom: 12 },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 12 },
  serviceName: { fontFamily: "'Bangers', cursive", fontSize: "1.1rem", color: "#ffcc00", letterSpacing: 1 },
  staffName: { fontSize: "0.8rem", color: "#999", marginTop: 2 },
  badge: { fontSize: "0.65rem", fontFamily: "'Bangers', cursive", letterSpacing: 1, padding: "4px 12px", borderRadius: 12, color: "#000", whiteSpace: "nowrap", flexShrink: 0 },
  cardDetails: { display: "flex", gap: 20, flexWrap: "wrap" },
  detailItem: { display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "#ccc" },
  detailIcon: { fontSize: "0.9rem" },
  cardActions: { marginTop: 12, paddingTop: 12, borderTop: "1px solid #222", display: "flex", gap: 8, justifyContent: "flex-end" },
  rescheduleBtn: { padding: "6px 16px", background: "transparent", color: "#ff6600", border: "1px solid #ff6600", borderRadius: 8, fontSize: "0.75rem", fontFamily: "'Bangers', cursive", letterSpacing: 1, cursor: "pointer", textDecoration: "none" },
  cancelBtn: { padding: "6px 16px", background: "transparent", color: "#f44336", border: "1px solid rgba(244,67,54,0.3)", borderRadius: 8, fontSize: "0.75rem", fontFamily: "'Bangers', cursive", letterSpacing: 1, cursor: "pointer" },
};
