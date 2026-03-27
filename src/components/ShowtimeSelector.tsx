"use client";
import { useState, useMemo } from "react";

interface ShowtimeSelectorProps {
  eventId: string;
  showtimes: string[];
}

export default function ShowtimeSelector({ showtimes }: ShowtimeSelectorProps) {
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("");

  const dates = useMemo(() => {
    const today = new Date();
    const result: { key: string; label: string; dayLabel: string; times: string[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split("T")[0]!;
      const dayLabel = i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "short" });
      const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

      const dayTimes = showtimes
        .filter((s) => s.startsWith(key))
        .map((s) => new Date(s).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }));

      if (dayTimes.length === 0) {
        const baseHours = [14, 17, 20, 22];
        baseHours.forEach((h) => {
          const dt = new Date(d);
          dt.setHours(h, 0, 0, 0);
          dayTimes.push(dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }));
        });
      }

      result.push({ key, dayLabel, label, times: dayTimes });
    }
    return result;
  }, [showtimes]);

  const activeDate = selectedDate || dates[0]?.key || "";
  const currentDay = dates.find((d) => d.key === activeDate);

  return (
    <div className="sts-root">
      <div className="sts-dates">
        {dates.map((d) => (
          <button
            key={d.key}
            className={`sts-date-btn ${activeDate === d.key ? "sts-date-active" : ""}`}
            onClick={() => { setSelectedDate(d.key); setSelectedTime(""); }}
          >
            <span className="sts-day-label">{d.dayLabel}</span>
            <span className="sts-day-date">{d.label}</span>
          </button>
        ))}
      </div>
      {currentDay && (
        <div className="sts-times">
          {currentDay.times.map((time) => (
            <button
              key={time}
              className={`sts-time-btn ${selectedTime === time ? "sts-time-active" : ""}`}
              onClick={() => setSelectedTime(time)}
            >
              {time}
            </button>
          ))}
        </div>
      )}
      <style>{`
        .sts-root { margin-bottom: 8px; }
        .sts-dates {
          display: flex; gap: 8px; overflow-x: auto; padding-bottom: 12px;
          scrollbar-width: thin; scrollbar-color: #333 transparent;
        }
        .sts-date-btn {
          flex-shrink: 0; display: flex; flex-direction: column; align-items: center;
          padding: 12px 18px; border-radius: 10px; border: 1px solid #222;
          background: #141414; color: #aaa; cursor: pointer; transition: all 0.2s;
          min-width: 80px;
        }
        .sts-date-btn:hover { border-color: #ff6600; color: #ff6600; }
        .sts-date-active {
          background: #ff6600 !important; color: #000 !important;
          border-color: #ff6600 !important; box-shadow: 0 0 20px rgba(255,102,0,0.3);
        }
        .sts-day-label { font-family: 'Bangers', cursive; font-size: 0.9rem; letter-spacing: 1px; }
        .sts-day-date { font-size: 0.75rem; margin-top: 2px; opacity: 0.8; }
        .sts-times { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
        .sts-time-btn {
          padding: 10px 20px; border-radius: 8px; border: 1px solid #333;
          background: #1a1a1a; color: #e0e0e0; cursor: pointer; font-size: 0.95rem;
          font-weight: 600; transition: all 0.2s; font-family: 'Inter', sans-serif;
        }
        .sts-time-btn:hover { border-color: #ff6600; color: #ff6600; }
        .sts-time-active {
          background: #ff6600 !important; color: #000 !important;
          border-color: #ff6600 !important; box-shadow: 0 0 15px rgba(255,102,0,0.3);
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}
