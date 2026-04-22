"use client";
import { useMemo, useState } from "react";
import { i18n } from "@wix/essentials";
import { ticketReservations, ticketDefinitionsV2 } from "@wix/events";
import { redirects } from "@wix/redirects";

type TicketDefinition = ticketDefinitionsV2.TicketDefinition;
type AvailablePlace = ticketDefinitionsV2.AvailablePlace;

interface Props {
	eventId: string;
	eventSlug: string;
	eventTitle: string;
	tickets: TicketDefinition[];
	locale: string;
}

// For seated events, each ticket definition's `seatingDetails.places` lists
// specific placeIds the buyer can reserve. For general admission, we fall back
// to a simple quantity stepper.
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

export default function TicketPicker({ eventId: _eventId, eventSlug, eventTitle, tickets, locale }: Props) {
	const t = i18n.getTranslationFunction();
	const [qtyById, setQtyById] = useState<Record<string, number>>({});
	const [seatsByTicket, setSeatsByTicket] = useState<Record<string, Set<string>>>({});
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const currency = firstCurrency(tickets);
	const priceFmt = useMemo(
		() => new Intl.NumberFormat(locale, { style: "currency", currency }),
		[locale, currency],
	);

	const seatedTickets = tickets.filter(ticketHasSeats);
	const gaTickets = tickets.filter(td => !ticketHasSeats(td));

	const gaQty = Object.entries(qtyById).reduce((s, [, q]) => s + q, 0);
	const seatedQty = Object.values(seatsByTicket).reduce((s, set) => s + set.size, 0);
	const totalQty = gaQty + seatedQty;

	const gaPrice = gaTickets.reduce((sum, td) => sum + (qtyById[td._id ?? ""] || 0) * ticketPriceNumber(td), 0);
	const seatedPrice = seatedTickets.reduce((sum, td) => {
		const n = seatsByTicket[td._id ?? ""]?.size ?? 0;
		return sum + n * ticketPriceNumber(td);
	}, 0);
	const totalPrice = gaPrice + seatedPrice;

	const setQty = (id: string, next: number) => {
		const def = tickets.find(td => td._id === id);
		if (!def) return;
		const limit = def.limitPerCheckout ?? 10;
		const clamped = Math.max(0, Math.min(limit, next));
		setQtyById(prev => ({ ...prev, [id]: clamped }));
	};
	const inc = (id: string) => setQty(id, (qtyById[id] || 0) + 1);
	const dec = (id: string) => setQty(id, (qtyById[id] || 0) - 1);

	const toggleSeat = (ticketId: string, placeId: string) => {
		setSeatsByTicket(prev => {
			const existing = new Set(prev[ticketId] ?? []);
			if (existing.has(placeId)) existing.delete(placeId);
			else existing.add(placeId);
			return { ...prev, [ticketId]: existing };
		});
	};

	const canSubmit = totalQty > 0 && !loading;

	const handleBook = async () => {
		setLoading(true);
		setError(null);
		try {
			// Build one TicketLineItem per general-admission ticket type (with a
			// quantity) plus one line item per seated reservation (one per seat).
			const reservationTickets: Array<{
				ticketDefinitionId: string;
				quantity: number;
				ticketInfo?: { seatId: string };
			}> = [];
			for (const td of gaTickets) {
				const id = td._id;
				const q = id ? qtyById[id] : 0;
				if (id && q && q > 0) reservationTickets.push({ ticketDefinitionId: id, quantity: q });
			}
			for (const td of seatedTickets) {
				const id = td._id;
				if (!id) continue;
				const seats = seatsByTicket[id];
				if (!seats) continue;
				for (const placeId of seats) {
					reservationTickets.push({ ticketDefinitionId: id, quantity: 1, ticketInfo: { seatId: placeId } });
				}
			}

			const reservation = await ticketReservations.createTicketReservation({ tickets: reservationTickets });
			const reservationId = reservation._id;
			if (!reservationId) throw new Error("Reservation failed — no id returned");

			// Hand off to Wix's hosted events checkout for buyer details +
			// payment. `orders.checkout` creates an order directly without a
			// payment step, which is why the previous flow skipped Wix's paywall.
			const { redirectSession } = await redirects.createRedirectSession({
				eventsCheckout: { reservationId, eventSlug },
				callbacks: {
					thankYouPageUrl: window.location.origin + "/cinema/thank-you",
					postFlowUrl: window.location.origin + "/cinema",
				},
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

	return (
		<div className="tp-root">
			{tickets.length === 0 ? (
				<p className="tp-empty">{t("cinema.noTickets")}</p>
			) : (
				<div className="tp-tickets">
					{tickets.map(td => {
						const id = td._id ?? "";
						const qty = qtyById[id] || 0;
						const isSeated = ticketHasSeats(td);
						const selectedSeats = seatsByTicket[id] ?? new Set<string>();
						const price = ticketPriceNumber(td);
						const free = td.pricingMethod?.free === true;
						return (
							<div key={id} className="tp-ticket-row">
								<div className="tp-ticket-info">
									<div className="tp-ticket-name">{td.name}</div>
									{td.description && <div className="tp-ticket-desc">{td.description}</div>}
									<div className="tp-ticket-price">
										{free ? t("cinema.free") : priceFmt.format(price)}
									</div>
								</div>
								{isSeated ? (
									<SeatGrid
										places={td.seatingDetails?.places ?? []}
										selected={selectedSeats}
										onToggle={placeId => toggleSeat(id, placeId)}
									/>
								) : (
									<div className="tp-qty">
										<button type="button" className="tp-qty-btn" onClick={() => dec(id)} disabled={qty === 0} aria-label="decrease">−</button>
										<span className="tp-qty-val">{qty}</span>
										<button type="button" className="tp-qty-btn" onClick={() => inc(id)} aria-label="increase">+</button>
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
								{totalQty} {totalQty === 1 ? t("cinema.ticket") : t("cinema.tickets")}
							</span>
						</div>
						<span className="tp-total-amount">{priceFmt.format(totalPrice)}</span>
					</div>

					{error && <div className="tp-error">{error}</div>}

					<button
						className="tp-book-btn"
						onClick={handleBook}
						disabled={!canSubmit}
					>
						{loading ? t("cinema.processing") : `${t("cinema.bookFor")} ${eventTitle}`}
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
	// Group by elementLabel ("Row A", "Table 1", "General Admission") to lay out
	// seats by row/table.
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
						{seats.map(p => {
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
	.tp-form {
		background: var(--bg-card); border: 1px solid var(--border-card);
		border-radius: 12px; padding: 20px;
		display: flex; flex-direction: column; gap: 12px;
	}
	.tp-form-title {
		font-family: var(--font-heading); font-size: 1rem;
		color: var(--accent); letter-spacing: 1.5px; margin: 0;
	}
	.tp-form-row { display: flex; gap: 12px; }
	.tp-form-row .tp-field { flex: 1; }
	.tp-field { display: flex; flex-direction: column; gap: 4px; }
	.tp-field span { font-size: 0.75rem; color: var(--text-muted); letter-spacing: 0.5px; }
	.tp-field input {
		padding: 10px 12px; border-radius: 8px; border: 1px solid #333;
		background: #1a1a1a; color: var(--text-primary);
		font-family: inherit; font-size: 0.9rem;
	}
	.tp-field input:focus { outline: none; border-color: var(--accent); }
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
	@media (max-width: 500px) {
		.tp-form-row { flex-direction: column; }
	}
`;
