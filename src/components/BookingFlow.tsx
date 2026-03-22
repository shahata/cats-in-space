"use client";
import React, { useState, useEffect } from "react";
import { availabilityCalendar } from "@wix/bookings";
import type { availabilityCalendar as availabilityTypes } from "@wix/bookings";
import { redirects } from "@wix/redirects";
import { i18n } from "@wix/essentials";

interface StaffInfo {
  id: string;
  name: string;
  description: string;
  emoji: string;
  imageUrl?: string;
}

interface BookingFlowProps {
  serviceId: string;
  serviceName: string;
  duration: number;
  staff: StaffInfo[];
}

export default function BookingFlow({ serviceId, serviceName, duration, staff }: BookingFlowProps) {
  const t = i18n.getTranslationFunction();
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [availabilityEntries, setAvailabilityEntries] = useState<availabilityTypes.SlotAvailability[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<availabilityTypes.SlotAvailability | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"staff" | "date" | "time" | "confirm">("staff");

  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setSelectedDate(tomorrow.toISOString().split("T")[0]!);
  }, []);

  useEffect(() => {
    if (staff.length === 1) {
      setSelectedStaff(staff[0]!.id);
      setStep("date");
    }
  }, [staff]);

  async function fetchAvailability() {
    if (!selectedDate) return;
    setLoading(true);
    setError(null);
    setAvailabilityEntries([]);
    setSelectedEntry(null);

    try {
      const startDate = `${selectedDate}T00:00:00.000Z`;
      const nextDay = new Date(selectedDate + "T00:00:00");
      nextDay.setDate(nextDay.getDate() + 1);
      const endDate = nextDay.toISOString();

      const filter: Record<string, unknown> = {
        serviceId: [serviceId],
        startDate,
        endDate,
      };

      if (selectedStaff) {
        filter.resourceId = [selectedStaff];
      }

      const result = await availabilityCalendar.queryAvailability(
        { filter },
        { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
      );

      const entries = (result.availabilityEntries ?? []).filter(e => e.bookable);
      setAvailabilityEntries(entries);
    } catch (err) {
      setError(t('common.errorLoadSlots'));
      console.error("Availability error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function findNextAvailable() {
    setSearching(true);
    setError(null);

    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const fromDate = new Date(selectedDate + "T00:00:00");
      fromDate.setDate(fromDate.getDate() + 1);
      const toDate = new Date(fromDate);
      toDate.setDate(toDate.getDate() + 30);

      const filter: Record<string, unknown> = {
        serviceId: [serviceId],
        startDate: fromDate.toISOString(),
        endDate: toDate.toISOString(),
      };
      if (selectedStaff) filter.resourceId = [selectedStaff];

      // Use slotsPerDay: 1 to efficiently find the first day with availability
      const result = await availabilityCalendar.queryAvailability(
        { filter },
        { timezone: tz, slotsPerDay: 1 }
      );

      const entries = (result.availabilityEntries ?? []).filter(e => e.bookable);
      if (entries.length > 0 && entries[0]?.slot?.startDate) {
        // Found a day — update date and load all slots for that day
        const nextDate = new Date(entries[0].slot.startDate);
        const dateStr = nextDate.toISOString().split("T")[0]!;
        setSelectedDate(dateStr);

        const dayFilter: Record<string, unknown> = {
          serviceId: [serviceId],
          startDate: `${dateStr}T00:00:00.000Z`,
          endDate: new Date(new Date(dateStr + "T00:00:00").getTime() + 86400000).toISOString(),
        };
        if (selectedStaff) dayFilter.resourceId = [selectedStaff];

        const dayResult = await availabilityCalendar.queryAvailability(
          { filter: dayFilter },
          { timezone: tz }
        );
        setAvailabilityEntries((dayResult.availabilityEntries ?? []).filter(e => e.bookable));
      } else {
        setError(t('bookings.noSlotsIn30Days'));
      }
    } catch (err) {
      setError(t('common.errorSearchDates'));
      console.error("Find next available error:", err);
    } finally {
      setSearching(false);
    }
  }

  function handleSelectStaff(staffId: string) {
    setSelectedStaff(staffId);
    setStep("date");
  }

  function handleSelectDate() {
    if (!selectedDate) return;
    setStep("time");
    fetchAvailability();
  }

  function handleSelectSlot(entry: availabilityTypes.SlotAvailability) {
    setSelectedEntry(entry);
    setStep("confirm");
  }

  async function handleBook() {
    if (!selectedEntry) return;
    setBooking(true);
    setError(null);

    try {
      const redirect = await redirects.createRedirectSession({
        bookingsCheckout: {
          slotAvailability: selectedEntry,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        callbacks: {
          postFlowUrl: window.location.origin + "/bookings",
          thankYouPageUrl: window.location.origin + "/member#bookings",
        },
      });

      if (redirect.redirectSession?.fullUrl) {
        window.location.href = redirect.redirectSession.fullUrl;
      } else {
        setError(t('common.errorCreateBooking'));
        setBooking(false);
      }
    } catch (err) {
      console.error("Booking error:", err);
      setError(t('common.errorCreateBookingGeneric'));
      setBooking(false);
    }
  }

  function formatTime(dateStr: string | null | undefined) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

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

  const selectedStaffInfo = staff.find(s => s.id === selectedStaff);

  const stepLabels: Record<string, string> = {
    staff: t('bookings.staff'),
    date: t('bookings.date'),
    time: t('bookings.time'),
    confirm: t('bookings.confirm'),
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>{t('bookings.bookAppointment')}</h3>

      {/* Progress steps */}
      <div style={styles.progress}>
        {(["staff", "date", "time", "confirm"] as const).map((stepName, i) => {
          const currentIdx = (["staff", "date", "time", "confirm"] as const).indexOf(step);
          const isActive = i <= currentIdx;
          const skipStaff = staff.length === 1 && i === 0;
          if (skipStaff) return null;
          return (
            <div key={stepName} style={{ ...styles.progressStep, opacity: isActive ? 1 : 0.3 }}>
              <div style={{ ...styles.progressDot, background: isActive ? "#ff6600" : "#333" }} />
              <span style={styles.progressLabel}>{stepLabels[stepName]}</span>
            </div>
          );
        })}
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {/* Step 1: Select Staff */}
      {step === "staff" && staff.length > 1 && (
        <div>
          <p style={styles.stepLabel}>{t('bookings.chooseProvider')}</p>
          <div style={styles.staffGrid}>
            {staff.map(s => (
              <button
                key={s.id}
                onClick={() => handleSelectStaff(s.id)}
                style={{
                  ...styles.staffBtn,
                  borderColor: selectedStaff === s.id ? "#ff6600" : "#222",
                }}
              >
                {s.imageUrl ? (
                  <img src={s.imageUrl} alt={s.name} style={styles.staffBtnImg} />
                ) : (
                  <span style={styles.staffEmoji}>{s.emoji}</span>
                )}
                <span style={styles.staffBtnName}>{s.name}</span>
              </button>
            ))}
            <button
              onClick={() => { setSelectedStaff(null); setStep("date"); }}
              style={{ ...styles.staffBtn, borderColor: "#222" }}
            >
              <span style={styles.staffEmoji}>&#127922;</span>
              <span style={styles.staffBtnName}>{t('bookings.anyAvailable')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Select Date */}
      {step === "date" && (
        <div>
          <p style={styles.stepLabel}>
            {selectedStaffInfo ? t('bookings.bookingWith', { name: selectedStaffInfo.name }) : t('bookings.anyAvailableStaff')}
            {staff.length > 1 && (
              <button onClick={() => setStep("staff")} style={styles.changeBtn}>{t('bookings.change')}</button>
            )}
          </p>
          <p style={styles.stepLabel}>{t('bookings.selectDate')}</p>
          <input
            type="date"
            value={selectedDate}
            min={getMinDate()}
            max={getMaxDate()}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={styles.dateInput}
          />
          <button
            onClick={handleSelectDate}
            disabled={!selectedDate}
            style={{ ...styles.primaryBtn, opacity: selectedDate ? 1 : 0.5 }}
          >
            {t('bookings.findAvailableTimes')}
          </button>
        </div>
      )}

      {/* Step 3: Select Time */}
      {step === "time" && (
        <div>
          <p style={styles.stepLabel}>
            {selectedDate && new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            <button onClick={() => setStep("date")} style={styles.changeBtn}>{t('bookings.changeDate')}</button>
          </p>

          {loading ? (
            <div style={styles.loading}>
              <div style={styles.spinner} />
              <p>{t('bookings.scanningSchedules')}</p>
            </div>
          ) : availabilityEntries.length === 0 ? (
            <div style={styles.noSlots}>
              <p>{t('bookings.noSlotsForDate')}</p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <button onClick={() => setStep("date")} style={styles.secondaryBtn}>
                  {t('bookings.tryAnotherDate')}
                </button>
                <button onClick={findNextAvailable} disabled={searching} style={styles.primaryBtn}>
                  {searching ? t('bookings.searching') : t('bookings.findAvailableDate')}
                </button>
              </div>
            </div>
          ) : (
            <div style={styles.slotsGrid}>
              {availabilityEntries.map((entry, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectSlot(entry)}
                  style={styles.slotBtn}
                >
                  {formatTime(entry.slot?.startDate)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 4: Confirm */}
      {step === "confirm" && selectedEntry && (
        <div>
          <p style={styles.stepLabel}>{t('bookings.confirmAppointment')}</p>
          <div style={styles.confirmCard}>
            <div style={styles.confirmRow}>
              <span style={styles.confirmLabel}>{t('bookings.service')}</span>
              <span style={styles.confirmValue}>{serviceName}</span>
            </div>
            <div style={styles.confirmRow}>
              <span style={styles.confirmLabel}>{t('bookings.provider')}</span>
              <span style={styles.confirmValue}>
                {selectedStaffInfo ? `${selectedStaffInfo.emoji} ${selectedStaffInfo.name}` : t('bookings.anyAvailable')}
              </span>
            </div>
            <div style={styles.confirmRow}>
              <span style={styles.confirmLabel}>{t('bookings.date')}</span>
              <span style={styles.confirmValue}>
                {selectedDate && new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </span>
            </div>
            <div style={styles.confirmRow}>
              <span style={styles.confirmLabel}>{t('bookings.time')}</span>
              <span style={styles.confirmValue}>
                {formatTime(selectedEntry.slot?.startDate)} — {formatTime(selectedEntry.slot?.endDate)}
              </span>
            </div>
            <div style={styles.confirmRow}>
              <span style={styles.confirmLabel}>{t('bookings.duration')}</span>
              <span style={styles.confirmValue}>{duration} {t('bookings.minutes')}</span>
            </div>
            <div style={styles.confirmRow}>
              <span style={styles.confirmLabel}>{t('bookings.cost')}</span>
              <span style={styles.confirmValue}>{t('bookings.free')}</span>
            </div>
          </div>

          <div style={styles.confirmActions}>
            <button onClick={() => setStep("time")} style={styles.secondaryBtn}>
              {t('bookings.back')}
            </button>
            <button onClick={handleBook} disabled={booking} style={styles.primaryBtn}>
              {booking ? t('bookings.processing') : t('bookings.confirmBooking')}
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
    position: "sticky",
    top: 80,
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
    gap: 16,
    marginBottom: 20,
    paddingBottom: 16,
    borderBottom: "1px solid #222",
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
  staffGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
  },
  staffBtn: {
    background: "#1a1a1a",
    border: "1px solid #222",
    borderRadius: 8,
    padding: "12px 8px",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 6,
    transition: "all 0.2s",
    color: "#ccc",
  },
  staffBtnImg: {
    width: 48,
    height: 48,
    borderRadius: "50%",
    objectFit: "cover" as const,
    border: "2px solid #ff6600",
  },
  staffEmoji: {
    fontSize: "1.5rem",
  },
  staffBtnName: {
    fontSize: "0.7rem",
    fontFamily: "'Bangers', cursive",
    letterSpacing: 1,
    color: "#ffcc00",
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
  loading: {
    textAlign: "center" as const,
    padding: 24,
    color: "#999",
    fontSize: "0.85rem",
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid #222",
    borderTop: "3px solid #ff6600",
    borderRadius: "50%",
    margin: "0 auto 12px",
    animation: "spin 0.8s linear infinite",
  },
  noSlots: {
    textAlign: "center" as const,
    padding: 24,
    color: "#999",
    fontSize: "0.85rem",
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
    fontSize: "0.8rem",
    cursor: "pointer",
    transition: "all 0.2s",
    fontWeight: 600,
  },
  confirmCard: {
    background: "#1a1a1a",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  confirmRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: "1px solid #222",
  },
  confirmLabel: {
    fontSize: "0.75rem",
    color: "#666",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  confirmValue: {
    fontSize: "0.8rem",
    color: "#e0e0e0",
    fontWeight: 600,
  },
  confirmActions: {
    display: "flex",
    gap: 8,
  },
};
