"use client";
import { useMemo, useState } from "react";
import { i18n } from "@wix/essentials";
import { ticketReservations, ticketDefinitionsV2 } from "@wix/events";
import { redirects } from "@wix/redirects";
import { checkoutCallbacks } from "../utils/redirects";

type TicketDefinition = ticketDefinitionsV2.TicketDefinition;
type AvailablePlace = ticketDefinitionsV2.AvailablePlace;

export interface Showtime {
  eventId: string;
  eventSlug: string;
  startMs: number;
}

interface Props {
  eventTitle: string;
  showtimes: Showtime[];
  initialEventId: string;
  initialTickets: TicketDefinition[];
  locale: string;
}

function firstCurrency(tickets: TicketDefinition[]): string {
  for (const t of tickets) {
    const c = t.pricingMethod?.fixedPrice?.currency;
    if (c) return c;
  }
  return "USD";
}

function ticketPriceNumber(td: TicketDefinition): number {
  const v = td.pricingMethod?.fixedPrice?.value;
  return v ? parseFloat(v) : 0;
}

function ticketHasSeats(td: TicketDefinition): boolean {
  return (td.seatingDetails?.places?.length ?? 0) > 0;
}

// Siblings share identical tier names/prices but each has its own ticket def
// `_id`. We key quantity/seat state by `td.name` so it survives a date change;
// at book time we fetch the selected showtime's ticket defs and map the user's
// selections from name → fresh `_id`.
export default function TicketPicker({
  eventTitle,
  showtimes,
  initialEventId,
  initialTickets,
  locale,
}: Props) {
  const t = i18n.getTranslationFunction();
  const [selectedEventId, setSelectedEventId] = useState(initialEventId);
  const [qtyByName, setQtyByName] = useState<Record<string, number>>({});
  const [seatsByName, setSeatsByName] = useState<Record<string, Set<string>>>(
    {},
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedShowtime =
    showtimes.find((s) => s.eventId === selectedEventId) ?? showtimes[0];

  const currency = firstCurrency(initialTickets);
  const priceFmt = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency }),
    [locale, currency],
  );
  const chipFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [locale],
  );

  const seatedTickets = initialTickets.filter(ticketHasSeats);
  const gaTickets = initialTickets.filter((td) => !ticketHasSeats(td));

  const gaQty = Object.values(qtyByName).reduce((s, q) => s + q, 0);
  const seatedQty = Object.values(seatsByName).reduce(
    (s, set) => s + set.size,
    0,
  );
  const totalQty = gaQty + seatedQty;

  const gaPrice = gaTickets.reduce(
    (sum, td) => sum + (qtyByName[td.name ?? ""] || 0) * ticketPriceNumber(td),
    0,
  );
  const seatedPrice = seatedTickets.reduce((sum, td) => {
    const n = seatsByName[td.name ?? ""]?.size ?? 0;
    return sum + n * ticketPriceNumber(td);
  }, 0);
  const totalPrice = gaPrice + seatedPrice;

  const setQty = (name: string, next: number) => {
    const def = initialTickets.find((td) => td.name === name);
    if (!def) return;
    const limit = def.limitPerCheckout ?? 10;
    const clamped = Math.max(0, Math.min(limit, next));
    setQtyByName((prev) => ({ ...prev, [name]: clamped }));
  };
  const inc = (name: string) => setQty(name, (qtyByName[name] || 0) + 1);
  const dec = (name: string) => setQty(name, (qtyByName[name] || 0) - 1);

  const toggleSeat = (name: string, placeId: string) => {
    setSeatsByName((prev) => {
      const existing = new Set(prev[name] ?? []);
      if (existing.has(placeId)) existing.delete(placeId);
      else existing.add(placeId);
      return { ...prev, [name]: existing };
    });
  };

  const canSubmit = totalQty > 0 && !loading && !!selectedShowtime;

  const handleBook = async () => {
    if (!selectedShowtime) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch the selected showtime's ticket defs fresh — each sibling event
      // has its own set of ticket def `_id`s, even though names/prices match.
      let eventTickets: TicketDefinition[];
      if (selectedShowtime.eventId === initialEventId) {
        eventTickets = initialTickets;
      } else {
        const res = await ticketDefinitionsV2.queryAvailableTicketDefinitions({
          filter: { eventId: selectedShowtime.eventId },
        });
        eventTickets = res.ticketDefinitions ?? [];
      }
      const defByName = new Map<string, TicketDefinition>();
      for (const td of eventTickets) if (td.name) defByName.set(td.name, td);

      const reservationTickets: Array<{
        ticketDefinitionId: string;
        quantity: number;
        ticketInfo?: { seatId: string };
      }> = [];
      for (const td of gaTickets) {
        const name = td.name ?? "";
        const q = qtyByName[name] || 0;
        if (q <= 0) continue;
        const freshId = defByName.get(name)?._id;
        if (!freshId)
          throw new Error(
            `Ticket "${name}" is no longer available for the selected date.`,
          );
        reservationTickets.push({ ticketDefinitionId: freshId, quantity: q });
      }
      for (const td of seatedTickets) {
        const name = td.name ?? "";
        const seats = seatsByName[name];
        if (!seats || seats.size === 0) continue;
        const freshId = defByName.get(name)?._id;
        if (!freshId)
          throw new Error(
            `Ticket "${name}" is no longer available for the selected date.`,
          );
        for (const placeId of seats) {
          reservationTickets.push({
            ticketDefinitionId: freshId,
            quantity: 1,
            ticketInfo: { seatId: placeId },
          });
        }
      }

      const reservation = await ticketReservations.createTicketReservation({
        tickets: reservationTickets,
      });
      const reservationId = reservation._id;
      if (!reservationId)
        throw new Error("Reservation failed — no id returned");

      const { redirectSession } = await redirects.createRedirectSession({
        eventsCheckout: {
          reservationId,
          eventSlug: selectedShowtime.eventSlug,
        },
        callbacks: checkoutCallbacks({
          thankYouPagePath: "/cinema/thank-you",
          postFlowPath: "/cinema",
        }),
        preferences: { checkIfPublish: true },
      });

      const url = redirectSession?.fullUrl;
      if (url) window.location.href = url;
      else throw new Error("Wix returned no redirect URL");
    } catch (e) {
      console.error("Book error", e);
      setError(e instanceof Error ? e.message : t("cinema.bookingFailed"));
      setLoading(false);
    }
  };

  const useDropdown = showtimes.length > 5;

  return (
    <div className="tp-root">
      {showtimes.length > 1 && (
        <div className="tp-showtime-picker">
          <span className="tp-showtime-label">
            {t("cinema.selectShowtime")}
          </span>
          {useDropdown ? (
            <select
              className="tp-showtime-select"
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
            >
              {showtimes.map((s) => (
                <option key={s.eventId} value={s.eventId}>
                  {chipFmt.format(new Date(s.startMs))}
                </option>
              ))}
            </select>
          ) : (
            <div className="tp-showtime-chips">
              {showtimes.map((s) => (
                <button
                  key={s.eventId}
                  type="button"
                  className={`tp-showtime-chip ${s.eventId === selectedEventId ? "tp-showtime-chip-on" : ""}`}
                  onClick={() => setSelectedEventId(s.eventId)}
                >
                  {chipFmt.format(new Date(s.startMs))}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {initialTickets.length === 0 ? (
        <p className="tp-empty">{t("cinema.noTickets")}</p>
      ) : (
        <div className="tp-tickets">
          {initialTickets.map((td) => {
            const name = td.name ?? "";
            const qty = qtyByName[name] || 0;
            const isSeated = ticketHasSeats(td);
            const selectedSeats = seatsByName[name] ?? new Set<string>();
            const price = ticketPriceNumber(td);
            const free = td.pricingMethod?.free === true;
            return (
              <div key={td._id ?? name} className="tp-ticket-row">
                <div className="tp-ticket-info">
                  <div className="tp-ticket-name">{td.name}</div>
                  {td.description && (
                    <div className="tp-ticket-desc">{td.description}</div>
                  )}
                  <div className="tp-ticket-price">
                    {free ? t("cinema.free") : priceFmt.format(price)}
                  </div>
                </div>
                {isSeated ? (
                  <SeatGrid
                    places={td.seatingDetails?.places ?? []}
                    selected={selectedSeats}
                    onToggle={(placeId) => toggleSeat(name, placeId)}
                  />
                ) : (
                  <div className="tp-qty">
                    <button
                      type="button"
                      className="tp-qty-btn"
                      onClick={() => dec(name)}
                      disabled={qty === 0}
                      aria-label={t("common.decrease")}
                    >
                      −
                    </button>
                    <span className="tp-qty-val">{qty}</span>
                    <button
                      type="button"
                      className="tp-qty-btn"
                      onClick={() => inc(name)}
                      aria-label={t("common.increase")}
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {totalQty > 0 && (
        <>
          <div className="tp-total-bar">
            <div>
              <span className="tp-total-label">{t("cinema.total")}</span>
              <span className="tp-total-sub">
                {totalQty}{" "}
                {totalQty === 1 ? t("cinema.ticket") : t("cinema.tickets")}
              </span>
            </div>
            <span className="tp-total-amount">
              {priceFmt.format(totalPrice)}
            </span>
          </div>

          {error && <div className="tp-error">{error}</div>}

          <button
            className="tp-book-btn"
            onClick={handleBook}
            disabled={!canSubmit}
          >
            {loading
              ? t("cinema.processing")
              : `${t("cinema.bookFor")} ${eventTitle}`}
          </button>
        </>
      )}

      <style>{tpStyles}</style>
    </div>
  );
}

function SeatGrid({
  places,
  selected,
  onToggle,
}: {
  places: AvailablePlace[];
  selected: Set<string>;
  onToggle: (placeId: string) => void;
}) {
  const groups = new Map<string, AvailablePlace[]>();
  for (const p of places) {
    const key = p.elementLabel ?? p.sectionLabel ?? "Seats";
    const arr = groups.get(key) ?? [];
    arr.push(p);
    groups.set(key, arr);
  }
  return (
    <div className="tp-seats">
      {[...groups.entries()].map(([label, seats]) => (
        <div key={label} className="tp-seat-row">
          <span className="tp-seat-row-label">{label}</span>
          <div className="tp-seat-cells">
            {seats.map((p) => {
              const id = p.placeId ?? "";
              const full = (p.availableCapacity ?? 0) === 0;
              const on = selected.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={`tp-seat ${on ? "tp-seat-on" : ""} ${full ? "tp-seat-full" : ""}`}
                  disabled={full}
                  onClick={() => onToggle(id)}
                  aria-label={`Seat ${p.label ?? id}`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const tpStyles = `
	.tp-root { display: flex; flex-direction: column; gap: 20px; }
	.tp-empty { color: var(--text-muted); font-style: italic; padding: 20px 0; }
	.tp-showtime-picker {
		display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
		padding: 14px 18px; background: var(--bg-card);
		border: 1px solid var(--border-card); border-radius: 12px;
	}
	.tp-showtime-label {
		font-family: var(--font-heading); font-size: 0.85rem;
		color: var(--text-secondary); letter-spacing: 1.5px;
	}
	.tp-showtime-select {
		appearance: none; -webkit-appearance: none;
		padding: 10px 40px 10px 14px; background: #1a1a1a;
		border: 1px solid #333; border-radius: 10px;
		font-family: var(--font-heading); font-size: 0.9rem; letter-spacing: 0.5px;
		color: var(--text-primary); min-width: 260px; max-width: 100%;
		cursor: pointer; transition: border-color 0.15s;
		background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%23ff6600'%3e%3cpath d='M3 6l5 5 5-5z'/%3e%3c/svg%3e");
		background-repeat: no-repeat; background-position: right 12px center; background-size: 16px;
	}
	.tp-showtime-select:hover { border-color: var(--accent); }
	.tp-showtime-select:focus { outline: none; border-color: var(--accent); }
	:global(html[dir="rtl"]) .tp-showtime-select {
		padding: 10px 14px 10px 40px;
		background-position: left 12px center;
	}
	.tp-showtime-chips { display: flex; flex-wrap: wrap; gap: 8px; }
	.tp-showtime-chip {
		padding: 8px 14px; background: #1a1a1a;
		border: 1px solid #333; border-radius: 999px;
		font-family: var(--font-heading); font-size: 0.8rem; letter-spacing: 0.5px;
		color: var(--text-secondary); cursor: pointer; transition: all 0.15s;
	}
	.tp-showtime-chip:hover { border-color: var(--accent); color: var(--accent); }
	.tp-showtime-chip-on {
		background: var(--accent); color: #000; border-color: var(--accent);
	}
	.tp-tickets { display: flex; flex-direction: column; gap: 12px; }
	.tp-ticket-row {
		display: flex; align-items: center; gap: 20px;
		padding: 18px; background: var(--bg-card);
		border: 1px solid var(--border-card); border-radius: 12px;
		transition: border-color 0.2s;
	}
	.tp-ticket-row:hover { border-color: rgba(255, 102, 0, 0.4); }
	.tp-ticket-info { flex: 1; }
	.tp-ticket-name {
		font-family: var(--font-heading); font-size: 1rem;
		color: var(--text-primary); letter-spacing: 1px; margin-bottom: 4px;
	}
	.tp-ticket-desc {
		font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; margin-bottom: 8px;
	}
	.tp-ticket-price {
		font-family: var(--font-heading); color: var(--accent-yellow);
		font-size: 1.1rem; letter-spacing: 0.5px;
	}
	.tp-qty {
		display: inline-flex; align-items: center;
		border: 1px solid #333; border-radius: 10px; overflow: hidden; flex-shrink: 0;
	}
	.tp-qty-btn {
		width: 40px; height: 40px;
		background: rgba(255, 255, 255, 0.03);
		border: none; color: var(--text-primary);
		font-size: 1.2rem; cursor: pointer;
	}
	.tp-qty-btn:disabled { opacity: 0.3; cursor: not-allowed; }
	.tp-qty-btn:hover:not(:disabled) { color: var(--accent); }
	.tp-qty-val {
		width: 44px; text-align: center;
		font-family: var(--font-heading); font-size: 1rem; color: var(--text-primary);
	}
	.tp-seats { display: flex; flex-direction: column; gap: 8px; }
	.tp-seat-row { display: flex; align-items: center; gap: 10px; }
	.tp-seat-row-label {
		font-family: var(--font-heading); font-size: 0.75rem;
		color: var(--text-muted); letter-spacing: 1px; min-width: 60px;
	}
	.tp-seat-cells { display: flex; gap: 4px; flex-wrap: wrap; }
	.tp-seat {
		min-width: 32px; height: 32px; padding: 0 6px;
		border: 1px solid #333; border-radius: 6px;
		background: rgba(255, 255, 255, 0.03);
		color: var(--text-primary); font-size: 0.8rem;
		cursor: pointer; transition: all 0.15s;
	}
	.tp-seat:hover:not(:disabled) { border-color: var(--accent); }
	.tp-seat-on { background: var(--accent); color: #000; border-color: var(--accent); }
	.tp-seat-full { opacity: 0.25; cursor: not-allowed; }
	.tp-total-bar {
		display: flex; justify-content: space-between; align-items: center;
		padding: 16px 20px; background: var(--bg-card);
		border: 1px solid var(--border-card); border-radius: 12px;
	}
	.tp-total-label {
		display: block; font-family: var(--font-heading); font-size: 0.85rem;
		letter-spacing: 1.5px; color: var(--text-secondary);
	}
	.tp-total-sub { font-size: 0.75rem; color: var(--text-muted); }
	.tp-total-amount {
		font-family: var(--font-heading); font-size: 1.4rem;
		color: var(--accent-yellow); letter-spacing: 1px;
	}
	.tp-error {
		padding: 12px; background: rgba(244, 67, 54, 0.1);
		border: 1px solid rgba(244, 67, 54, 0.3); border-radius: 8px;
		color: #f44336; font-size: 0.85rem;
	}
	.tp-book-btn {
		padding: 16px; border: none; border-radius: 12px;
		background: var(--accent); color: #000;
		font-family: var(--font-heading); font-size: 1rem;
		letter-spacing: 2px; cursor: pointer;
		transition: all 0.15s;
	}
	.tp-book-btn:hover:not(:disabled) { background: var(--accent-yellow); transform: translateY(-1px); }
	.tp-book-btn:disabled { opacity: 0.5; cursor: not-allowed; }
`;
