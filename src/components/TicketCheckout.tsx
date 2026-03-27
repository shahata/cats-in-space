"use client";
import { useState, useEffect, useCallback } from "react";
import { ticketReservations, orders } from "@wix/events";
import { auth } from "@wix/essentials";
import { i18n } from "@wix/essentials";
import type { SelectedSeat } from "./SeatMap";

interface TicketDef {
  id: string;
  name: string;
  price: number;
  currency?: string;
  limit?: number;
}

interface TicketCheckoutProps {
  eventId: string;
  ticketDefinitions: TicketDef[];
}

function getCategoryLabel(cat: string, t: (key: string) => string): string {
  if (cat === "vip") return t("cinema.vip");
  if (cat === "balcony") return t("cinema.balcony");
  return t("cinema.standard");
}

export default function TicketCheckout({ eventId, ticketDefinitions }: TicketCheckoutProps) {
  const t = i18n.getTranslationFunction();
  const [seats, setSeats] = useState<SelectedSeat[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncSeats = useCallback(() => {
    const current = window.__cinemaSelectedSeats || [];
    setSeats([...current]);
  }, []);

  useEffect(() => {
    syncSeats();
    const handler = () => syncSeats();
    window.addEventListener("cinema-seats-changed", handler);
    return () => window.removeEventListener("cinema-seats-changed", handler);
  }, [syncSeats]);

  const seatKey = (s: SelectedSeat) => `${s.row}${s.seat}`;

  const updateName = (key: string, value: string) => {
    setNames((prev) => ({ ...prev, [key]: value }));
  };

  const total = seats.reduce((sum, s) => sum + s.price, 0);
  const currency = ticketDefinitions[0]?.currency || "USD";

  const formatPrice = (amount: number) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);

  const handlePurchase = async () => {
    if (seats.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      const ticketQuantities = seats.reduce<Record<string, number>>((acc, seat) => {
        acc[seat.ticketDefId] = (acc[seat.ticketDefId] || 0) + 1;
        return acc;
      }, {});

      const tickets = Object.entries(ticketQuantities).map(([ticketDefinitionId, quantity]) => ({
        ticketDefinitionId,
        quantity,
      }));

      const elevatedReserve = auth.elevate(ticketReservations.createTicketReservation);
      const reservation = await elevatedReserve({ tickets } as any);

      if (!reservation?._id) {
        throw new Error("Failed to create reservation");
      }

      const guestDetails = seats.map((s) => {
        const key = seatKey(s);
        return {
          ticketDefinitionId: s.ticketDefId,
          name: names[key] || "",
        };
      });

      const elevatedCheckout = auth.elevate(orders.checkout);
      const checkoutResult = await elevatedCheckout(eventId, {
        reservationId: reservation._id,
        guests: guestDetails.map((g) => ({
          form: {
            inputValues: [
              { inputName: "name", value: g.name },
            ],
          },
        })),
      } as any);

      const redirectUrl = (checkoutResult as Record<string, any>)?.redirectSession?.fullUrl
        || (checkoutResult as Record<string, any>)?.redirect?.url;

      if (redirectUrl) {
        window.location.href = redirectUrl;
      } else {
        window.location.href = "/cinema/thank-you";
      }
    } catch (err) {
      console.error("Checkout error:", err);
      setError(err instanceof Error ? err.message : t("common.errorGeneric"));
      setLoading(false);
    }
  };

  if (seats.length === 0) {
    return (
      <div className="tc-root">
        <p className="tc-empty">{t("cinema.noSeatsSelected")}</p>
        <style>{tcStyles}</style>
      </div>
    );
  }

  return (
    <div className="tc-root">
      <div className="tc-tickets">
        {seats.map((s) => {
          const key = seatKey(s);
          return (
            <div key={key} className="tc-ticket">
              <div className="tc-ticket-header">
                <span className="tc-seat-label">
                  {t("cinema.row")} {s.row}, {t("cinema.seat")} {s.seat}
                </span>
                <span className={`tc-cat tc-cat-${s.category}`}>
                  {getCategoryLabel(s.category, t)}
                </span>
                <span className="tc-price">{formatPrice(s.price)}</span>
              </div>
              <input
                type="text"
                className="tc-name-input"
                placeholder={t("cinema.attendeeNamePlaceholder")}
                value={names[key] || ""}
                onChange={(e) => updateName(key, e.target.value)}
              />
            </div>
          );
        })}
      </div>

      <div className="tc-total-bar">
        <span className="tc-total-label">{t("cinema.totalPrice")}</span>
        <span className="tc-total-amount">{formatPrice(total)}</span>
      </div>

      {error && <p className="tc-error">{error}</p>}

      <button
        className="tc-buy-btn"
        disabled={loading}
        onClick={handlePurchase}
      >
        {loading ? t("cinema.processing") : t("cinema.purchaseTickets")}
      </button>

      <style>{tcStyles}</style>
    </div>
  );
}

const tcStyles = `
  .tc-root { max-width: 600px; }
  .tc-empty { color: #666; font-size: 0.95rem; font-style: italic; }
  .tc-tickets { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }
  .tc-ticket {
    padding: 14px 16px; background: #141414; border: 1px solid #222;
    border-radius: 10px; transition: border-color 0.2s;
  }
  .tc-ticket:hover { border-color: #333; }
  .tc-ticket-header {
    display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;
  }
  .tc-seat-label {
    font-family: 'Bangers', cursive; font-size: 1rem; color: #e0e0e0; letter-spacing: 1px;
  }
  .tc-cat {
    padding: 2px 8px; border-radius: 4px; font-size: 0.65rem;
    font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
  }
  .tc-cat-vip { background: #ffcc00; color: #000; }
  .tc-cat-standard { background: #ff6600; color: #000; }
  .tc-cat-balcony { background: #666; color: #fff; }
  .tc-price {
    margin-left: auto; font-weight: 700; color: #ffcc00; font-size: 0.95rem;
  }
  .tc-name-input {
    width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid #333;
    background: #0a0a0a; color: #e0e0e0; font-size: 0.9rem; font-family: 'Inter', sans-serif;
    transition: border-color 0.2s;
  }
  .tc-name-input:focus { outline: none; border-color: #ff6600; }
  .tc-name-input::placeholder { color: #555; }
  .tc-total-bar {
    display: flex; justify-content: space-between; align-items: center;
    padding: 16px 0; border-top: 1px solid #333; margin-bottom: 16px;
  }
  .tc-total-label {
    font-family: 'Bangers', cursive; font-size: 1.2rem; color: #aaa; letter-spacing: 1px;
  }
  .tc-total-amount {
    font-family: 'Black Ops One', cursive; font-size: 1.4rem; color: #ffcc00;
    text-shadow: 0 0 10px rgba(255,204,0,0.3);
  }
  .tc-error {
    color: #f44336; font-size: 0.9rem; margin-bottom: 12px;
    padding: 8px 12px; background: rgba(244,67,54,0.08); border-radius: 6px;
  }
  .tc-buy-btn {
    width: 100%; padding: 16px; border: none; border-radius: 10px;
    background: linear-gradient(135deg, #ff6600, #ff8533);
    color: #000; font-family: 'Bangers', cursive; font-size: 1.2rem;
    letter-spacing: 2px; cursor: pointer; transition: all 0.2s;
    box-shadow: 0 4px 20px rgba(255,102,0,0.3);
  }
  .tc-buy-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 30px rgba(255,102,0,0.5);
  }
  .tc-buy-btn:disabled { opacity: 0.6; cursor: default; }
`;
