'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { reservations, reservationLocations, timeSlots } from '@wix/table-reservations';
import { redirects } from '@wix/redirects';
import { i18n } from '@wix/essentials';

type TimeSlot = timeSlots.TimeSlot;
type Reservation = reservations.Reservation;
type ReservationLocation = reservationLocations.ReservationLocation;
type TimePeriod = NonNullable<
	NonNullable<NonNullable<ReservationLocation['configuration']>['onlineReservations']>['businessSchedule']
>['periods'] extends (infer P)[] | null | undefined
	? P
	: never;

const DAY_BY_INDEX = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;

interface Props {
	reservationLocationId: string;
	businessSchedule: TimePeriod[];
	timeSlotInterval: number;
	defaultName?: string;
	defaultEmail?: string;
	defaultPhone?: string;
}

type Step = 'search' | 'details' | 'confirm';

export default function ReservationFlow({
	reservationLocationId,
	businessSchedule,
	timeSlotInterval,
	defaultName,
	defaultEmail,
	defaultPhone,
}: Props) {
	const t = i18n.getTranslationFunction();
	const locale = i18n.getLocale();

	const [step, setStep] = useState<Step>('search');
	const [partySize, setPartySize] = useState(2);
	const [selectedDate, setSelectedDate] = useState('');
	const [minDate, setMinDate] = useState('');
	const [maxDate, setMaxDate] = useState('');
	const [selectedHour, setSelectedHour] = useState('19:00');

	useEffect(() => {
		const isoDate = (offset: number) => {
			const d = new Date();
			d.setDate(d.getDate() + offset);
			return d.toISOString().split('T')[0]!;
		};
		const min = isoDate(1);
		setMinDate(min);
		setMaxDate(isoDate(30));
		setSelectedDate((prev) => prev || min);
	}, []);
	const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
	const [chosenSlot, setChosenSlot] = useState<TimeSlot | null>(null);
	const [guestName, setGuestName] = useState(defaultName || '');
	const [guestEmail, setGuestEmail] = useState(defaultEmail || '');
	const [guestPhone, setGuestPhone] = useState(defaultPhone || '');
	const [specialRequests, setSpecialRequests] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);

	const hours = useMemo(() => {
		if (!selectedDate || businessSchedule.length === 0) return [];
		const day = DAY_BY_INDEX[new Date(`${selectedDate}T12:00:00`).getDay()];
		const minutes = new Set<number>();
		// The picker is a rough starting point; the API returns fine-grained slots around it.
		// Step at 60 min (or the location's interval if coarser) to keep the dropdown short.
		const step = Math.max(60, timeSlotInterval);
		for (const period of businessSchedule) {
			if (period.openDay !== day) continue;
			const [openH, openM] = (period.openTime || '00:00').split(':').map(Number);
			const [closeH, closeM] = (period.closeTime || '24:00').split(':').map(Number);
			const start = (openH ?? 0) * 60 + (openM ?? 0);
			const endsNextDay = period.closeDay && period.closeDay !== day;
			// Same-day periods: `closeTime` is the last allowed reservation start — include it.
			// Cross-day periods: stop before midnight of the start day.
			const end = endsNextDay ? 24 * 60 - 1 : (closeH ?? 0) * 60 + (closeM ?? 0);
			for (let m = start; m <= end; m += step) minutes.add(m);
		}
		return [...minutes]
			.sort((a, b) => a - b)
			.map((m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
	}, [selectedDate, businessSchedule, timeSlotInterval]);

	useEffect(() => {
		if (hours.length === 0) return;
		if (!hours.includes(selectedHour)) {
			const evening = hours.find((h) => h >= '19:00') ?? hours[Math.floor(hours.length / 2)] ?? hours[0];
			if (evening) setSelectedHour(evening);
		}
	}, [hours, selectedHour]);

	function formatDate(dateStr: string) {
		return new Date(dateStr + 'T12:00:00').toLocaleDateString(locale, {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
		});
	}

	function formatSlotTime(startDate: Date | null | undefined) {
		if (!startDate) return '';
		return new Date(startDate).toLocaleTimeString(locale, {
			hour: '2-digit',
			minute: '2-digit',
		});
	}

	function slotKey(slot: TimeSlot): string {
		return slot.startDate ? new Date(slot.startDate).toISOString() : '';
	}

	// Auto-fetch slots whenever the search inputs change; debounce so rapid edits don't thrash.
	useEffect(() => {
		if (step !== 'search') return;
		if (!reservationLocationId || !selectedDate || !selectedHour) return;
		const requestDate = new Date(`${selectedDate}T${selectedHour}:00`);
		if (isNaN(requestDate.getTime())) return;

		let cancelled = false;
		setChosenSlot(null);
		setLoading(true);
		setError(null);
		const timer = setTimeout(async () => {
			try {
				const result = await timeSlots.getTimeSlots(reservationLocationId, requestDate, partySize, {
					slotsBefore: 3,
					slotsAfter: 6,
				});
				if (cancelled) return;
				setAvailableSlots(result.timeSlots || []);
			} catch (e) {
				if (cancelled) return;
				setError(e instanceof Error ? e.message : 'Failed to fetch time slots');
				setAvailableSlots([]);
			} finally {
				if (!cancelled) setLoading(false);
			}
		}, 250);

		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [reservationLocationId, partySize, selectedDate, selectedHour, step]);

	async function handleConfirm() {
		if (!chosenSlot?.startDate) return;
		setLoading(true);
		setError(null);
		try {
			const reservation: Reservation = {
				details: {
					reservationLocationId,
					startDate: new Date(chosenSlot.startDate),
					partySize,
				},
				reservee: {
					firstName: guestName.split(' ')[0] || '',
					lastName: guestName.split(' ').slice(1).join(' ') || '',
					email: guestEmail,
					phone: guestPhone,
				},
			};
			if (specialRequests) reservation.teamMessage = specialRequests;
			const created = await reservations.createReservation(reservation);

			if (created.paymentStatus === 'NOT_PAID') {
				const reservationId = created._id;
				if (reservationId) {
					const { redirectSession } = await redirects.createRedirectSession({
						ecomCheckout: { checkoutId: reservationId },
						callbacks: {
							thankYouPageUrl: window.location.origin + '/restaurant/thank-you',
							postFlowUrl: window.location.origin + '/restaurant/reserve',
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
			setError(e instanceof Error ? e.message : t('restaurant.reservationFailed'));
		} finally {
			setLoading(false);
		}
	}

	const stepLabels: Record<Step, string> = {
		search: t('restaurant.selectTime'),
		details: t('restaurant.reserveDetails'),
		confirm: t('restaurant.reserveConfirm'),
	};

	const allSteps: Step[] = ['search', 'details', 'confirm'];

	if (success) {
		return (
			<div style={styles.container}>
				<div style={styles.successBox}>
					<h3 style={styles.successTitle}>{t('restaurant.reservationConfirmed')}</h3>
					<p style={styles.successText}>{t('restaurant.reservationConfirmedText')}</p>
					<div style={styles.summaryCard}>
						<SummaryRow label={t('restaurant.reserveDate')} value={chosenSlot ? formatDate(selectedDate) : ''} />
						<SummaryRow
							label={t('restaurant.reserveTime')}
							value={chosenSlot ? formatSlotTime(chosenSlot.startDate) : ''}
						/>
						<SummaryRow label={t('restaurant.reserveParty')} value={`${partySize} ${t('restaurant.guests')}`} />
						<SummaryRow label={t('restaurant.guestName')} value={guestName} />
					</div>
					<a href="/restaurant" style={styles.backLink}>
						<span className="rtl-flip">←</span> {t('restaurant.backToMenu')}
					</a>
				</div>
			</div>
		);
	}

	return (
		<div style={styles.container}>
			<h3 style={styles.title}>{t('restaurant.reserveTitle')}</h3>

			<div style={styles.progress}>
				{allSteps.map((s, i) => {
					const currentIdx = allSteps.indexOf(step);
					const isActive = i <= currentIdx;
					return (
						<div key={s} style={{ ...styles.progressStep, opacity: isActive ? 1 : 0.3 }}>
							<div style={{ ...styles.progressDot, background: isActive ? '#ff6600' : '#333' }} />
							<span style={styles.progressLabel}>{stepLabels[s]}</span>
						</div>
					);
				})}
			</div>

			{error && <div style={styles.error}>{error}</div>}

			{step === 'search' && (
				<div>
					<div style={styles.searchRow}>
						<div style={styles.searchField}>
							<label style={styles.fieldLabel}>{t('restaurant.partySize')}</label>
							<select value={partySize} onChange={(e) => setPartySize(Number(e.target.value))} style={styles.select}>
								{Array.from({ length: 8 }, (_, i) => i + 1).map((size) => (
									<option key={size} value={size}>
										{size} {t('restaurant.guests')}
									</option>
								))}
							</select>
						</div>

						<div style={styles.searchField}>
							<label style={styles.fieldLabel}>{t('restaurant.selectDate')}</label>
							<input
								type="date"
								value={selectedDate}
								min={minDate}
								max={maxDate}
								onChange={(e) => setSelectedDate(e.target.value)}
								style={styles.select}
							/>
						</div>

						<div style={styles.searchField}>
							<label style={styles.fieldLabel}>{t('restaurant.selectTime')}</label>
							<select value={selectedHour} onChange={(e) => setSelectedHour(e.target.value)} style={styles.select}>
								{hours.map((h) => (
									<option key={h} value={h}>
										{h}
									</option>
								))}
							</select>
						</div>
					</div>

					<div style={{ marginTop: 20 }}>
						<p style={{ ...styles.stepLabel, fontWeight: 600, marginBottom: 8 }}>
							{loading ? t('restaurant.processing') : t('restaurant.selectTime')}
						</p>
						{!loading && availableSlots.length === 0 ? (
							<p style={{ color: '#999', fontSize: '0.85rem' }}>{t('restaurant.noSlotsAvailable')}</p>
						) : (
							<div style={{ ...styles.slotsGrid, opacity: loading ? 0.5 : 1 }}>
								{availableSlots.map((slot) => {
									const isAvailable = slot.status === 'AVAILABLE';
									const key = slotKey(slot);
									const isSelected = chosenSlot ? slotKey(chosenSlot) === key : false;
									return (
										<button
											key={key}
											disabled={!isAvailable || loading}
											onClick={() => setChosenSlot(slot)}
											style={{
												...styles.slotBtn,
												borderColor: isSelected ? '#ff6600' : isAvailable ? '#333' : '#222',
												background: isSelected ? 'rgba(255, 102, 0, 0.2)' : isAvailable ? '#1a1a1a' : '#111',
												color: isAvailable ? '#e0e0e0' : '#444',
												cursor: isAvailable ? 'pointer' : 'not-allowed',
												opacity: isAvailable ? 1 : 0.4,
											}}
										>
											{formatSlotTime(slot.startDate)}
										</button>
									);
								})}
							</div>
						)}
					</div>

					<button
						onClick={() => setStep('details')}
						disabled={!chosenSlot || loading}
						style={{ ...styles.primaryBtn, marginTop: 16, opacity: chosenSlot ? 1 : 0.5 }}
					>
						{t('restaurant.next')}
					</button>
				</div>
			)}

			{step === 'details' && (
				<div>
					<p style={styles.stepLabel}>
						{formatDate(selectedDate)} &middot; {chosenSlot ? formatSlotTime(chosenSlot.startDate) : ''} &middot;{' '}
						{partySize} {t('restaurant.guests')}
					</p>
					<p style={{ ...styles.stepLabel, fontWeight: 600 }}>{t('restaurant.guestDetails')}</p>
					<div style={styles.form}>
						<input
							type="text"
							placeholder={t('restaurant.guestNamePlaceholder')}
							value={guestName}
							onChange={(e) => setGuestName(e.target.value)}
							style={styles.input}
						/>
						<input
							type="email"
							placeholder={t('restaurant.guestEmailPlaceholder')}
							value={guestEmail}
							onChange={(e) => setGuestEmail(e.target.value)}
							style={styles.input}
						/>
						<input
							type="tel"
							placeholder={t('restaurant.guestPhonePlaceholder')}
							value={guestPhone}
							onChange={(e) => setGuestPhone(e.target.value)}
							style={styles.input}
						/>
						<textarea
							placeholder={t('restaurant.specialRequestsPlaceholder')}
							value={specialRequests}
							onChange={(e) => setSpecialRequests(e.target.value)}
							rows={3}
							style={{ ...styles.input, resize: 'vertical' as const }}
						/>
					</div>
					<div style={styles.formActions}>
						<button onClick={() => setStep('search')} style={styles.secondaryBtn}>
							{t('restaurant.back')}
						</button>
						<button
							onClick={() => setStep('confirm')}
							disabled={!guestName || !guestEmail}
							style={{ ...styles.primaryBtn, flex: 1, opacity: guestName && guestEmail ? 1 : 0.5 }}
						>
							{t('restaurant.next')}
						</button>
					</div>
				</div>
			)}

			{step === 'confirm' && (
				<div>
					<p style={{ ...styles.stepLabel, fontWeight: 600 }}>{t('restaurant.confirmReservation')}</p>
					<div style={styles.summaryCard}>
						<SummaryRow label={t('restaurant.reserveDate')} value={formatDate(selectedDate)} />
						<SummaryRow
							label={t('restaurant.reserveTime')}
							value={chosenSlot ? formatSlotTime(chosenSlot.startDate) : ''}
						/>
						<SummaryRow label={t('restaurant.reserveParty')} value={`${partySize} ${t('restaurant.guests')}`} />
						<SummaryRow label={t('restaurant.guestName')} value={guestName} />
						<SummaryRow label={t('restaurant.guestEmail')} value={guestEmail} />
						{guestPhone && <SummaryRow label={t('restaurant.guestPhone')} value={guestPhone} />}
						{specialRequests && <SummaryRow label={t('restaurant.specialRequests')} value={specialRequests} />}
					</div>
					<div style={styles.formActions}>
						<button onClick={() => setStep('details')} style={styles.secondaryBtn}>
							{t('restaurant.back')}
						</button>
						<button onClick={handleConfirm} disabled={loading} style={{ ...styles.primaryBtn, flex: 1 }}>
							{loading ? t('restaurant.processing') : t('restaurant.confirmReservation')}
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
		background: '#111',
		border: '1px solid #222',
		borderRadius: 12,
		padding: 24,
	},
	title: {
		fontFamily: "'Bangers', cursive",
		fontSize: '1.3rem',
		color: '#ffcc00',
		letterSpacing: 1,
		marginBottom: 16,
	},
	progress: {
		display: 'flex',
		gap: 12,
		marginBottom: 20,
		paddingBottom: 16,
		borderBottom: '1px solid #222',
		flexWrap: 'wrap',
	},
	progressStep: { display: 'flex', alignItems: 'center', gap: 6 },
	progressDot: { width: 8, height: 8, borderRadius: '50%' },
	progressLabel: {
		fontSize: '0.7rem',
		color: '#999',
		fontFamily: "'Bangers', cursive",
		letterSpacing: 1,
	},
	stepLabel: {
		fontSize: '0.85rem',
		color: '#ccc',
		marginBottom: 12,
		display: 'flex',
		alignItems: 'center',
		gap: 8,
		flexWrap: 'wrap' as const,
	},
	error: {
		background: 'rgba(244, 67, 54, 0.1)',
		border: '1px solid rgba(244, 67, 54, 0.3)',
		borderRadius: 8,
		padding: '10px 14px',
		fontSize: '0.8rem',
		color: '#f44336',
		marginBottom: 12,
	},
	dateInput: {
		width: '100%',
		padding: '12px 16px',
		background: '#1a1a1a',
		border: '1px solid #333',
		borderRadius: 8,
		color: '#e0e0e0',
		fontSize: '0.9rem',
		marginBottom: 12,
		boxSizing: 'border-box' as const,
		colorScheme: 'dark',
	},
	searchRow: {
		display: 'grid',
		gridTemplateColumns: '1fr 1fr 1fr',
		gap: 12,
	},
	searchField: {
		display: 'flex',
		flexDirection: 'column' as const,
		gap: 6,
	},
	fieldLabel: {
		fontSize: '0.75rem',
		color: '#888',
		fontFamily: "'Bangers', cursive",
		letterSpacing: 1,
	},
	select: {
		width: '100%',
		padding: '12px 16px',
		background: '#1a1a1a',
		border: '1px solid #333',
		borderRadius: 8,
		color: '#e0e0e0',
		fontSize: '0.9rem',
		boxSizing: 'border-box' as const,
		colorScheme: 'dark',
		appearance: 'auto' as const,
	},
	slotsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
	slotBtn: {
		padding: '10px 8px',
		background: '#1a1a1a',
		border: '1px solid #333',
		borderRadius: 8,
		color: '#e0e0e0',
		fontSize: '0.85rem',
		cursor: 'pointer',
		transition: 'all 0.2s',
		fontWeight: 600,
	},
	primaryBtn: {
		width: '100%',
		padding: '12px 24px',
		background: '#ff6600',
		color: '#000',
		border: 'none',
		borderRadius: 8,
		fontFamily: "'Bangers', cursive",
		fontSize: '1rem',
		letterSpacing: 1,
		cursor: 'pointer',
	},
	secondaryBtn: {
		padding: '10px 20px',
		background: 'transparent',
		color: '#999',
		border: '1px solid #333',
		borderRadius: 8,
		fontFamily: "'Bangers', cursive",
		fontSize: '0.85rem',
		letterSpacing: 1,
		cursor: 'pointer',
	},
	changeBtn: {
		background: 'none',
		border: 'none',
		color: '#ff6600',
		fontSize: '0.75rem',
		cursor: 'pointer',
		textDecoration: 'underline',
		padding: 0,
	},
	form: { display: 'flex', flexDirection: 'column' as const, gap: 12, marginBottom: 16 },
	input: {
		width: '100%',
		padding: '12px 16px',
		background: '#1a1a1a',
		border: '1px solid #333',
		borderRadius: 8,
		color: '#e0e0e0',
		fontSize: '0.9rem',
		boxSizing: 'border-box' as const,
		fontFamily: 'inherit',
	},
	formActions: { display: 'flex', gap: 8 },
	summaryCard: { background: '#1a1a1a', borderRadius: 8, padding: 16, marginBottom: 16 },
	summaryRow: {
		display: 'flex',
		justifyContent: 'space-between',
		padding: '8px 0',
		borderBottom: '1px solid #222',
	},
	summaryLabel: {
		fontSize: '0.75rem',
		color: '#666',
		textTransform: 'uppercase' as const,
		letterSpacing: 1,
	},
	summaryValue: {
		fontSize: '0.8rem',
		color: '#e0e0e0',
		fontWeight: 600,
		textAlign: 'right' as const,
		maxWidth: '60%',
	},
	successBox: { textAlign: 'center' as const, padding: 24 },
	successTitle: {
		fontFamily: "'Bangers', cursive",
		fontSize: '1.5rem',
		color: '#ffcc00',
		letterSpacing: 1,
		marginBottom: 8,
	},
	successText: { fontSize: '0.9rem', color: '#999', marginBottom: 20 },
	backLink: {
		display: 'inline-block',
		marginTop: 16,
		color: '#ff6600',
		fontSize: '0.85rem',
		textDecoration: 'underline',
	},
};
