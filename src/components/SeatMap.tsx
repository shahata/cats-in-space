"use client";
import { useState, useCallback } from "react";
import { i18n } from "@wix/essentials";

interface TicketDef {
  id: string;
  name: string;
  price: number;
  currency?: string;
  limit?: number;
}

export interface SelectedSeat {
  row: string;
  seat: number;
  category: "vip" | "standard" | "balcony";
  ticketDefId: string;
  price: number;
}

interface SeatMapProps {
  eventId: string;
  ticketDefinitions: TicketDef[];
}

const ROWS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const SEATS_PER_ROW = 15;
const MAX_SEATS = 10;

function getCategory(row: string): "vip" | "standard" | "balcony" {
  if (row <= "B") return "vip";
  if (row <= "G") return "standard";
  return "balcony";
}

function getCategoryColor(cat: "vip" | "standard" | "balcony"): string {
  if (cat === "vip") return "#ffcc00";
  if (cat === "standard") return "#ff6600";
  return "#666";
}

function getTicketDef(category: "vip" | "standard" | "balcony", defs: TicketDef[]): TicketDef {
  const vipDef = defs.find((d) => d.name.toLowerCase().includes("vip"));
  const balconyDef = defs.find((d) => d.name.toLowerCase().includes("balcon"));
  const standardDef = defs.find((d) => !d.name.toLowerCase().includes("vip") && !d.name.toLowerCase().includes("balcon"));
  const fallback = defs[0] || { id: "default", name: "Standard", price: 15 };

  if (category === "vip") return vipDef || { ...fallback, price: fallback.price * 2 };
  if (category === "balcony") return balconyDef || { ...fallback, price: Math.round(fallback.price * 0.7) };
  return standardDef || fallback;
}

export default function SeatMap({ ticketDefinitions }: SeatMapProps) {
  const t = i18n.getTranslationFunction();
  const [selected, setSelected] = useState<SelectedSeat[]>([]);

  const isSelected = useCallback(
    (row: string, seat: number) => selected.some((s) => s.row === row && s.seat === seat),
    [selected]
  );

  const toggleSeat = useCallback(
    (row: string, seat: number) => {
      setSelected((prev) => {
        const exists = prev.find((s) => s.row === row && s.seat === seat);
        if (exists) return prev.filter((s) => !(s.row === row && s.seat === seat));
        if (prev.length >= MAX_SEATS) return prev;
        const category = getCategory(row);
        const def = getTicketDef(category, ticketDefinitions);
        return [...prev, { row, seat, category, ticketDefId: def.id, price: def.price }];
      });
    },
    [ticketDefinitions]
  );

  const storeSelected = () => {
    if (typeof window !== "undefined") {
      window.__cinemaSelectedSeats = selected;
      window.dispatchEvent(new CustomEvent("cinema-seats-changed", { detail: selected }));
    }
  };

  storeSelected();

  return (
    <div className="sm-root">
      <div className="sm-screen">
        <div className="sm-screen-bar"></div>
        <span className="sm-screen-label">{t("cinema.screen")}</span>
      </div>

      <div className="sm-theater">
        {ROWS.map((row) => {
          const cat = getCategory(row);
          return (
            <div key={row} className="sm-row">
              <span className="sm-row-label">{row}</span>
              <div className="sm-seats">
                {Array.from({ length: SEATS_PER_ROW }, (_, i) => i + 1).map((seatNum) => {
                  const sel = isSelected(row, seatNum);
                  const gap = seatNum === 4 || seatNum === 12;
                  return (
                    <button
                      key={seatNum}
                      className={`sm-seat ${sel ? "sm-seat-selected" : ""}`}
                      style={{
                        borderColor: sel ? "#fff" : getCategoryColor(cat),
                        background: sel ? "#ff6600" : "transparent",
                        marginRight: gap ? "12px" : "2px",
                      }}
                      onClick={() => toggleSeat(row, seatNum)}
                      title={`${t("cinema.row")} ${row} ${t("cinema.seat")} ${seatNum} - ${cat.toUpperCase()}`}
                      aria-label={`${t("cinema.row")} ${row} ${t("cinema.seat")} ${seatNum}`}
                    >
                      <span className="sm-seat-num">{seatNum}</span>
                    </button>
                  );
                })}
              </div>
              <span className="sm-row-label">{row}</span>
            </div>
          );
        })}
      </div>

      <div className="sm-legend">
        <div className="sm-legend-item">
          <span className="sm-legend-dot" style={{ borderColor: "#ffcc00" }}></span>
          <span>{t("cinema.vip")}</span>
        </div>
        <div className="sm-legend-item">
          <span className="sm-legend-dot" style={{ borderColor: "#ff6600" }}></span>
          <span>{t("cinema.standard")}</span>
        </div>
        <div className="sm-legend-item">
          <span className="sm-legend-dot" style={{ borderColor: "#666" }}></span>
          <span>{t("cinema.balcony")}</span>
        </div>
        <div className="sm-legend-item">
          <span className="sm-legend-dot sm-legend-selected"></span>
          <span>{t("cinema.selected")}</span>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="sm-summary">
          <span className="sm-summary-count">
            {selected.length} {t("cinema.seats")} {t("cinema.selected").toLowerCase()}
          </span>
          <span className="sm-summary-list">
            {selected.map((s) => `${s.row}${s.seat}`).join(", ")}
          </span>
        </div>
      )}

      <style>{`
        .sm-root { max-width: 700px; margin: 0 auto; }
        .sm-screen { text-align: center; margin-bottom: 32px; }
        .sm-screen-bar {
          width: 70%; max-width: 500px; height: 4px; margin: 0 auto 8px;
          background: linear-gradient(90deg, transparent, #ff6600, #ffcc00, #ff6600, transparent);
          border-radius: 2px; box-shadow: 0 0 20px rgba(255,102,0,0.4), 0 2px 40px rgba(255,102,0,0.2);
        }
        .sm-screen-label {
          font-family: 'Bangers', cursive; font-size: 0.8rem; color: #666;
          letter-spacing: 3px; text-transform: uppercase;
        }
        .sm-theater { display: flex; flex-direction: column; gap: 4px; margin-bottom: 24px; }
        .sm-row { display: flex; align-items: center; gap: 6px; justify-content: center; }
        .sm-row-label {
          width: 20px; text-align: center; font-family: 'Bangers', cursive;
          font-size: 0.8rem; color: #555; flex-shrink: 0;
        }
        .sm-seats { display: flex; align-items: center; }
        .sm-seat {
          width: 28px; height: 28px; border-radius: 5px 5px 8px 8px;
          border: 1.5px solid; cursor: pointer; transition: all 0.15s;
          display: flex; align-items: center; justify-content: center;
          padding: 0; position: relative;
        }
        .sm-seat:hover { transform: scale(1.2); z-index: 1; box-shadow: 0 0 10px rgba(255,102,0,0.4); }
        .sm-seat-selected { box-shadow: 0 0 12px rgba(255,102,0,0.6) !important; }
        .sm-seat-num { font-size: 0.55rem; color: #888; pointer-events: none; }
        .sm-seat-selected .sm-seat-num { color: #000; font-weight: 700; }
        .sm-legend { display: flex; gap: 20px; justify-content: center; flex-wrap: wrap; margin-bottom: 16px; }
        .sm-legend-item { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: #888; }
        .sm-legend-dot {
          width: 16px; height: 16px; border-radius: 4px 4px 6px 6px;
          border: 1.5px solid; background: transparent;
        }
        .sm-legend-selected { background: #ff6600; border-color: #fff !important; }
        .sm-summary {
          text-align: center; padding: 12px 16px; background: #1a1a1a;
          border: 1px solid #333; border-radius: 8px;
        }
        .sm-summary-count {
          display: block; font-family: 'Bangers', cursive; font-size: 1rem;
          color: #ff6600; letter-spacing: 1px;
        }
        .sm-summary-list { font-size: 0.85rem; color: #aaa; }
        @media (max-width: 600px) {
          .sm-seat { width: 22px; height: 22px; }
          .sm-seat-num { font-size: 0.45rem; }
          .sm-row-label { width: 16px; font-size: 0.7rem; }
        }
      `}</style>
    </div>
  );
}

declare global {
  interface Window {
    __cinemaSelectedSeats?: SelectedSeat[];
  }
}
