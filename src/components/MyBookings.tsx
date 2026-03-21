"use client";
import React, { useState, useEffect } from "react";
import { httpClient } from "@wix/essentials";

interface Booking {
  id: string;
  status: string;
  startDate?: string;
  endDate?: string;
  serviceName?: string;
  staffMemberName?: string;
  allowedActions?: string[];
  bookedEntity?: {
    item?: {
      slot?: {
        startDate?: string;
        endDate?: string;
        resource?: { name?: string };
        location?: { name?: string };
        sessionId?: string;
      };
      schedule?: {
        serviceName?: string;
      };
    };
    title?: string;
  };
  formInfo?: {
    contactDetails?: {
      firstName?: string;
      lastName?: string;
    };
  };
}

export default function MyBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
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
      const res = await httpClient.fetchWithAuth(
        "https://www.wixapis.com/bookings/bookings-reader/v2/extended-bookings/query",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: {
              sort: [{ fieldName: "createdDate", order: "DESC" }],
              cursorPaging: { limit: 50 },
            },
            withBookingAllowedActions: true,
          }),
        }
      );
      const data = await res.json();
      setBookings(data.bookings || []);
    } catch (err) {
      console.error("Failed to load bookings:", err);
      setError("Failed to load your bookings.");
    } finally {
      setLoading(false);
    }
  }

  async function cancelBooking(bookingId: string) {
    if (!confirm("Are you sure you want to cancel this appointment?")) return;
    setActionLoading(bookingId);
    try {
      await httpClient.fetchWithAuth(
        `https://www.wixapis.com/bookings/v2/bookings/${bookingId}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participantNotification: { notifyParticipants: true } }),
        }
      );
      await loadBookings();
    } catch (err) {
      console.error("Cancel error:", err);
      alert("Failed to cancel the booking. It may be too close to the appointment time.");
    } finally {
      setActionLoading(null);
    }
  }

  function getSlotDate(booking: Booking) {
    const startDate = booking.bookedEntity?.item?.slot?.startDate || booking.startDate;
    if (!startDate) return null;
    return new Date(startDate);
  }

  function formatDate(d: Date) {
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatTime(d: Date) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function getServiceName(booking: Booking) {
    return (
      booking.bookedEntity?.title ||
      booking.bookedEntity?.item?.schedule?.serviceName ||
      booking.serviceName ||
      "Appointment"
    );
  }

  function getStaffName(booking: Booking) {
    return (
      booking.bookedEntity?.item?.slot?.resource?.name ||
      booking.staffMemberName ||
      null
    );
  }

  function getStatusBadge(status: string) {
    const colors: Record<string, string> = {
      CONFIRMED: "#4caf50",
      PENDING: "#2196f3",
      CREATED: "#ff9800",
      CANCELED: "#f44336",
      DECLINED: "#f44336",
    };
    return {
      background: colors[status] || "#888",
      label: status === "CONFIRMED" ? "Confirmed" : status === "PENDING" ? "Pending" : status === "CANCELED" ? "Canceled" : status === "DECLINED" ? "Declined" : status,
    };
  }

  const now = new Date();
  const upcoming = bookings.filter(b => {
    const d = getSlotDate(b);
    return d && d > now && b.status !== "CANCELED" && b.status !== "DECLINED";
  });
  const past = bookings.filter(b => {
    const d = getSlotDate(b);
    return (d && d <= now) || b.status === "CANCELED" || b.status === "DECLINED";
  });

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#999" }}>
        Loading your appointments...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#f44336" }}>
        {error}
        <button onClick={loadBookings} style={styles.retryBtn}>Retry</button>
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div style={styles.empty}>
        <p>You don't have any appointments yet.</p>
        <a href="/bookings" style={styles.bookLink}>Visit Medical Bay</a>
      </div>
    );
  }

  return (
    <div>
      {upcoming.length > 0 && (
        <div>
          <h3 style={styles.sectionTitle}>Upcoming Appointments</h3>
          {upcoming.map(b => {
            const d = getSlotDate(b);
            const endDate = b.bookedEntity?.item?.slot?.endDate || b.endDate;
            const endD = endDate ? new Date(endDate) : null;
            const badge = getStatusBadge(b.status);
            const canCancel = b.allowedActions?.includes("CANCEL");
            const canReschedule = b.allowedActions?.includes("RESCHEDULE");

            return (
              <div key={b.id} style={styles.card}>
                <div style={styles.cardHeader}>
                  <div>
                    <div style={styles.serviceName}>{getServiceName(b)}</div>
                    {getStaffName(b) && (
                      <div style={styles.staffName}>with {getStaffName(b)}</div>
                    )}
                  </div>
                  <span style={{ ...styles.badge, background: badge.background }}>
                    {badge.label}
                  </span>
                </div>
                <div style={styles.cardDetails}>
                  {d && (
                    <div style={styles.detailItem}>
                      <span style={styles.detailIcon}>📅</span>
                      <span>{formatDate(d)}</span>
                    </div>
                  )}
                  {d && (
                    <div style={styles.detailItem}>
                      <span style={styles.detailIcon}>⏰</span>
                      <span>{formatTime(d)}{endD ? ` — ${formatTime(endD)}` : ""}</span>
                    </div>
                  )}
                </div>
                {(canCancel || canReschedule) && (
                  <div style={styles.cardActions}>
                    {canReschedule && (
                      <a href={`/bookings`} style={styles.rescheduleBtn}>
                        Reschedule
                      </a>
                    )}
                    {canCancel && (
                      <button
                        onClick={() => cancelBooking(b.id)}
                        disabled={actionLoading === b.id}
                        style={styles.cancelBtn}
                      >
                        {actionLoading === b.id ? "Canceling..." : "Cancel"}
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
          <h3 style={styles.sectionTitle}>Past Appointments</h3>
          {past.map(b => {
            const d = getSlotDate(b);
            const badge = getStatusBadge(b.status);

            return (
              <div key={b.id} style={{ ...styles.card, opacity: 0.6 }}>
                <div style={styles.cardHeader}>
                  <div>
                    <div style={styles.serviceName}>{getServiceName(b)}</div>
                    {getStaffName(b) && (
                      <div style={styles.staffName}>with {getStaffName(b)}</div>
                    )}
                  </div>
                  <span style={{ ...styles.badge, background: badge.background }}>
                    {badge.label}
                  </span>
                </div>
                {d && (
                  <div style={styles.cardDetails}>
                    <div style={styles.detailItem}>
                      <span style={styles.detailIcon}>📅</span>
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
        <a href="/bookings" style={styles.bookLink}>Book New Appointment</a>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  empty: {
    padding: 30,
    background: "#111",
    border: "1px solid #222",
    borderRadius: 12,
    textAlign: "center",
    color: "#666",
  },
  bookLink: {
    display: "inline-block",
    color: "#ff6600",
    fontFamily: "'Bangers', cursive",
    fontSize: "0.9rem",
    letterSpacing: 1,
    textDecoration: "none",
    marginTop: 8,
  },
  retryBtn: {
    display: "block",
    margin: "12px auto 0",
    background: "none",
    border: "1px solid #333",
    color: "#999",
    padding: "8px 16px",
    borderRadius: 8,
    cursor: "pointer",
  },
  sectionTitle: {
    fontFamily: "'Bangers', cursive",
    fontSize: "1.1rem",
    color: "#ffcc00",
    letterSpacing: 1,
    marginBottom: 12,
  },
  card: {
    background: "#111",
    border: "1px solid #222",
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
    gap: 12,
  },
  serviceName: {
    fontFamily: "'Bangers', cursive",
    fontSize: "1.1rem",
    color: "#ffcc00",
    letterSpacing: 1,
  },
  staffName: {
    fontSize: "0.8rem",
    color: "#999",
    marginTop: 2,
  },
  badge: {
    fontSize: "0.65rem",
    fontFamily: "'Bangers', cursive",
    letterSpacing: 1,
    padding: "4px 12px",
    borderRadius: 12,
    color: "#000",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  cardDetails: {
    display: "flex",
    gap: 20,
    flexWrap: "wrap",
  },
  detailItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: "0.8rem",
    color: "#ccc",
  },
  detailIcon: {
    fontSize: "0.9rem",
  },
  cardActions: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid #222",
    display: "flex",
    gap: 8,
    justifyContent: "flex-end",
  },
  rescheduleBtn: {
    padding: "6px 16px",
    background: "transparent",
    color: "#ff6600",
    border: "1px solid #ff6600",
    borderRadius: 8,
    fontSize: "0.75rem",
    fontFamily: "'Bangers', cursive",
    letterSpacing: 1,
    cursor: "pointer",
    textDecoration: "none",
  },
  cancelBtn: {
    padding: "6px 16px",
    background: "transparent",
    color: "#f44336",
    border: "1px solid rgba(244,67,54,0.3)",
    borderRadius: 8,
    fontSize: "0.75rem",
    fontFamily: "'Bangers', cursive",
    letterSpacing: 1,
    cursor: "pointer",
  },
};
