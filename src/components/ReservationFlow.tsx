"use client";
import React, { useState } from "react";
import { reservations, timeSlots } from "@wix/table-reservations";
import { redirects } from "@wix/redirects";
import { i18n } from "@wix/essentials";

interface Props {
  reservationLocationId: string;
  defaultName?: string;
  defaultEmail?: string;
  defaultPhone?: string;
}

interface TimeSlotInfo {
  startDate: string;
  status: string;
  duration: number;
}

type Step = "search" | "slots" | "details" | "confirm";

export default function ReservationFlow({ reservationLocationId, defaultName, defaultEmail, defaultPhone }: Props) {
  const t = i18n.getTranslationFunction();
  const locale = i18n.getLocale();

  const [step, setStep] = useState<Step>("search");
  const [partySize, setPartySize] = useState(2);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedHour, setSelectedHour] = useState("19:00");
  const [availableSlots, setAvailableSlots] = useState<TimeSlotInfo[]>([]);
  const [chosenSlot, setChosenSlot] = useState<TimeSlotInfo | null>(null);
  const [guestName, setGuestName] = useState(defaultName || "");
  const [guestEmail, setGuestEmail] = useState(defaultEmail || "");
  const [guestPhone, setGuestPhone] = useState(defaultPhone || "");
  const [specialRequests, setSpecialRequests] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const hours = Array.from({ length: 13 }, (_, i) => {
    const h = 11 + i;
    return `${h.toString().padStart(2, "0")}:00`;
  });

  function getMinDate() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }

  function getMaxDate() {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr + "T12:00:00").toLocaleDateString(locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }

  function formatSlotTime(isoDate: string) {
    return new Date(isoDate).toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  async function handleFindSlots() {
    if (!selectedDate || !selectedHour) return;
    setLoading(true);
    setError(null);
    try {
      const requestDate = new Date(`${selectedDate}T${selectedHour}:00`);
      const result = await timeSlots.getTimeSlots(
        reservationLocationId,
        requestDate,
        partySize,
        { slotsBefore: 3, slotsAfter: 6 },
      );
      const slots: TimeSlotInfo[] = (result.timeSlots || []).map((s: any) => ({
        startDate: typeof s.startDate === "string" ? s.startDate : new Date(s.startDate).toISOString(),
        status: s.status || "UNAVAILABLE",
        duration: s.duration || 90,
      }));
      setAvailableSlots(slots);
      setStep("slots");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch time slots");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!chosenSlot) return;
    setLoading(true);
    setError(null);
    try {
      const result = await reservations.createReservation({
        details: {
          reservationLocationId,
          startDate: new Date(chosenSlot.startDate),
          partySize,
        },
        reservee: {
          firstName: guestName.split(" ")[0] || "",
          lastName: guestName.split(" ").slice(1).join(" ") || "",
          email: guestEmail,
          phone: guestPhone,
        },
        teamMessage: specialRequests || undefined,
      } as any);

      const res = result as any;
      const paymentStatus = res?.paymentStatus || res?.reservation?.paymentStatus;

      if (paymentStatus === "NOT_PAID") {
        const reservationId = res?._id || res?.reservation?._id;
        if (reservationId) {
          const { redirectSession } = await redirects.createRedirectSession({
            ecomCheckout: { checkoutId: reservationId },
            callbacks: {
              thankYouPageUrl: window.location.origin + "/restaurant/thank-you",
              postFlowUrl: window.location.origin + "/restaurant/reserve",
            },
          });
          if (redirectSession?.fullUrl) {
            window.location.href = redirectSession.fullUrl;
            return;
          }
        }
      }

      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("restaurant.reservationFailed"));
    } finally {
      setLoading(false);
    }
  }

  const stepLabels: Record<Step, string> = {
    search: t("restaurant.selectDate"),
    slots: t("restaurant.selectTime"),
    details: t("restaurant.reserveDetails"),
    confirm: t("restaurant.reserveConfirm"),
  };

  const allSteps: Step[] = ["search", "slots", "details", "confirm"];

  if (success) {
    return (
      <div style={styles.container}>
        <div style={styles.successBox}>
          <h3 style={styles.successTitle}>{t("restaurant.reservationConfirmed")}</h3>
          <p style={styles.successText}>{t("restaurant.reservationConfirmedText")}</p>
          <div style={styles.summaryCard}>
            <SummaryRow label={t("restaurant.reserveDate")} value={chosenSlot ? formatDate(selectedDate) : ""} />
            <SummaryRow label={t("restaurant.reserveTime")} value={chosenSlot ? formatSlotTime(chosenSlot.startDate) : ""} />
            <SummaryRow label={t("restaurant.reserveParty")} value={`${partySize} ${t("restaurant.guests")}`} />
            <SummaryRow label={t("restaurant.guestName")} value={guestName} />
          </div>
          <a href="/restaurant" style={styles.backLink}>{t("restaurant.backToMenu")}</a>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>{t("restaurant.reserveTitle")}</h3>

      <div style={styles.progress}>
        {allSteps.map((s, i) => {
          const currentIdx = allSteps.indexOf(step);
          const isActive = i <= currentIdx;
          return (
            <div key={s} style={{ ...styles.progressStep, opacity: isActive ? 1 : 0.3 }}>
              <div style={{ ...styles.progressDot, background: isActive ? "#ff6600" : "#333" }} />
              <span style={styles.progressLabel}>{stepLabels[s]}</span>
            </div>
          );
        })}
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {step === "search" && (
        <div>
          <div style={styles.searchRow}>
            <div style={styles.searchField}>
              <label style={styles.fieldLabel}>{t("restaurant.partySize")}</label>
              <select
                value={partySize}
                onChange={(e) => setPartySize(Number(e.target.value))}
                style={styles.select}
              >
                {Array.from({ length: 8 }, (_, i) => i + 1).map((size) => (
                  <option key={size} value={size}>{size} {t("restaurant.guests")}</option>
                ))}
              </select>
            </div>

            <div style={styles.searchField}>
              <label style={styles.fieldLabel}>{t("restaurant.selectDate")}</label>
              <input
                type="date"
                value={selectedDate}
                min={getMinDate()}
                max={getMaxDate()}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={styles.select}
              />
            </div>

            <div style={styles.searchField}>
              <label style={styles.fieldLabel}>{t("restaurant.selectTime")}</label>
              <select
                value={selectedHour}
                onChange={(e) => setSelectedHour(e.target.value)}
                style={styles.select}
              >
                {hours.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={handleFindSlots}
            disabled={!selectedDate || loading}
            style={{ ...styles.primaryBtn, marginTop: 16, opacity: selectedDate ? 1 : 0.5 }}
          >
            {loading ? t("restaurant.processing") : t("restaurant.findAvailability")}
          </button>
        </div>
      )}

      {step === "slots" && (
        <div>
          <p style={styles.stepLabel}>
            {formatDate(selectedDate)} &middot; {partySize} {t("restaurant.guests")}
            <button onClick={() => setStep("search")} style={styles.changeBtn}>{t("restaurant.change")}</button>
          </p>
          <p style={{ ...styles.stepLabel, fontWeight: 600 }}>{t("restaurant.selectTime")}</p>

          {availableSlots.length === 0 ? (
            <p style={{ color: "#999", fontSize: "0.85rem" }}>{t("restaurant.noSlotsAvailable")}</p>
          ) : (
            <div style={styles.slotsGrid}>
              {availableSlots.map((slot) => {
                const isAvailable = slot.status === "AVAILABLE";
                const isSelected = chosenSlot?.startDate === slot.startDate;
                return (
                  <button
                    key={slot.startDate}
                    disabled={!isAvailable}
                    onClick={() => setChosenSlot(slot)}
                    style={{
                      ...styles.slotBtn,
                      borderColor: isSelected ? "#ff6600" : isAvailable ? "#333" : "#222",
                      background: isSelected
                        ? "rgba(255, 102, 0, 0.2)"
                        : isAvailable
                          ? "#1a1a1a"
                          : "#111",
                      color: isAvailable ? "#e0e0e0" : "#444",
                      cursor: isAvailable ? "pointer" : "not-allowed",
                      opacity: isAvailable ? 1 : 0.4,
                    }}
                  >
                    {formatSlotTime(slot.startDate)}
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ ...styles.formActions, marginTop: 16 }}>
            <button onClick={() => setStep("search")} style={styles.secondaryBtn}>{t("restaurant.back")}</button>
            <button
              onClick={() => setStep("details")}
              disabled={!chosenSlot}
              style={{ ...styles.primaryBtn, flex: 1, opacity: chosenSlot ? 1 : 0.5 }}
            >
              {t("restaurant.next")}
            </button>
          </div>
        </div>
      )}

      {step === "details" && (
        <div>
          <p style={styles.stepLabel}>
            {formatDate(selectedDate)} &middot; {chosenSlot ? formatSlotTime(chosenSlot.startDate) : ""} &middot; {partySize} {t("restaurant.guests")}
          </p>
          <p style={{ ...styles.stepLabel, fontWeight: 600 }}>{t("restaurant.guestDetails")}</p>
          <div style={styles.form}>
            <input
              type="text"
              placeholder={t("restaurant.guestNamePlaceholder")}
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              style={styles.input}
            />
            <input
              type="email"
              placeholder={t("restaurant.guestEmailPlaceholder")}
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              style={styles.input}
            />
            <input
              type="tel"
              placeholder={t("restaurant.guestPhonePlaceholder")}
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              style={styles.input}
            />
            <textarea
              placeholder={t("restaurant.specialRequestsPlaceholder")}
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              rows={3}
              style={{ ...styles.input, resize: "vertical" as const }}
            />
          </div>
          <div style={styles.formActions}>
            <button onClick={() => setStep("slots")} style={styles.secondaryBtn}>{t("restaurant.back")}</button>
            <button
              onClick={() => setStep("confirm")}
              disabled={!guestName || !guestEmail}
              style={{ ...styles.primaryBtn, flex: 1, opacity: guestName && guestEmail ? 1 : 0.5 }}
            >
              {t("restaurant.next")}
            </button>
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div>
          <p style={{ ...styles.stepLabel, fontWeight: 600 }}>{t("restaurant.confirmReservation")}</p>
          <div style={styles.summaryCard}>
            <SummaryRow label={t("restaurant.reserveDate")} value={formatDate(selectedDate)} />
            <SummaryRow label={t("restaurant.reserveTime")} value={chosenSlot ? formatSlotTime(chosenSlot.startDate) : ""} />
            <SummaryRow label={t("restaurant.reserveParty")} value={`${partySize} ${t("restaurant.guests")}`} />
            <SummaryRow label={t("restaurant.guestName")} value={guestName} />
            <SummaryRow label={t("restaurant.guestEmail")} value={guestEmail} />
            {guestPhone && <SummaryRow label={t("restaurant.guestPhone")} value={guestPhone} />}
            {specialRequests && <SummaryRow label={t("restaurant.specialRequests")} value={specialRequests} />}
          </div>
          <div style={styles.formActions}>
            <button onClick={() => setStep("details")} style={styles.secondaryBtn}>{t("restaurant.back")}</button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              style={{ ...styles.primaryBtn, flex: 1 }}
            >
              {loading ? t("restaurant.processing") : t("restaurant.confirmReservation")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.summaryRow}>
      <span style={styles.summaryLabel}>{label}</span>
      <span style={styles.summaryValue}>{value}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: "#111",
    border: "1px solid #222",
    borderRadius: 12,
    padding: 24,
  },
  title: {
    fontFamily: "'Bangers', cursive",
    fontSize: "1.3rem",
    color: "#ffcc00",
    letterSpacing: 1,
    marginBottom: 16,
  },
  progress: {
    display: "flex",
    gap: 12,
    marginBottom: 20,
    paddingBottom: 16,
    borderBottom: "1px solid #222",
    flexWrap: "wrap",
  },
  progressStep: { display: "flex", alignItems: "center", gap: 6 },
  progressDot: { width: 8, height: 8, borderRadius: "50%" },
  progressLabel: {
    fontSize: "0.7rem",
    color: "#999",
    fontFamily: "'Bangers', cursive",
    letterSpacing: 1,
  },
  stepLabel: {
    fontSize: "0.85rem",
    color: "#ccc",
    marginBottom: 12,
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap" as const,
  },
  error: {
    background: "rgba(244, 67, 54, 0.1)",
    border: "1px solid rgba(244, 67, 54, 0.3)",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: "0.8rem",
    color: "#f44336",
    marginBottom: 12,
  },
  dateInput: {
    width: "100%",
    padding: "12px 16px",
    background: "#1a1a1a",
    border: "1px solid #333",
    borderRadius: 8,
    color: "#e0e0e0",
    fontSize: "0.9rem",
    marginBottom: 12,
    boxSizing: "border-box" as const,
    colorScheme: "dark",
  },
  searchRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 12,
  },
  searchField: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  fieldLabel: {
    fontSize: "0.75rem",
    color: "#888",
    fontFamily: "'Bangers', cursive",
    letterSpacing: 1,
  },
  select: {
    width: "100%",
    padding: "12px 16px",
    background: "#1a1a1a",
    border: "1px solid #333",
    borderRadius: 8,
    color: "#e0e0e0",
    fontSize: "0.9rem",
    boxSizing: "border-box" as const,
    colorScheme: "dark",
    appearance: "auto" as const,
  },
  slotsGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 },
  slotBtn: {
    padding: "10px 8px",
    background: "#1a1a1a",
    border: "1px solid #333",
    borderRadius: 8,
    color: "#e0e0e0",
    fontSize: "0.85rem",
    cursor: "pointer",
    transition: "all 0.2s",
    fontWeight: 600,
  },
  primaryBtn: {
    width: "100%",
    padding: "12px 24px",
    background: "#ff6600",
    color: "#000",
    border: "none",
    borderRadius: 8,
    fontFamily: "'Bangers', cursive",
    fontSize: "1rem",
    letterSpacing: 1,
    cursor: "pointer",
  },
  secondaryBtn: {
    padding: "10px 20px",
    background: "transparent",
    color: "#999",
    border: "1px solid #333",
    borderRadius: 8,
    fontFamily: "'Bangers', cursive",
    fontSize: "0.85rem",
    letterSpacing: 1,
    cursor: "pointer",
  },
  changeBtn: {
    background: "none",
    border: "none",
    color: "#ff6600",
    fontSize: "0.75rem",
    cursor: "pointer",
    textDecoration: "underline",
    padding: 0,
  },
  form: { display: "flex", flexDirection: "column" as const, gap: 12, marginBottom: 16 },
  input: {
    width: "100%",
    padding: "12px 16px",
    background: "#1a1a1a",
    border: "1px solid #333",
    borderRadius: 8,
    color: "#e0e0e0",
    fontSize: "0.9rem",
    boxSizing: "border-box" as const,
    fontFamily: "inherit",
  },
  formActions: { display: "flex", gap: 8 },
  summaryCard: { background: "#1a1a1a", borderRadius: 8, padding: 16, marginBottom: 16 },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: "1px solid #222",
  },
  summaryLabel: {
    fontSize: "0.75rem",
    color: "#666",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  summaryValue: {
    fontSize: "0.8rem",
    color: "#e0e0e0",
    fontWeight: 600,
    textAlign: "right" as const,
    maxWidth: "60%",
  },
  successBox: { textAlign: "center" as const, padding: 24 },
  successTitle: {
    fontFamily: "'Bangers', cursive",
    fontSize: "1.5rem",
    color: "#ffcc00",
    letterSpacing: 1,
    marginBottom: 8,
  },
  successText: { fontSize: "0.9rem", color: "#999", marginBottom: 20 },
  backLink: {
    display: "inline-block",
    marginTop: 16,
    color: "#ff6600",
    fontSize: "0.85rem",
    textDecoration: "underline",
  },
};
