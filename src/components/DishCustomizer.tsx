import { useState, useMemo } from 'react';
import { currentCart } from '@wix/ecom';
import { i18n } from '@wix/essentials';
import { RESTAURANTS_APP_ID } from '../utils/appIds';

interface PriceVariant {
	_id: string;
	name: string;
	price: { amount: string; currency: string };
}

interface Modifier {
	_id: string;
	name: string;
	additionalPrice: { amount: string } | null;
}

interface ModifierGroup {
	_id: string;
	name: string;
	minChoices: number;
	maxChoices: number;
	modifiers: Modifier[];
}

interface DishItem {
	_id: string;
	name: string;
	price: { amount: string; currency: string } | null;
	priceVariants: PriceVariant[];
	modifierGroups: ModifierGroup[];
}

interface Props {
	item: DishItem;
}

export default function DishCustomizer({ item }: Props) {
	const t = i18n.getTranslationFunction();
	const hasVariants = item.priceVariants.length > 0;

	const [selectedVariant, setSelectedVariant] = useState<string>(hasVariants ? item.priceVariants[0]?._id || '' : '');
	const [modifierSelections, setModifierSelections] = useState<Record<string, string[]>>({});
	const [quantity, setQuantity] = useState(1);
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState<{
		type: 'success' | 'error';
		text: string;
	} | null>(null);

	const toggleModifier = (groupId: string, modifierId: string, maxChoices: number) => {
		setModifierSelections((prev) => {
			const current = prev[groupId] || [];
			const isSelected = current.includes(modifierId);

			if (isSelected) {
				return { ...prev, [groupId]: current.filter((id) => id !== modifierId) };
			}

			if (maxChoices === 1) {
				return { ...prev, [groupId]: [modifierId] };
			}

			if (maxChoices > 0 && current.length >= maxChoices) {
				return prev;
			}

			return { ...prev, [groupId]: [...current, modifierId] };
		});
	};

	const total = useMemo(() => {
		let base = 0;
		if (hasVariants && selectedVariant) {
			const variant = item.priceVariants.find((v) => v._id === selectedVariant);
			base = parseFloat(variant?.price.amount || '0');
		} else if (item.price) {
			base = parseFloat(item.price.amount);
		}

		let modifierTotal = 0;
		for (const group of item.modifierGroups) {
			const selected = modifierSelections[group._id] || [];
			for (const modId of selected) {
				const mod = group.modifiers.find((m) => m._id === modId);
				if (mod?.additionalPrice) {
					modifierTotal += parseFloat(mod.additionalPrice.amount);
				}
			}
		}

		return (base + modifierTotal) * quantity;
	}, [selectedVariant, modifierSelections, quantity, item, hasVariants]);

	const currency = hasVariants ? item.priceVariants[0]?.price.currency || 'USD' : item.price?.currency || 'USD';

	const formatPrice = (amount: number) =>
		new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);

	const addToCart = async () => {
		setLoading(true);
		setMessage(null);
		try {
			await currentCart.addToCurrentCart({
				lineItems: [
					{
						quantity,
						catalogReference: {
							appId: RESTAURANTS_APP_ID,
							catalogItemId: item._id,
							options: {
								...(selectedVariant ? { variantId: selectedVariant } : {}),
								...Object.fromEntries(Object.entries(modifierSelections).filter(([, v]) => v.length > 0)),
							},
						},
					},
				],
			});
			setMessage({ type: 'success', text: t('restaurant.addedToCart') });
			window.dispatchEvent(new Event('cart-updated'));
		} catch (e) {
			setMessage({
				type: 'error',
				text: e instanceof Error ? e.message : t('restaurant.failedAddToCart'),
			});
		} finally {
			setLoading(false);
		}
	};

	return (
		<div style={styles.root}>
			{hasVariants && (
				<div style={styles.section}>
					<label style={styles.label}>{t('restaurant.selectSize')}</label>
					<div style={styles.variantGrid}>
						{item.priceVariants.map((v) => (
							<button
								key={v._id}
								onClick={() => setSelectedVariant(v._id)}
								style={{
									...styles.variantBtn,
									borderColor: selectedVariant === v._id ? '#ff6600' : '#333',
									background: selectedVariant === v._id ? 'rgba(255, 102, 0, 0.15)' : '#1a1a1a',
									color: selectedVariant === v._id ? '#ff6600' : '#aaa',
								}}
							>
								{v.name && <span style={styles.variantName}>{v.name}</span>}
								<span style={styles.variantPrice}>{formatPrice(parseFloat(v.price.amount))}</span>
							</button>
						))}
					</div>
				</div>
			)}

			{item.modifierGroups.map((group) => {
				const selected = modifierSelections[group._id] || [];
				const isRadio = group.maxChoices === 1;

				return (
					<div key={group._id} style={styles.section}>
						<label style={styles.label}>
							{group.name}
							{group.minChoices > 0 && <span style={styles.required}> *</span>}
						</label>
						<div style={styles.modifierList}>
							{group.modifiers.map((mod) => {
								const isSelected = selected.includes(mod._id);
								return (
									<button
										key={mod._id}
										onClick={() => toggleModifier(group._id, mod._id, group.maxChoices)}
										style={{
											...styles.modifierBtn,
											borderColor: isSelected ? '#ff6600' : '#333',
											background: isSelected ? 'rgba(255, 102, 0, 0.1)' : '#1a1a1a',
										}}
									>
										<span style={styles.modifierIndicator}>
											{isRadio ? (isSelected ? '\u25C9' : '\u25CB') : isSelected ? '\u2611' : '\u2610'}
										</span>
										<span style={styles.modifierName}>{mod.name}</span>
										{mod.additionalPrice && parseFloat(mod.additionalPrice.amount) > 0 && (
											<span style={styles.modifierPrice}>+{formatPrice(parseFloat(mod.additionalPrice.amount))}</span>
										)}
									</button>
								);
							})}
						</div>
					</div>
				);
			})}

			<div style={styles.section}>
				<label style={styles.label}>{t('restaurant.quantity')}</label>
				<div style={styles.qtyControls}>
					<button style={styles.qtyBtn} onClick={() => setQuantity(Math.max(1, quantity - 1))} disabled={quantity <= 1}>
						&minus;
					</button>
					<span style={styles.qtyValue}>{quantity}</span>
					<button style={styles.qtyBtn} onClick={() => setQuantity(quantity + 1)}>
						+
					</button>
				</div>
			</div>

			<div style={styles.totalRow}>
				<span style={styles.totalLabel}>{t('restaurant.total')}</span>
				<span style={styles.totalPrice}>{formatPrice(total)}</span>
			</div>

			<button
				style={{
					...styles.addBtn,
					opacity: loading ? 0.6 : 1,
					cursor: loading ? 'not-allowed' : 'pointer',
				}}
				onClick={addToCart}
				disabled={loading}
			>
				{loading ? t('restaurant.adding') : t('restaurant.addToCart')}
			</button>

			{message && (
				<div
					style={{
						...styles.message,
						background: message.type === 'success' ? 'rgba(76, 175, 80, 0.15)' : 'rgba(244, 67, 54, 0.15)',
						borderColor: message.type === 'success' ? '#4caf50' : '#f44336',
						color: message.type === 'success' ? '#4caf50' : '#f44336',
					}}
				>
					{message.text}
				</div>
			)}
		</div>
	);
}

const styles: Record<string, React.CSSProperties> = {
	root: {
		marginTop: 4,
	},
	section: {
		marginBottom: 20,
	},
	label: {
		display: 'block',
		fontFamily: "'Bangers', cursive",
		fontSize: '0.8rem',
		letterSpacing: 1,
		color: '#888',
		marginBottom: 8,
		textTransform: 'uppercase',
	},
	required: {
		color: '#f44336',
	},
	variantGrid: {
		display: 'flex',
		flexWrap: 'wrap',
		gap: 8,
	},
	variantBtn: {
		padding: '12px 20px',
		borderRadius: 8,
		border: '1px solid #333',
		cursor: 'pointer',
		transition: 'all 0.2s',
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		gap: 4,
		minWidth: 80,
	},
	variantName: {
		fontSize: '0.85rem',
		fontWeight: 600,
	},
	variantPrice: {
		fontSize: '0.75rem',
		opacity: 0.7,
	},
	modifierList: {
		display: 'flex',
		flexDirection: 'column',
		gap: 6,
	},
	modifierBtn: {
		display: 'flex',
		alignItems: 'center',
		gap: 10,
		padding: '10px 14px',
		borderRadius: 8,
		border: '1px solid #333',
		cursor: 'pointer',
		transition: 'all 0.2s',
		color: '#e0e0e0',
		textAlign: 'left',
		width: '100%',
	},
	modifierIndicator: {
		fontSize: '1rem',
		color: '#ff6600',
		flexShrink: 0,
	},
	modifierName: {
		flex: 1,
		fontSize: '0.85rem',
	},
	modifierPrice: {
		fontSize: '0.75rem',
		color: '#ff6600',
		flexShrink: 0,
	},
	qtyControls: {
		display: 'flex',
		alignItems: 'center',
		gap: 0,
		width: 'fit-content',
		border: '1px solid #333',
		borderRadius: 8,
		overflow: 'hidden',
	},
	qtyBtn: {
		width: 36,
		height: 36,
		background: '#1a1a1a',
		border: 'none',
		color: '#aaa',
		fontSize: '1.1rem',
		cursor: 'pointer',
		transition: 'background 0.2s',
	},
	qtyValue: {
		width: 44,
		textAlign: 'center',
		fontWeight: 700,
		fontSize: '0.95rem',
		color: '#e0e0e0',
		background: '#141414',
		height: 36,
		lineHeight: '36px',
	},
	totalRow: {
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'center',
		padding: '16px 0',
		borderTop: '1px solid #222',
		marginBottom: 16,
	},
	totalLabel: {
		fontFamily: "'Bangers', cursive",
		fontSize: '1rem',
		letterSpacing: 1,
		color: '#ccc',
	},
	totalPrice: {
		fontSize: '1.3rem',
		fontWeight: 700,
		color: '#ffcc00',
	},
	addBtn: {
		width: '100%',
		padding: '14px 24px',
		background: '#ff6600',
		color: '#000',
		border: 'none',
		borderRadius: 8,
		fontFamily: "'Bangers', cursive",
		fontSize: '1rem',
		letterSpacing: 1.5,
		fontWeight: 700,
		transition: 'all 0.2s',
	},
	message: {
		marginTop: 12,
		padding: '10px 14px',
		borderRadius: 8,
		fontSize: '0.85rem',
		border: '1px solid',
	},
};
