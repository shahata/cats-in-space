"use client";
import React, { useState } from "react";
import { reservations } from "@wix/table-reservations";
import { i18n } from "@wix/essentials";

interface Props {
  reservationLocationId: string;
}

type Step = "date" | "time" | "party" | "details" | "confirm";

export default function ReservationFlow({ reservationLocationId }: Props) {
  const t = i18n.getTranslationFunction();
  const [step, setStep] = useState<Step>("date");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const timeSlots = Array.from({ length: 11 }, (_, i) => {
    const hour = 11 + i;
    return `${hour.toString().padStart(2, "0")}:00`;
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

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      const startDate = new Date(`${selectedDate}T${selectedTime}:00`);

      await reservations.createReservation({
        details: {
          reservationLocationId,
          startDate: startDate,
          partySize,
        },
        reservee: {
          firstName: guestName.split(" ")[0] || "",
          lastName: guestName.split(" ").slice(1).join(" ") || "",
          email: guestEmail,
          phone: guestPhone,
        },
        teamMessage: specialRequests || null,
      });
      setSuccess(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("restaurant.reservationFailed")
      );
    } finally {
      setLoading(false);
    }
  }

  const steps: Step[] = ["date", "time", "party", "details", "confirm"];
  const stepLabels: Record<Step, string> = {
    date: t("restaurant.reserveDate"),
    time: t("restaurant.reserveTime"),
    party: t("restaurant.reserveParty"),
    details: t("restaurant.reserveDetails"),
    confirm: t("restaurant.reserveConfirm"),
  };

  if (success) {
    return (
      <div style={styles.container}>
        <div style={styles.successBox}>
          <div style={{ fontSize: "3rem", marginBottom: 16 }}>&#127881;</div>
          <h3 style={styles.successTitle}>
            {t("restaurant.reservationConfirmed")}
          </h3>
          <p style={styles.successText}>
            {t("restaurant.reservationConfirmedText")}
          </p>
          <div style={styles.summaryCard}>
            <div style={styles.summaryRow}>
              <span style={styles.summaryLabel}>
                {t("restaurant.reserveDate")}
              </span>
              <span style={styles.summaryValue}>
                {selectedDate &&
                  new Date(selectedDate + "T12:00:00").toLocaleDateString(
                    i18n.getLocale(),
                    { weekday: "long", month: "long", day: "numeric" }
                  )}
              </span>
            </div>
            <div style={styles.summaryRow}>
              <span style={styles.summaryLabel}>
                {t("restaurant.reserveTime")}
              </span>
              <span style={styles.summaryValue}>{selectedTime}</span>
            </div>
            <div style={styles.summaryRow}>
              <span style={styles.summaryLabel}>
                {t("restaurant.reserveParty")}
              </span>
              <span style={styles.summaryValue}>
                {partySize} {t("restaurant.guests")}
              </span>
            </div>
          </div>
          <a href="/restaurant" style={styles.backLink}>
            {t("restaurant.backToMenu")}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>{t("restaurant.reserveTitle")}</h3>

      <div style={styles.progress}>
        {steps.map((s, i) => {
          const currentIdx = steps.indexOf(step);
          const isActive = i <= currentIdx;
          return (
            <div
              key={s}
              style={{ ...styles.progressStep, opacity: isActive ? 1 : 0.3 }}
            >
              <div
                style={{
                  ...styles.progressDot,
                  background: isActive ? "#ff6600" : "#333",
                }}
              />
              <span style={styles.progressLabel}>{stepLabels[s]}</span>
            </div>
          );
        })}
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {step === "date" && (
        <div>
          <p style={styles.stepLabel}>{t("restaurant.selectDate")}</p>
          <input
            type="date"
            value={selectedDate}
            min={getMinDate()}
            max={getMaxDate()}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={styles.dateInput}
          />
          <button
            onClick={() => setStep("time")}
            disabled={!selectedDate}
            style={{
              ...styles.primaryBtn,
              opacity: selectedDate ? 1 : 0.5,
            }}
          >
            {t("restaurant.next")}
          </button>
        </div>
      )}

      {step === "time" && (
        <div>
          <p style={styles.stepLabel}>
            {selectedDate &&
              new Date(selectedDate + "T12:00:00").toLocaleDateString(
                i18n.getLocale(),
                { weekday: "long", month: "long", day: "numeric" }
              )}
            <button onClick={() => setStep("date")} style={styles.changeBtn}>
              {t("restaurant.change")}
            </button>
          </p>
          <p style={styles.stepLabel}>{t("restaurant.selectTime")}</p>
          <div style={styles.slotsGrid}>
            {timeSlots.map((time) => (
              <button
                key={time}
                onClick={() => {
                  setSelectedTime(time);
                  setStep("party");
                }}
                style={{
                  ...styles.slotBtn,
                  borderColor: selectedTime === time ? "#ff6600" : "#333",
                  background:
                    selectedTime === time
                      ? "rgba(255, 102, 0, 0.15)"
                      : "#1a1a1a",
                }}
              >
                {time}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "party" && (
        <div>
          <p style={styles.stepLabel}>
            {selectedDate &&
              new Date(selectedDate + "T12:00:00").toLocaleDateString(
                i18n.getLocale(),
                { weekday: "long", month: "long", day: "numeric" }
              )}{" "}
            {t("restaurant.at")} {selectedTime}
            <button onClick={() => setStep("time")} style={styles.changeBtn}>
              {t("restaurant.change")}
            </button>
          </p>
          <p style={styles.stepLabel}>{t("restaurant.selectPartySize")}</p>
          <div style={styles.partySizeGrid}>
            {Array.from({ length: 8 }, (_, i) => i + 1).map((size) => (
              <button
                key={size}
                onClick={() => {
                  setPartySize(size);
                  setStep("details");
                }}
                style={{
                  ...styles.partySizeBtn,
                  borderColor: partySize === size ? "#ff6600" : "#333",
                  background:
                    partySize === size
                      ? "rgba(255, 102, 0, 0.15)"
                      : "#1a1a1a",
                  color: partySize === size ? "#ff6600" : "#e0e0e0",
                }}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "details" && (
        <div>
          <p style={styles.stepLabel}>{t("restaurant.guestDetails")}</p>
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
            <button onClick={() => setStep("party")} style={styles.secondaryBtn}>
              {t("restaurant.back")}
            </button>
            <button
              onClick={() => setStep("confirm")}
              disabled={!guestName || !guestEmail}
              style={{
                ...styles.primaryBtn,
                flex: 1,
                opacity: guestName && guestEmail ? 1 : 0.5,
              }}
            >
              {t("restaurant.reviewReservation")}
            </button>
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div>
          <p style={styles.stepLabel}>{t("restaurant.confirmReservation")}</p>
          <div style={styles.summaryCard}>
            <div style={styles.summaryRow}>
              <span style={styles.summaryLabel}>
                {t("restaurant.reserveDate")}
              </span>
              <span style={styles.summaryValue}>
                {selectedDate &&
                  new Date(selectedDate + "T12:00:00").toLocaleDateString(
                    i18n.getLocale(),
                    {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    }
                  )}
              </span>
            </div>
            <div style={styles.summaryRow}>
              <span style={styles.summaryLabel}>
                {t("restaurant.reserveTime")}
              </span>
              <span style={styles.summaryValue}>{selectedTime}</span>
            </div>
            <div style={styles.summaryRow}>
              <span style={styles.summaryLabel}>
                {t("restaurant.reserveParty")}
              </span>
              <span style={styles.summaryValue}>
                {partySize} {t("restaurant.guests")}
              </span>
            </div>
            <div style={styles.summaryRow}>
              <span style={styles.summaryLabel}>
                {t("restaurant.guestName")}
              </span>
              <span style={styles.summaryValue}>{guestName}</span>
            </div>
            <div style={styles.summaryRow}>
              <span style={styles.summaryLabel}>
                {t("restaurant.guestEmail")}
              </span>
              <span style={styles.summaryValue}>{guestEmail}</span>
            </div>
            {guestPhone && (
              <div style={styles.summaryRow}>
                <span style={styles.summaryLabel}>
                  {t("restaurant.guestPhone")}
                </span>
                <span style={styles.summaryValue}>{guestPhone}</span>
              </div>
            )}
            {specialRequests && (
              <div style={styles.summaryRow}>
                <span style={styles.summaryLabel}>
                  {t("restaurant.specialRequests")}
                </span>
                <span style={styles.summaryValue}>{specialRequests}</span>
              </div>
            )}
          </div>

          <div style={styles.formActions}>
            <button
              onClick={() => setStep("details")}
              style={styles.secondaryBtn}
            >
              {t("restaurant.back")}
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              style={{ ...styles.primaryBtn, flex: 1 }}
            >
              {loading
                ? t("restaurant.processing")
                : t("restaurant.confirmReservation")}
            </button>
          </div>
        </div>
      )}
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
  progressStep: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
  },
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
    transition: "background 0.2s",
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
  slotsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 8,
  },
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
  partySizeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 8,
  },
  partySizeBtn: {
    padding: "14px 8px",
    borderRadius: 8,
    border: "1px solid #333",
    cursor: "pointer",
    fontSize: "1.1rem",
    fontWeight: 700,
    transition: "all 0.2s",
    textAlign: "center" as const,
  },
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 12,
    marginBottom: 16,
  },
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
  formActions: {
    display: "flex",
    gap: 8,
  },
  summaryCard: {
    background: "#1a1a1a",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
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
  successBox: {
    textAlign: "center" as const,
    padding: 24,
  },
  successTitle: {
    fontFamily: "'Bangers', cursive",
    fontSize: "1.5rem",
    color: "#ffcc00",
    letterSpacing: 1,
    marginBottom: 8,
  },
  successText: {
    fontSize: "0.9rem",
    color: "#999",
    marginBottom: 20,
  },
  backLink: {
    display: "inline-block",
    marginTop: 16,
    color: "#ff6600",
    fontSize: "0.85rem",
    textDecoration: "underline",
  },
};
