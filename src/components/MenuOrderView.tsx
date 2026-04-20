import { useState, useEffect, useRef } from "react";
import { currentCart } from "@wix/ecom";
import { i18n } from "@wix/essentials";
import { RESTAURANTS_APP_ID } from "../utils/appIds";

interface Modifier {
  _id: string;
  name: string;
  additionalPrice: { amount: string } | null;
  preSelected?: boolean;
}

interface ModifierGroup {
  _id: string;
  name: string;
  required?: boolean;
  minChoices: number;
  maxChoices: number;
  modifiers: Modifier[];
}

interface PriceVariant {
  _id: string;
  name: string;
  price: { amount: string; currency: string };
}

interface LabelInfo {
  name: string;
  icon: string | null;
}

interface MenuItem {
  _id: string;
  name: string;
  description: string;
  image: string | null;
  price: { amount: string; currency: string } | null;
  priceVariants: PriceVariant[];
  labels: LabelInfo[];
  modifierGroups: ModifierGroup[];
  menuId: string;
  sectionId: string;
  operationId: string;
}

interface MenuSection {
  _id: string;
  name: string;
  items: MenuItem[];
}

interface CartLine {
  lineId: string;
  quantity: number;
  variantId: string | null;
  modifierSelections: Record<string, string[]>;
  summary: string[];
}

interface FulfillmentMethod {
  _id: string;
  type: string; // "PICKUP" | "DELIVERY" | "DINE_IN"
  name: string;
  fee: string | null;
  minOrderPrice: string | null;
}

interface TimeSlotOption {
  start: string;
  end: string;
  scheduling: string;
  fee: string | null;
  minOrder: string | null;
}

interface Props {
  sections: MenuSection[];
  currency: string;
  operationId: string;
  businessLocationId: string;
  fulfillmentMethods: FulfillmentMethod[];
}

const slugifySection = (name: string) =>
  "sec-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

interface RawOptions {
  priceVariant?: { id?: string; _id?: string; variantId?: string } | null;
  modifierGroups?: Array<{
    id?: string;
    _id?: string;
    modifierGroupId?: string;
    modifiers?: Array<{ id?: string; _id?: string; modifierId?: string }> | null;
  }> | null;
  selectedVariant?: { id?: string; _id?: string; variantId?: string } | null;
}

function extractCartLine(
  lineId: string,
  quantity: number,
  rawOptions: RawOptions,
  item: MenuItem
): CartLine {
  const pv = rawOptions.priceVariant ?? rawOptions.selectedVariant;
  const variantId = pv?.id ?? pv?._id ?? pv?.variantId ?? null;
  const modifierSelections: Record<string, string[]> = {};
  for (const g of rawOptions.modifierGroups || []) {
    const groupId = g.id ?? g._id ?? g.modifierGroupId;
    if (!groupId) continue;
    const modIds = (g.modifiers || [])
      .map(m => m.id ?? m._id ?? m.modifierId ?? "")
      .filter(Boolean);
    if (modIds.length > 0) modifierSelections[groupId] = modIds;
  }

  const summary: string[] = [];
  if (variantId) {
    const v = item.priceVariants.find(pv => pv._id === variantId);
    if (v?.name) summary.push(v.name);
  }
  for (const group of item.modifierGroups) {
    const selIds = modifierSelections[group._id] || [];
    if (selIds.length === 0) continue;
    const names = selIds
      .map(id => group.modifiers.find(m => m._id === id)?.name)
      .filter((n): n is string => !!n);
    if (names.length > 0) summary.push(`${group.name}: ${names.join(", ")}`);
  }

  return { lineId, quantity, variantId, modifierSelections, summary };
}

export default function MenuOrderView({ sections, currency, operationId, businessLocationId, fulfillmentMethods }: Props) {
  const t = i18n.getTranslationFunction();

  const itemById = new Map<string, MenuItem>();
  for (const s of sections) for (const i of s.items) itemById.set(i._id, i);

  const [cartLinesByItem, setCartLinesByItem] = useState<Record<string, CartLine[]>>({});
  const [activeSection, setActiveSection] = useState<string>(sections[0]?._id ?? "");
  const [modalItem, setModalItem] = useState<MenuItem | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [variantSel, setVariantSel] = useState<Record<string, string>>({});
  const [modSel, setModSel] = useState<Record<string, Record<string, string[]>>>({});
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busyAction, setBusyAction] = useState<null | "add" | "update" | "remove">(null);
  const busy = busyAction !== null;
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // Unique dispatch types from the configured fulfillment methods (PICKUP, DELIVERY).
  // Prefer pickup as the default — it doesn't require an address to activate.
  const dispatchTypes = [...new Set(fulfillmentMethods.map(fm => fm.type))]
    .sort((a, b) => (a === "PICKUP" ? -1 : b === "PICKUP" ? 1 : 0));
  const [dispatchType, setDispatchType] = useState<string>(dispatchTypes[0] ?? "PICKUP");
  const [address, setAddress] = useState<string>("");
  const [addressError, setAddressError] = useState<string | null>(null);
  const needsAddress = dispatchType === "DELIVERY";

  // "ASAP" sentinel or an ISO time-slot start string.
  const [selectedSlot, setSelectedSlot] = useState<"ASAP" | string>("ASAP");
  const [slotsByType, setSlotsByType] = useState<Record<string, TimeSlotOption[]>>({});
  const [slotsDate, setSlotsDate] = useState<string>("");
  const [slotsLoading, setSlotsLoading] = useState(false);

  useEffect(() => {
    // Default to today's slots in the restaurant timezone (Asia/Jerusalem here).
    const today = new Date();
    const iso = today.toISOString().split("T")[0]!;
    setSlotsDate(iso);
  }, []);

  const fetchSlots = async (type: string, date: string, addr: string) => {
    if (!operationId || !date) return;
    setSlotsLoading(true);
    try {
      const res = await fetch("/api/restaurant-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationId, date, address: type === "DELIVERY" ? addr : "" }),
      });
      const data = await res.json() as {
        slotsByType?: Record<string, TimeSlotOption[]>;
        deliveryServiceable?: boolean;
      };
      setSlotsByType(data.slotsByType || {});
      if (type === "DELIVERY" && addr && data.deliveryServiceable === false) {
        setAddressError(t("restaurant.addressNotServiceable"));
      }
    } catch {
      setSlotsByType({});
    } finally {
      setSlotsLoading(false);
    }
  };

  useEffect(() => {
    if (!slotsDate) return;
    if (dispatchType === "DELIVERY" && !address.trim()) {
      // Don't fetch delivery slots without an address — they'll all be empty anyway.
      setSlotsByType(prev => ({ ...prev, DELIVERY: [] }));
      return;
    }
    void fetchSlots(dispatchType, slotsDate, address.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatchType, slotsDate, address]);

  const currentTypeSlots = slotsByType[dispatchType] || [];
  const hasAsap = currentTypeSlots.some(s => s.scheduling === "ASAP");
  const preorderSlots = currentTypeSlots.filter(s => s.scheduling === "PREORDER");

  const selectedFulfillment = fulfillmentMethods.find(fm => fm.type === dispatchType) ?? null;

  const applyDispatchToCart = async (type: string, addr: string | null, slot: "ASAP" | string) => {
    try {
      let code: string;
      if (slot === "ASAP") {
        // Wix OLO code format for ASAP: "{TYPE}|ASAP" (two parts, not three).
        code = `${type}|ASAP`;
      } else {
        const slotObj = currentTypeSlots.find(s => s.start === slot);
        const startMs = slotObj ? new Date(slotObj.start).getTime() : new Date(slot).getTime();
        const endMs = slotObj ? new Date(slotObj.end).getTime() : startMs + 30 * 60 * 1000;
        code = `${type}|${startMs}|${endMs}`;
      }
      const cartInfo: currentCart.Cart = {
        selectedShippingOption: { code },
        ...(businessLocationId ? { businessLocationId } : {}),
      };
      if (type === "DELIVERY" && addr) {
        cartInfo.contactInfo = { address: { addressLine1: addr } };
      }
      await currentCart.updateCurrentCart({ cartInfo });
    } catch (e) {
      console.error("Failed to update cart dispatch:", e);
    }
  };

  const formatSlotTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const priceFormatter = new Intl.NumberFormat(undefined, { style: "currency", currency });
  const formatAmount = (n: number): string => priceFormatter.format(n);

  const loadCart = async () => {
    try {
      const cart = await currentCart.getCurrentCart();
      const byItem: Record<string, CartLine[]> = {};
      for (const li of cart.lineItems || []) {
        const catalogItemId = li.catalogReference?.catalogItemId;
        if (!catalogItemId || !li._id) continue;
        const item = itemById.get(catalogItemId);
        if (!item) continue;
        const rawOpts = (li.catalogReference?.options as RawOptions) || {};
        const line = extractCartLine(li._id, li.quantity || 0, rawOpts, item);
        (byItem[catalogItemId] ||= []).push(line);
      }
      setCartLinesByItem(byItem);
    } catch {
      setCartLinesByItem({});
    }
  };

  // On mount, apply the default dispatch type to the cart (unless DELIVERY which needs address).
  useEffect(() => {
    if (dispatchTypes.length === 0) return;
    if (dispatchType === "DELIVERY") return;
    void applyDispatchToCart(dispatchType, null, "ASAP");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadCart();
    const handler = () => loadCart();
    const editHandler = async (e: Event) => {
      const ce = e as CustomEvent<{ lineId: string; catalogItemId: string }>;
      const { lineId, catalogItemId } = ce.detail || ({} as { lineId?: string; catalogItemId?: string });
      if (!lineId || !catalogItemId) return;
      const item = itemById.get(catalogItemId);
      if (!item) return;
      // Get fresh cart to find the specific line
      try {
        const cart = await currentCart.getCurrentCart();
        const li = (cart.lineItems || []).find(l => l._id === lineId);
        const rawOpts = (li?.catalogReference?.options as RawOptions) || {};
        const line = li ? extractCartLine(lineId, li.quantity || 0, rawOpts, item) : null;
        openItem(item, line);
      } catch {
        openItem(item, null);
      }
    };
    window.addEventListener("cart-updated", handler);
    window.addEventListener("restaurant-edit-line", editHandler as EventListener);
    return () => {
      window.removeEventListener("cart-updated", handler);
      window.removeEventListener("restaurant-edit-line", editHandler as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActiveSection(visible[0].target.id.replace(/^sec-/, ""));
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    sections.forEach(s => {
      const el = sectionRefs.current[s._id];
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  const scrollToSection = (id: string) => {
    const el = sectionRefs.current[id];
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  const hasCustomization = (item: MenuItem): boolean =>
    item.priceVariants.length > 0 || item.modifierGroups.length > 0;

  const priceLabel = (item: MenuItem): string => {
    if (item.priceVariants.length > 0) {
      const prices = item.priceVariants.map(v => parseFloat(v.price.amount));
      return formatAmount(Math.min(...prices));
    }
    if (item.price) return formatAmount(parseFloat(item.price.amount));
    return "";
  };

  const linePriceLabel = (item: MenuItem, line: CartLine): string => {
    const variant = line.variantId
      ? item.priceVariants.find(v => v._id === line.variantId)
      : undefined;
    const base = variant
      ? parseFloat(variant.price.amount)
      : item.price
        ? parseFloat(item.price.amount)
        : 0;
    let extra = 0;
    for (const group of item.modifierGroups) {
      const selIds = line.modifierSelections[group._id] || [];
      for (const id of selIds) {
        const mod = group.modifiers.find(m => m._id === id);
        if (mod?.additionalPrice) extra += parseFloat(mod.additionalPrice.amount);
      }
    }
    return formatAmount(base + extra);
  };

  const totalQtyFor = (itemId: string) =>
    (cartLinesByItem[itemId] || []).reduce((s, l) => s + l.quantity, 0);

  const resetModalForm = (item: MenuItem) => {
    if (item.priceVariants.length > 0 && !variantSel[item._id]) {
      setVariantSel(prev => ({ ...prev, [item._id]: item.priceVariants[0]!._id }));
    }
    setQty(prev => ({ ...prev, [item._id]: 1 }));
    const preselected: Record<string, string[]> = {};
    for (const group of item.modifierGroups) {
      const pre = group.modifiers.filter(m => m.preSelected).map(m => m._id);
      if (pre.length > 0) preselected[group._id] = pre;
    }
    setModSel(prev => ({ ...prev, [item._id]: preselected }));
  };

  const preloadFormFromLine = (item: MenuItem, line: CartLine) => {
    if (line.variantId) setVariantSel(prev => ({ ...prev, [item._id]: line.variantId! }));
    setModSel(prev => ({ ...prev, [item._id]: { ...line.modifierSelections } }));
    setQty(prev => ({ ...prev, [item._id]: line.quantity }));
  };

  const openItem = (item: MenuItem, specificLine: CartLine | null = null) => {
    setModalItem(item);
    if (specificLine) {
      preloadFormFromLine(item, specificLine);
      setEditingLineId(specificLine.lineId);
    } else {
      resetModalForm(item);
      setEditingLineId(null);
    }
  };

  const closeModal = () => {
    setModalItem(null);
    setEditingLineId(null);
  };

  useEffect(() => {
    if (!modalItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalItem]);

  const toggleModifier = (itemId: string, groupId: string, modId: string, max: number) => {
    setModSel(prev => {
      const g = prev[itemId]?.[groupId] || [];
      const isSel = g.includes(modId);
      let next: string[];
      if (max === 1) {
        // Radio: clicking the same item keeps it; clicking another replaces
        next = isSel ? g : [modId];
      } else if (isSel) {
        next = g.filter(x => x !== modId);
      } else if (max > 0 && g.length >= max) {
        next = g;
      } else {
        next = [...g, modId];
      }
      return { ...prev, [itemId]: { ...(prev[itemId] || {}), [groupId]: next } };
    });
  };

  const buildOptions = (item: MenuItem) => {
    const variantId = variantSel[item._id];
    const selectedVariant = item.priceVariants.find(v => v._id === variantId);
    const itemMods = modSel[item._id] || {};

    const priceVariant = selectedVariant
      ? {
          id: selectedVariant._id,
          formattedPrice: formatAmount(parseFloat(selectedVariant.price.amount)),
        }
      : undefined;

    const modifierGroups = item.modifierGroups
      .map(group => {
        const selectedIds = itemMods[group._id] || [];
        if (selectedIds.length === 0) return null;
        const modifiers = selectedIds
          .map(id => {
            const mod = group.modifiers.find(m => m._id === id);
            if (!mod) return null;
            const priceNum = mod.additionalPrice ? parseFloat(mod.additionalPrice.amount) : 0;
            const formattedPrice = priceNum > 0 ? formatAmount(priceNum) : undefined;
            return { id: mod._id, price: mod.additionalPrice?.amount, formattedPrice };
          })
          .filter((m): m is NonNullable<typeof m> => m !== null);
        return { id: group._id, modifiers };
      })
      .filter((g): g is NonNullable<typeof g> => g !== null && g.modifiers.length > 0);

    const options: Record<string, unknown> = {
      operationId: item.operationId,
      menuId: item.menuId,
      sectionId: item.sectionId,
    };
    if (priceVariant) options.priceVariant = priceVariant;
    if (modifierGroups.length > 0) options.modifierGroups = modifierGroups;
    return options;
  };

  const canSubmit = (item: MenuItem): boolean => {
    const itemMods = modSel[item._id] || {};
    for (const g of item.modifierGroups) {
      if (g.minChoices > 0 && (itemMods[g._id] || []).length < g.minChoices) return false;
    }
    return true;
  };

  const computeLineTotal = (item: MenuItem): string => {
    const variantId = variantSel[item._id];
    const selectedVariant = item.priceVariants.find(v => v._id === variantId);
    const base = selectedVariant
      ? parseFloat(selectedVariant.price.amount)
      : item.price
        ? parseFloat(item.price.amount)
        : 0;
    const itemMods = modSel[item._id] || {};
    let extra = 0;
    for (const g of item.modifierGroups) {
      for (const id of itemMods[g._id] || []) {
        const mod = g.modifiers.find(m => m._id === id);
        if (mod?.additionalPrice) extra += parseFloat(mod.additionalPrice.amount);
      }
    }
    const quantity = qty[item._id] || 1;
    return formatAmount((base + extra) * quantity);
  };

  const addNewLine = async (item: MenuItem) => {
    if (!canSubmit(item)) return;
    setBusyAction(editingLineId ? "update" : "add");
    try {
      const quantity = qty[item._id] || 1;
      if (editingLineId) {
        await currentCart.removeLineItemsFromCurrentCart([editingLineId]);
      }
      await currentCart.addToCurrentCart({
        lineItems: [
          {
            quantity,
            catalogReference: {
              appId: RESTAURANTS_APP_ID,
              catalogItemId: item._id,
              options: buildOptions(item),
            },
          },
        ],
      });
      window.dispatchEvent(new Event("cart-updated"));
      await loadCart();
      closeModal();
    } catch (e) {
      console.error("Failed to add to cart:", e);
    } finally {
      setBusyAction(null);
    }
  };

  const removeLine = async (lineId: string) => {
    setBusyAction("remove");
    try {
      await currentCart.removeLineItemsFromCurrentCart([lineId]);
      window.dispatchEvent(new Event("cart-updated"));
      await loadCart();
      closeModal();
    } catch (e) {
      console.error("Failed to remove line:", e);
    } finally {
      setBusyAction(null);
    }
  };

  const startAddAnother = (item: MenuItem) => {
    resetModalForm(item);
    setEditingLineId(null);
  };

  const onSelectDispatch = (type: string) => {
    setDispatchType(type);
    setAddressError(null);
    setSelectedSlot("ASAP");
    if (type !== "DELIVERY") void applyDispatchToCart(type, null, "ASAP");
  };

  const onCommitAddress = () => {
    const trimmed = address.trim();
    if (dispatchType === "DELIVERY" && trimmed.length < 3) {
      setAddressError(t("restaurant.addressRequired"));
      return;
    }
    setAddressError(null);
    // Address-triggered refresh happens via the useEffect; cart update happens when a slot is chosen.
  };

  const onSelectSlot = (slot: "ASAP" | string) => {
    setSelectedSlot(slot);
    const addr = dispatchType === "DELIVERY" ? address.trim() : null;
    if (dispatchType === "DELIVERY" && !addr) return;
    void applyDispatchToCart(dispatchType, addr, slot);
  };

  const dispatchLabel = (type: string): string => {
    if (type === "PICKUP") return t("restaurant.pickup");
    if (type === "DELIVERY") return t("restaurant.delivery");
    if (type === "DINE_IN") return t("restaurant.dineIn");
    return type;
  };

  return (
    <div className="mov-layout">
      {dispatchTypes.length > 0 && (
        <div className="mov-dispatch">
          <div className="mov-dispatch-row">
            <div className="mov-dispatch-tabs">
              {dispatchTypes.map(type => (
                <button
                  key={type}
                  type="button"
                  className={`mov-dispatch-tab ${dispatchType === type ? "active" : ""}`}
                  onClick={() => onSelectDispatch(type)}
                >
                  {dispatchLabel(type)}
                </button>
              ))}
            </div>
            {needsAddress && (
              <div className="mov-dispatch-address">
                <input
                  type="text"
                  className="mov-dispatch-address-input"
                  placeholder={t("restaurant.addressPlaceholder")}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  onBlur={onCommitAddress}
                  aria-invalid={!!addressError}
                />
                {addressError && <span className="mov-dispatch-address-error">{addressError}</span>}
              </div>
            )}
            {selectedFulfillment?.fee && parseFloat(selectedFulfillment.fee) > 0 && (
              <div className="mov-dispatch-note">
                {t("restaurant.fee")}: {formatAmount(parseFloat(selectedFulfillment.fee))}
              </div>
            )}
          </div>

          <div className="mov-dispatch-row">
            <label className="mov-dispatch-label">{t("restaurant.when")}:</label>
            <select
              className="mov-dispatch-select"
              value={selectedSlot}
              onChange={(e) => onSelectSlot(e.target.value as "ASAP" | string)}
              disabled={slotsLoading || (needsAddress && !address.trim())}
            >
              {hasAsap && <option value="ASAP">{t("restaurant.asap")}</option>}
              {preorderSlots.map(s => (
                <option key={s.start} value={s.start}>
                  {formatSlotTime(s.start)} – {formatSlotTime(s.end)}
                </option>
              ))}
              {!hasAsap && preorderSlots.length === 0 && !slotsLoading && (
                <option value="ASAP" disabled>{t("restaurant.noSlotsAvailable")}</option>
              )}
            </select>
            <input
              type="date"
              className="mov-dispatch-date"
              value={slotsDate}
              min={new Date().toISOString().split("T")[0]}
              onChange={(e) => setSlotsDate(e.target.value)}
            />
          </div>
        </div>
      )}
      <aside className="mov-side">
        <nav className="mov-nav">
          {sections.map(s => (
            <button
              key={s._id}
              type="button"
              className={`mov-nav-item ${activeSection === s._id ? "active" : ""}`}
              onClick={() => scrollToSection(s._id)}
            >
              {s.name}
            </button>
          ))}
        </nav>
      </aside>

      <div className="mov-main">
        {sections.map(section => (
          <section
            key={section._id}
            id={slugifySection(section.name || section._id)}
            ref={el => { sectionRefs.current[section._id] = el; }}
            className="mov-section"
          >
            <h2 className="mov-section-title">{section.name}</h2>
            <div className="mov-grid">
              {section.items.flatMap(item => {
                const lines = cartLinesByItem[item._id] || [];
                // Customizable items with lines: one card per line.
                // Non-customizable items merge into a single line; still pass it for edit-mode.
                if (lines.length > 0 && hasCustomization(item)) {
                  return lines.map(line => ({ item, line, badge: line.quantity }));
                }
                const singleLine: CartLine | null = lines[0] ?? null;
                return [{ item, line: singleLine, badge: totalQtyFor(item._id) }];
              }).map(({ item, line, badge }) => {
                const key = item._id + (line ? `:${line.lineId}` : ":base");
                return (
                  <button
                    key={key}
                    type="button"
                    className="mov-card"
                    onClick={() => openItem(item, line)}
                  >
                    <div className="mov-card-body">
                      <div className="mov-card-name">{item.name}</div>
                      {item.description && <div className="mov-card-desc">{item.description}</div>}
                      {item.labels.length > 0 && (
                        <div className="mov-card-labels">
                          {item.labels.map((l, i) => (
                            <span key={i} className="mov-label" title={l.name}>
                              {l.icon && (
                                <span
                                  className="mov-label-icon"
                                  style={{
                                    WebkitMaskImage: `url(${l.icon})`,
                                    maskImage: `url(${l.icon})`,
                                  }}
                                />
                              )}
                              <span>{l.name}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mov-card-price">{line ? linePriceLabel(item, line) : priceLabel(item)}</div>
                      {line && line.summary.length > 0 && (
                        <div className="mov-card-summary">
                          <div className="mov-card-summary-line">
                            {line.summary.join(" • ")}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="mov-card-image">
                      {item.image ? (
                        <img src={item.image} alt={item.name} loading="lazy" />
                      ) : (
                        <div className="mov-card-ph">🍽️</div>
                      )}
                      <span className={`mov-card-badge ${badge > 0 ? "has-qty" : ""}`}>
                        {badge > 0 ? badge : "+"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {modalItem && (
        <div className="mov-modal-overlay" onClick={closeModal}>
          <div className="mov-modal" onClick={e => e.stopPropagation()}>
            {modalItem.image && (
              <div className="mov-modal-hero">
                <img src={modalItem.image} alt={modalItem.name} />
              </div>
            )}
            <button type="button" className="mov-modal-close" onClick={closeModal} aria-label="Close">×</button>
            <div className="mov-modal-body">
              <h3 className="mov-modal-title">{modalItem.name}</h3>
              {modalItem.description && <p className="mov-modal-desc">{modalItem.description}</p>}

              {(
                <>
                  {editingLineId && (
                    <div className="mov-edit-banner">
                      <span className="mov-edit-banner-text">{t("restaurant.editingExisting")}</span>
                      <button
                        type="button"
                        className="mov-edit-banner-link"
                        onClick={() => startAddAnother(modalItem)}
                        disabled={busy}
                      >
                        {t("restaurant.addAnotherWithDifferent")}
                      </button>
                    </div>
                  )}

                  {modalItem.priceVariants.length > 0 && (
                    <div className="mov-group">
                      <div className="mov-group-label">{t("restaurant.selectSize")}</div>
                      <div className="mov-variant-list">
                        {modalItem.priceVariants.map(v => {
                          const active = variantSel[modalItem._id] === v._id;
                          return (
                            <button
                              key={v._id}
                              type="button"
                              className={`mov-variant-btn ${active ? "active" : ""}`}
                              onClick={() => setVariantSel(p => ({ ...p, [modalItem._id]: v._id }))}
                            >
                              <span>{v.name || modalItem.name}</span>
                              <span>{formatAmount(parseFloat(v.price.amount))}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {modalItem.modifierGroups.map(group => {
                    const sel = modSel[modalItem._id]?.[group._id] || [];
                    const invalid = group.minChoices > 0 && sel.length < group.minChoices;
                    return (
                      <div key={group._id} className="mov-group">
                        <div className={`mov-group-label ${invalid ? "mov-group-invalid" : ""}`}>
                          {group.name}
                          {group.minChoices > 0 && <span className="mov-req"> *</span>}
                          {group.maxChoices > 1 && (
                            <span className="mov-group-hint"> · {group.minChoices > 0 ? `choose ${group.minChoices}${group.maxChoices > group.minChoices ? `–${group.maxChoices}` : ""}` : `up to ${group.maxChoices}`}</span>
                          )}
                        </div>
                        {group.modifiers.map(mod => {
                          const active = sel.includes(mod._id);
                          const isRadio = group.maxChoices === 1;
                          const icon = isRadio ? (active ? "●" : "○") : (active ? "☑" : "☐");
                          return (
                            <button
                              key={mod._id}
                              type="button"
                              className={`mov-mod-btn ${active ? "active" : ""}`}
                              onClick={() => toggleModifier(modalItem._id, group._id, mod._id, group.maxChoices)}
                              role={isRadio ? "radio" : "checkbox"}
                              aria-checked={active}
                            >
                              <span>{icon} {mod.name}</span>
                              {mod.additionalPrice && parseFloat(mod.additionalPrice.amount) > 0 && (
                                <span className="mov-mod-price">+{formatAmount(parseFloat(mod.additionalPrice.amount))}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}

                  <div className="mov-group">
                    <div className="mov-group-label">{t("restaurant.quantity")}</div>
                    <div className="mov-qty-row">
                      <button type="button" className="mov-qty-btn" onClick={() => setQty(p => ({ ...p, [modalItem._id]: Math.max(1, (p[modalItem._id] || 1) - 1) }))}>−</button>
                      <span className="mov-qty-val">{qty[modalItem._id] || 1}</span>
                      <button type="button" className="mov-qty-btn" onClick={() => setQty(p => ({ ...p, [modalItem._id]: (p[modalItem._id] || 1) + 1 }))}>+</button>
                    </div>
                  </div>

                  <div className="mov-actions-row">
                    {editingLineId && (
                      <button
                        type="button"
                        className="mov-secondary-btn mov-remove-btn"
                        onClick={() => removeLine(editingLineId)}
                        disabled={busy}
                        aria-label={t("restaurant.remove")}
                      >
                        🗑
                      </button>
                    )}
                    <button
                      type="button"
                      className="mov-confirm"
                      disabled={busy || !canSubmit(modalItem)}
                      onClick={() => addNewLine(modalItem)}
                    >
                      {busyAction === "remove"
                        ? t("restaurant.removing")
                        : busyAction === "update"
                          ? t("restaurant.updating")
                          : busyAction === "add"
                            ? t("restaurant.adding")
                            : editingLineId
                              ? `${t("restaurant.updateOrder")} ${computeLineTotal(modalItem)}`
                              : `${t("restaurant.addToCart")} ${computeLineTotal(modalItem)}`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
