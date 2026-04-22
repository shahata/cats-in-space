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

interface PickupAddress {
  addressLine1: string;
  city?: string;
  country?: string;
  postalCode?: string;
  subdivision?: string;
}

interface Props {
  sections: MenuSection[];
  currency: string;
  operationId: string;
  businessLocationId: string;
  pickupAddress: PickupAddress | null;
  fulfillmentMethods: FulfillmentMethod[];
  // From `operation.defaultFulfillmentType` — "PICKUP" or "DELIVERY". Empty
  // string means the operation didn't declare one; fall back to the first
  // available method in that case.
  defaultDispatchType: string;
  // Derived from `operation.orderScheduling` — true when the restaurant allows
  // preorder (future-dated orders). When false we hide the Schedule button
  // entirely; the cart stays on ASAP.
  schedulingEnabled: boolean;
}

const slugifySection = (name: string) =>
  "sec-" +
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// Local YYYY-MM-DD (never UTC). A slot whose `start` is UTC "2026-04-21T20:45:00Z"
// is on 2026-04-21 local in Tel Aviv (GMT+3 → 23:45) but on 2026-04-21 UTC — so
// UTC vs local day can differ by ±1 depending on timezone. For the Schedule
// dropdown to match the user's calendar, always bucket by local day.
const toLocalDayKey = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

interface RawOptions {
  priceVariant?: { id?: string; _id?: string; variantId?: string } | null;
  modifierGroups?: Array<{
    id?: string;
    _id?: string;
    modifierGroupId?: string;
    modifiers?: Array<{
      id?: string;
      _id?: string;
      modifierId?: string;
    }> | null;
  }> | null;
  selectedVariant?: { id?: string; _id?: string; variantId?: string } | null;
}

function extractCartLine(
  lineId: string,
  quantity: number,
  rawOptions: RawOptions,
  item: MenuItem,
): CartLine {
  const pv = rawOptions.priceVariant ?? rawOptions.selectedVariant;
  const variantId = pv?.id ?? pv?._id ?? pv?.variantId ?? null;
  const modifierSelections: Record<string, string[]> = {};
  for (const g of rawOptions.modifierGroups || []) {
    const groupId = g.id ?? g._id ?? g.modifierGroupId;
    if (!groupId) continue;
    const modIds = (g.modifiers || [])
      .map((m) => m.id ?? m._id ?? m.modifierId ?? "")
      .filter(Boolean);
    if (modIds.length > 0) modifierSelections[groupId] = modIds;
  }

  const summary: string[] = [];
  if (variantId) {
    const v = item.priceVariants.find((pv) => pv._id === variantId);
    if (v?.name) summary.push(v.name);
  }
  for (const group of item.modifierGroups) {
    const selIds = modifierSelections[group._id] || [];
    if (selIds.length === 0) continue;
    const names = selIds
      .map((id) => group.modifiers.find((m) => m._id === id)?.name)
      .filter((n): n is string => !!n);
    if (names.length > 0) summary.push(`${group.name}: ${names.join(", ")}`);
  }

  return { lineId, quantity, variantId, modifierSelections, summary };
}

export default function MenuOrderView({
  sections,
  currency,
  operationId,
  businessLocationId,
  pickupAddress,
  fulfillmentMethods,
  defaultDispatchType,
  schedulingEnabled,
}: Props) {
  const t = i18n.getTranslationFunction();

  const itemById = new Map<string, MenuItem>();
  for (const s of sections) for (const i of s.items) itemById.set(i._id, i);

  const [cartLinesByItem, setCartLinesByItem] = useState<
    Record<string, CartLine[]>
  >({});
  const [activeSection, setActiveSection] = useState<string>(
    sections[0]?._id ?? "",
  );
  const [modalItem, setModalItem] = useState<MenuItem | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [variantSel, setVariantSel] = useState<Record<string, string>>({});
  const [modSel, setModSel] = useState<
    Record<string, Record<string, string[]>>
  >({});
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busyAction, setBusyAction] = useState<
    null | "add" | "update" | "remove"
  >(null);
  const busy = busyAction !== null;
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // Unique dispatch types from the configured fulfillment methods (PICKUP, DELIVERY).
  // Order follows the list returned by the API so the tab order matches how the
  // restaurant has them configured.
  const dispatchTypes = [...new Set(fulfillmentMethods.map((fm) => fm.type))];
  // Initial selection comes from the operation's `defaultFulfillmentType`
  // (configured in the Wix dashboard); fall back to the first available method
  // only when that value is missing or isn't in the enabled list.
  const initialDispatch = dispatchTypes.includes(defaultDispatchType)
    ? defaultDispatchType
    : (dispatchTypes[0] ?? "PICKUP");
  const [dispatchType, setDispatchType] = useState<string>(initialDispatch);

  // "ASAP" sentinel or an ISO time-slot start string.
  const [selectedSlot, setSelectedSlot] = useState<"ASAP" | string>("ASAP");
  const [slotsByType, setSlotsByType] = useState<
    Record<string, TimeSlotOption[]>
  >({});
  const [slotsDate, setSlotsDate] = useState<string>("");
  const [, setSlotsLoading] = useState(false);
  // Becomes true after the first successful fetch — until then we render
  // "Loading…" placeholders instead of "No slots available".
  const [slotsLoaded, setSlotsLoaded] = useState(false);

  // Schedule popup draft state — only committed to selectedSlot/slotsDate on Confirm.
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleStep, setScheduleStep] = useState<"when" | "schedule">("when");
  const [scheduleMode, setScheduleMode] = useState<"ASAP" | "SCHEDULE">("ASAP");
  const [draftDay, setDraftDay] = useState<string>("");
  const [draftSlot, setDraftSlot] = useState<string>("");
  const [draftSlots, setDraftSlots] = useState<TimeSlotOption[]>([]);
  const [draftLoading, setDraftLoading] = useState(false);
  // Days the restaurant actually has preorder slots for, fetched once when the
  // popup transitions to step 2. The Day dropdown renders from this list so we
  // never show days that would come back empty. Reset when dispatchType changes.
  const [availableDays, setAvailableDays] = useState<
    { iso: string; label: string; slots: TimeSlotOption[] }[]
  >([]);

  useEffect(() => {
    // Default to today's slots in the user's local calendar.
    setSlotsDate(toLocalDayKey(new Date()));
  }, []);

  const fetchSlots = async (date: string) => {
    if (!operationId || !date) return;
    setSlotsLoading(true);
    try {
      const res = await fetch("/api/restaurant-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationId, date, address: "" }),
      });
      const data = (await res.json()) as {
        slotsByType?: Record<string, TimeSlotOption[]>;
      };
      setSlotsByType(data.slotsByType || {});
    } catch {
      setSlotsByType({});
    } finally {
      setSlotsLoading(false);
      setSlotsLoaded(true);
    }
  };

  useEffect(() => {
    if (!slotsDate) return;
    void fetchSlots(slotsDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotsDate]);

  const currentTypeSlots = slotsByType[dispatchType] || [];
  const hasAsap = currentTypeSlots.some((s) => s.scheduling === "ASAP");

  const selectedFulfillment =
    fulfillmentMethods.find((fm) => fm.type === dispatchType) ?? null;

  // Write dispatch to the cart. PICKUP sends the restaurant's own address so
  // cart-v2 doesn't error out (it requires an address alongside every
  // selectedShippingOption). DELIVERY writes the code only — the customer's
  // delivery address is collected on the Wix checkout page, which recalculates
  // totals once they enter it.
  const applyDispatchToCart = async (
    type: string,
    slot: "ASAP" | string,
    slotObj?: TimeSlotOption,
  ) => {
    try {
      let code: string;
      if (slot === "ASAP") {
        // Wix OLO code format for ASAP: "{TYPE}|ASAP" (two parts, not three).
        code = `${type}|ASAP`;
      } else {
        const resolved =
          slotObj ??
          currentTypeSlots.find((s) => s.start === slot) ??
          draftSlots.find((s) => s.start === slot);
        const startMs = resolved
          ? new Date(resolved.start).getTime()
          : new Date(slot).getTime();
        const endMs = resolved
          ? new Date(resolved.end).getTime()
          : startMs + 30 * 60 * 1000;
        code = `${type}|${startMs}|${endMs}`;
      }
      const address =
        type === "PICKUP" && pickupAddress
          ? {
              addressLine1: pickupAddress.addressLine1,
              ...(pickupAddress.city ? { city: pickupAddress.city } : {}),
              ...(pickupAddress.country
                ? { country: pickupAddress.country }
                : {}),
              ...(pickupAddress.postalCode
                ? { postalCode: pickupAddress.postalCode }
                : {}),
              ...(pickupAddress.subdivision
                ? { subdivision: pickupAddress.subdivision }
                : {}),
            }
          : null;
      const cartInfo: currentCart.Cart = {
        selectedShippingOption: { code },
        ...(businessLocationId ? { businessLocationId } : {}),
        ...(address ? { contactInfo: { address } } : {}),
      };
      await currentCart.updateCurrentCart({ cartInfo });
    } catch (e) {
      console.error("Failed to update cart dispatch:", e);
    }
  };

  const locale = i18n.getLocale();
  const formatSlotTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });

  const priceFormatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  });
  const formatAmount = (n: number): string => priceFormatter.format(n);

  const hydratedRef = useRef(false);
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

      // Restore dispatch selection from an existing cart on first load so the user
      // sees the same PICKUP|ASAP / PICKUP|startMs|endMs choice they left with.
      // (Runs only once — subsequent cart-updated events don't overwrite user state.)
      if (!hydratedRef.current) {
        hydratedRef.current = true;
        const code = cart.selectedShippingOption?.code;
        if (code) {
          const parts = code.split("|");
          const type = parts[0];
          if (type && dispatchTypes.includes(type)) setDispatchType(type);
          if (parts.length === 3) {
            const startMs = parseInt(parts[1] || "", 10);
            if (!isNaN(startMs)) {
              // Store the slot's start as a UTC ISO — selectedSlot comparisons use
              // exact string match. Day-level grouping uses toLocalDayKey.
              setSelectedSlot(new Date(startMs).toISOString());
            }
          }
        } else if ((cart.lineItems || []).length > 0) {
          // Cart has items but no dispatch yet — seed with default PICKUP|ASAP so checkout
          // has fulfillment info (see applyDispatchToCart's comment on cart-v2 requirements).
          const defaultType = dispatchTypes[0] ?? "PICKUP";
          void applyDispatchToCart(defaultType, "ASAP");
        }
      }
    } catch {
      setCartLinesByItem({});
    }
  };

  // Dispatch is written to the cart on-demand: in addNewLine (first item creates
  // the cart) and in confirmSchedule* (user picks a time). A mount-time write
  // would race against loadCart's hydration and clobber a scheduled slot back to
  // ASAP, so we don't do that here.

  useEffect(() => {
    loadCart();
    const handler = () => loadCart();
    const editHandler = async (e: Event) => {
      const ce = e as CustomEvent<{ lineId: string; catalogItemId: string }>;
      const { lineId, catalogItemId } =
        ce.detail || ({} as { lineId?: string; catalogItemId?: string });
      if (!lineId || !catalogItemId) return;
      const item = itemById.get(catalogItemId);
      if (!item) return;
      // Get fresh cart to find the specific line
      try {
        const cart = await currentCart.getCurrentCart();
        const li = (cart.lineItems || []).find((l) => l._id === lineId);
        const rawOpts = (li?.catalogReference?.options as RawOptions) || {};
        const line = li
          ? extractCartLine(lineId, li.quantity || 0, rawOpts, item)
          : null;
        openItem(item, line);
      } catch {
        openItem(item, null);
      }
    };
    window.addEventListener("cart-updated", handler);
    window.addEventListener(
      "restaurant-edit-line",
      editHandler as EventListener,
    );
    return () => {
      window.removeEventListener("cart-updated", handler);
      window.removeEventListener(
        "restaurant-edit-line",
        editHandler as EventListener,
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0])
          setActiveSection(visible[0].target.id.replace(/^sec-/, ""));
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    sections.forEach((s) => {
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
      const prices = item.priceVariants.map((v) => parseFloat(v.price.amount));
      return formatAmount(Math.min(...prices));
    }
    if (item.price) return formatAmount(parseFloat(item.price.amount));
    return "";
  };

  const linePriceLabel = (item: MenuItem, line: CartLine): string => {
    const variant = line.variantId
      ? item.priceVariants.find((v) => v._id === line.variantId)
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
        const mod = group.modifiers.find((m) => m._id === id);
        if (mod?.additionalPrice)
          extra += parseFloat(mod.additionalPrice.amount);
      }
    }
    return formatAmount(base + extra);
  };

  const totalQtyFor = (itemId: string) =>
    (cartLinesByItem[itemId] || []).reduce((s, l) => s + l.quantity, 0);

  const resetModalForm = (item: MenuItem) => {
    if (item.priceVariants.length > 0 && !variantSel[item._id]) {
      setVariantSel((prev) => ({
        ...prev,
        [item._id]: item.priceVariants[0]!._id,
      }));
    }
    setQty((prev) => ({ ...prev, [item._id]: 1 }));
    const preselected: Record<string, string[]> = {};
    for (const group of item.modifierGroups) {
      const pre = group.modifiers
        .filter((m) => m.preSelected)
        .map((m) => m._id);
      if (pre.length > 0) preselected[group._id] = pre;
    }
    setModSel((prev) => ({ ...prev, [item._id]: preselected }));
  };

  const preloadFormFromLine = (item: MenuItem, line: CartLine) => {
    if (line.variantId)
      setVariantSel((prev) => ({ ...prev, [item._id]: line.variantId! }));
    setModSel((prev) => ({
      ...prev,
      [item._id]: { ...line.modifierSelections },
    }));
    setQty((prev) => ({ ...prev, [item._id]: line.quantity }));
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

  const toggleModifier = (
    itemId: string,
    groupId: string,
    modId: string,
    max: number,
  ) => {
    setModSel((prev) => {
      const g = prev[itemId]?.[groupId] || [];
      const isSel = g.includes(modId);
      let next: string[];
      if (max === 1) {
        // Radio: clicking the same item keeps it; clicking another replaces
        next = isSel ? g : [modId];
      } else if (isSel) {
        next = g.filter((x) => x !== modId);
      } else if (max > 0 && g.length >= max) {
        next = g;
      } else {
        next = [...g, modId];
      }
      return {
        ...prev,
        [itemId]: { ...(prev[itemId] || {}), [groupId]: next },
      };
    });
  };

  const buildOptions = (item: MenuItem) => {
    const variantId = variantSel[item._id];
    const selectedVariant = item.priceVariants.find((v) => v._id === variantId);
    const itemMods = modSel[item._id] || {};

    const priceVariant = selectedVariant
      ? {
          id: selectedVariant._id,
          formattedPrice: formatAmount(
            parseFloat(selectedVariant.price.amount),
          ),
        }
      : undefined;

    const modifierGroups = item.modifierGroups
      .map((group) => {
        const selectedIds = itemMods[group._id] || [];
        if (selectedIds.length === 0) return null;
        const modifiers = selectedIds
          .map((id) => {
            const mod = group.modifiers.find((m) => m._id === id);
            if (!mod) return null;
            const priceNum = mod.additionalPrice
              ? parseFloat(mod.additionalPrice.amount)
              : 0;
            const formattedPrice =
              priceNum > 0 ? formatAmount(priceNum) : undefined;
            return {
              id: mod._id,
              price: mod.additionalPrice?.amount,
              formattedPrice,
            };
          })
          .filter((m): m is NonNullable<typeof m> => m !== null);
        return { id: group._id, modifiers };
      })
      .filter(
        (g): g is NonNullable<typeof g> => g !== null && g.modifiers.length > 0,
      );

    // Wix Restaurants validations SPI reads catalogReference.options via the
    // CatalogReferenceOptions proto — the section field is `menu_section_id`
    // (camelCase `menuSectionId`). Sending `sectionId` makes ProtoStructMapper
    // drop it, so ItemInSectionValidator reports "<item> is no longer available".
    const options: Record<string, unknown> = {
      operationId: item.operationId,
      menuId: item.menuId,
      menuSectionId: item.sectionId,
    };
    if (priceVariant) options.priceVariant = priceVariant;
    if (modifierGroups.length > 0) options.modifierGroups = modifierGroups;
    return options;
  };

  const canSubmit = (item: MenuItem): boolean => {
    const itemMods = modSel[item._id] || {};
    for (const g of item.modifierGroups) {
      if (g.minChoices > 0 && (itemMods[g._id] || []).length < g.minChoices)
        return false;
    }
    return true;
  };

  const computeLineTotal = (item: MenuItem): string => {
    const variantId = variantSel[item._id];
    const selectedVariant = item.priceVariants.find((v) => v._id === variantId);
    const base = selectedVariant
      ? parseFloat(selectedVariant.price.amount)
      : item.price
        ? parseFloat(item.price.amount)
        : 0;
    const itemMods = modSel[item._id] || {};
    let extra = 0;
    for (const g of item.modifierGroups) {
      for (const id of itemMods[g._id] || []) {
        const mod = g.modifiers.find((m) => m._id === id);
        if (mod?.additionalPrice)
          extra += parseFloat(mod.additionalPrice.amount);
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
      // The first addToCurrentCart creates the cart — the mount-time dispatch
      // PATCH 404s before that, so the cart is born without selectedShippingOption
      // or address and the restaurants SPI fails fulfillment validation at checkout.
      await applyDispatchToCart(dispatchType, selectedSlot);
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
    setSelectedSlot("ASAP");
    void applyDispatchToCart(type, "ASAP");
    // `availableDays` is reset and (if the popup is open on step 2) re-probed
    // in the dispatchType useEffect below.
  };

  // Fetch preorder slots for a given local day. Returns the filtered slots so
  // callers can decide what to do (open popup with them / probe next day / etc.).
  const fetchPreorderSlots = async (day: string): Promise<TimeSlotOption[]> => {
    if (!operationId || !day) return [];
    try {
      const res = await fetch("/api/restaurant-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationId, date: day, address: "" }),
      });
      const data = (await res.json()) as {
        slotsByType?: Record<string, TimeSlotOption[]>;
      };
      // The API may return slots whose local day differs from the requested `day`
      // (timezone drift at day boundaries) — filter to match. Order is not
      // guaranteed either, so sort earliest → latest for the Time dropdown.
      return (data.slotsByType?.[dispatchType] || [])
        .filter(
          (s) =>
            s.scheduling === "PREORDER" &&
            toLocalDayKey(new Date(s.start)) === day,
        )
        .sort(
          (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
        );
    } catch {
      return [];
    }
  };

  // Probe the next `SCHEDULE_DAY_HORIZON` days in parallel and populate
  // `availableDays` with only those that actually have preorder slots. The
  // Day dropdown renders from this list, so a restaurant configured with a
  // 3-day preorder window shows exactly 3 days — not 14 with empties.
  // `preferSlot` lets the caller (reopen case) stick with the user's previous
  // choice if it's still on the menu.
  const SCHEDULE_DAY_HORIZON = 14;
  const loadAvailableDays = async (
    preferSlot?: string,
  ): Promise<{ iso: string; label: string; slots: TimeSlotOption[] }[]> => {
    const candidates = buildScheduleDayOptions(SCHEDULE_DAY_HORIZON);
    const results = await Promise.all(
      candidates.map(async (opt) => {
        const slots = await fetchPreorderSlots(opt.iso);
        return { ...opt, slots };
      }),
    );
    const available = results.filter((d) => d.slots.length > 0);
    setAvailableDays(available);
    // Re-anchor draft state to whatever is still valid.
    if (preferSlot) {
      const dayKey = toLocalDayKey(new Date(preferSlot));
      const dayHit = available.find((d) => d.iso === dayKey);
      if (dayHit && dayHit.slots.find((s) => s.start === preferSlot)) {
        setDraftDay(dayKey);
        setDraftSlots(dayHit.slots);
        setDraftSlot(preferSlot);
        return available;
      }
    }
    const first = available[0];
    if (first) {
      setDraftDay(first.iso);
      setDraftSlots(first.slots);
      setDraftSlot(first.slots[0]?.start || "");
    } else {
      setDraftDay("");
      setDraftSlots([]);
      setDraftSlot("");
    }
    return available;
  };

  const openSchedule = () => {
    const alreadyScheduled = selectedSlot !== "ASAP";
    setScheduleMode(alreadyScheduled ? "SCHEDULE" : "ASAP");
    setScheduleStep(alreadyScheduled ? "schedule" : "when");
    setScheduleOpen(true);
    if (alreadyScheduled) {
      setDraftLoading(true);
      void loadAvailableDays(selectedSlot).finally(() =>
        setDraftLoading(false),
      );
    }
  };

  const closeSchedule = () => setScheduleOpen(false);

  const gotoScheduleStep = async () => {
    setScheduleMode("SCHEDULE");
    setScheduleStep("schedule");
    if (availableDays.length > 0) return; // already loaded this session
    setDraftLoading(true);
    try {
      await loadAvailableDays();
    } finally {
      setDraftLoading(false);
    }
  };

  const onDraftDayChange = (day: string) => {
    setDraftDay(day);
    const hit = availableDays.find((d) => d.iso === day);
    if (hit) {
      setDraftSlots(hit.slots);
      setDraftSlot(hit.slots[0]?.start || "");
    }
  };

  // Dispatch-type changes invalidate the availableDays cache. When the popup is
  // open on step 2, re-probe immediately so the Day / Time dropdowns reflect
  // the new type's slots instead of stale pickup/delivery data. A ref avoids
  // re-running on initial mount before the user has ever touched dispatch.
  const dispatchTypeInitialRef = useRef(true);
  useEffect(() => {
    if (dispatchTypeInitialRef.current) {
      dispatchTypeInitialRef.current = false;
      return;
    }
    setAvailableDays([]);
    if (scheduleOpen && scheduleStep === "schedule") {
      setDraftLoading(true);
      loadAvailableDays().finally(() => setDraftLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatchType]);

  const confirmScheduleAsap = () => {
    setSelectedSlot("ASAP");
    void applyDispatchToCart(dispatchType, "ASAP");
    setScheduleOpen(false);
  };

  const confirmScheduleSlot = () => {
    const slot = draftSlots.find((s) => s.start === draftSlot) ?? draftSlots[0];
    if (!slot) return;
    setSelectedSlot(slot.start);
    // Intentionally don't change slotsDate — it stays on today so slotsByType
    // (used for hasAsap) reflects today's ASAP availability, not the scheduled day.
    void applyDispatchToCart(dispatchType, slot.start, slot);
    setScheduleOpen(false);
  };

  // Build a calendar of up to `count` upcoming local days. We probe these against
  // the slot API and only surface the ones that actually have preorder slots —
  // so the Day dropdown reflects the restaurant's configured preorder window
  // instead of a fixed one-size-fits-all number.
  const buildScheduleDayOptions = (
    count: number,
  ): { iso: string; label: string }[] => {
    const days: { iso: string; label: string }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateFmt = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
    });
    for (let i = 0; i < count; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const iso = toLocalDayKey(d);
      const base =
        i === 0
          ? t("restaurant.today")
          : i === 1
            ? t("restaurant.tomorrow")
            : d.toLocaleDateString(locale, { weekday: "long" });
      // Suffix every option with the actual date so the user can distinguish
      // e.g. two Thursdays or a long preorder window.
      const label = `${base}, ${dateFmt.format(d)}`;
      days.push({ iso, label });
    }
    return days;
  };

  const scheduleButtonLabel = (): string => {
    if (selectedSlot === "ASAP") return t("restaurant.scheduleOrder");
    const d = new Date(selectedSlot);
    const dayKey = toLocalDayKey(d);
    // Use the "Today / Tomorrow / <weekday>, Apr 22" label if the slot falls in
    // the upcoming week; otherwise fall back to a short localized date.
    const dayLabel =
      buildScheduleDayOptions(7).find((o) => o.iso === dayKey)?.label ??
      d.toLocaleDateString(locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
    return `${dayLabel}, ${formatSlotTime(selectedSlot)}`;
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
              {dispatchTypes.map((type) => (
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

            {schedulingEnabled && (
              <div className="mov-schedule-wrap">
                <button
                  type="button"
                  className="mov-schedule-btn"
                  onClick={() =>
                    scheduleOpen ? closeSchedule() : openSchedule()
                  }
                  aria-expanded={scheduleOpen}
                >
                  <span className="mov-schedule-icon" aria-hidden="true">
                    🕒
                  </span>
                  <span>{scheduleButtonLabel()}</span>
                  <span className="mov-schedule-caret" aria-hidden="true">
                    ▾
                  </span>
                </button>
                {scheduleOpen && (
                  <div
                    className="mov-schedule-pop"
                    role="dialog"
                    aria-modal="false"
                  >
                    {scheduleStep === "when" ? (
                      <>
                        <div className="mov-schedule-header">
                          <h3 className="mov-schedule-title">
                            {t("restaurant.scheduleWhen")}
                          </h3>
                          <button
                            type="button"
                            className="mov-schedule-icon-btn"
                            onClick={closeSchedule}
                            aria-label={t("restaurant.close")}
                          >
                            ×
                          </button>
                        </div>
                        <button
                          type="button"
                          className={`mov-schedule-option ${scheduleMode === "ASAP" ? "active" : ""}`}
                          onClick={() => setScheduleMode("ASAP")}
                          disabled={slotsLoaded && !hasAsap}
                        >
                          <span
                            className={`mov-schedule-radio ${scheduleMode === "ASAP" ? "active" : ""}`}
                            aria-hidden="true"
                          />
                          <span className="mov-schedule-option-body">
                            <span className="mov-schedule-option-title">
                              {t("restaurant.standard")}
                            </span>
                            <span className="mov-schedule-option-sub">
                              {!slotsLoaded
                                ? t("restaurant.loading")
                                : hasAsap
                                  ? t("restaurant.asap")
                                  : t("restaurant.noSlots")}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`mov-schedule-option ${scheduleMode === "SCHEDULE" ? "active" : ""}`}
                          onClick={gotoScheduleStep}
                        >
                          <span
                            className={`mov-schedule-radio ${scheduleMode === "SCHEDULE" ? "active" : ""}`}
                            aria-hidden="true"
                          />
                          <span className="mov-schedule-option-body">
                            <span className="mov-schedule-option-title">
                              {t("restaurant.scheduleOption")}
                            </span>
                            <span className="mov-schedule-option-sub">
                              {dispatchType === "DELIVERY"
                                ? t("restaurant.chooseDeliveryTime")
                                : t("restaurant.choosePickupTime")}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="mov-schedule-primary"
                          onClick={confirmScheduleAsap}
                          disabled={!slotsLoaded || !hasAsap}
                        >
                          {t("restaurant.done")}
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="mov-schedule-header">
                          <button
                            type="button"
                            className="mov-schedule-icon-btn mov-schedule-back"
                            onClick={() => setScheduleStep("when")}
                            aria-label={t("restaurant.back")}
                          >
                            <span className="rtl-flip">←</span>
                          </button>
                          <button
                            type="button"
                            className="mov-schedule-icon-btn"
                            onClick={closeSchedule}
                            aria-label={t("restaurant.close")}
                          >
                            ×
                          </button>
                        </div>
                        <h3 className="mov-schedule-title">
                          {t("restaurant.scheduleTitle")}
                        </h3>
                        <div className="mov-schedule-grid">
                          <label className="mov-schedule-field">
                            <span className="mov-schedule-field-label">
                              {t("restaurant.day")}
                            </span>
                            <select
                              className="mov-schedule-select"
                              value={draftDay}
                              onChange={(e) => onDraftDayChange(e.target.value)}
                              disabled={
                                draftLoading || availableDays.length === 0
                              }
                            >
                              {draftLoading && availableDays.length === 0 && (
                                <option value="">
                                  {t("restaurant.loading")}
                                </option>
                              )}
                              {!draftLoading && availableDays.length === 0 && (
                                <option value="">
                                  {t("restaurant.noSlots")}
                                </option>
                              )}
                              {availableDays.map((d) => (
                                <option key={d.iso} value={d.iso}>
                                  {d.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="mov-schedule-field">
                            <span className="mov-schedule-field-label">
                              {t("restaurant.time")}
                            </span>
                            <select
                              className="mov-schedule-select"
                              value={draftSlot}
                              onChange={(e) => setDraftSlot(e.target.value)}
                              disabled={draftLoading || draftSlots.length === 0}
                            >
                              {draftLoading && (
                                <option value="">
                                  {t("restaurant.loading")}
                                </option>
                              )}
                              {!draftLoading && draftSlots.length === 0 && (
                                <option value="">
                                  {t("restaurant.noSlots")}
                                </option>
                              )}
                              {!draftLoading &&
                                draftSlots.map((s) => (
                                  <option key={s.start} value={s.start}>
                                    {formatSlotTime(s.start)}
                                  </option>
                                ))}
                            </select>
                          </label>
                        </div>
                        <button
                          type="button"
                          className="mov-schedule-primary"
                          onClick={confirmScheduleSlot}
                          disabled={draftLoading || draftSlots.length === 0}
                        >
                          {t("restaurant.confirm")}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {selectedFulfillment?.fee &&
              parseFloat(selectedFulfillment.fee) > 0 && (
                <div className="mov-dispatch-note">
                  {t("restaurant.fee")}:{" "}
                  {formatAmount(parseFloat(selectedFulfillment.fee))}
                </div>
              )}
          </div>
        </div>
      )}
      <aside className="mov-side">
        <nav className="mov-nav">
          {sections.map((s) => (
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
        {sections.map((section) => (
          <section
            key={section._id}
            id={slugifySection(section.name || section._id)}
            ref={(el) => {
              sectionRefs.current[section._id] = el;
            }}
            className="mov-section"
          >
            <h2 className="mov-section-title">{section.name}</h2>
            <div className="mov-grid">
              {section.items
                .flatMap((item) => {
                  const lines = cartLinesByItem[item._id] || [];
                  // Customizable items with lines: one card per line.
                  // Non-customizable items merge into a single line; still pass it for edit-mode.
                  if (lines.length > 0 && hasCustomization(item)) {
                    return lines.map((line) => ({
                      item,
                      line,
                      badge: line.quantity,
                    }));
                  }
                  const singleLine: CartLine | null = lines[0] ?? null;
                  return [
                    { item, line: singleLine, badge: totalQtyFor(item._id) },
                  ];
                })
                .map(({ item, line, badge }) => {
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
                        {item.description && (
                          <div className="mov-card-desc">
                            {item.description}
                          </div>
                        )}
                        {item.labels.length > 0 && (
                          <div className="mov-card-labels">
                            {item.labels.map((l, i) => (
                              <span
                                key={i}
                                className="mov-label"
                                title={l.name}
                              >
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
                        <div className="mov-card-price">
                          {line ? linePriceLabel(item, line) : priceLabel(item)}
                        </div>
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
                          <img
                            src={item.image}
                            alt={item.name}
                            loading="lazy"
                          />
                        ) : (
                          <div className="mov-card-ph">🍽️</div>
                        )}
                        <span
                          className={`mov-card-badge ${badge > 0 ? "has-qty" : ""}`}
                        >
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
          <div className="mov-modal" onClick={(e) => e.stopPropagation()}>
            {modalItem.image && (
              <div className="mov-modal-hero">
                <img src={modalItem.image} alt={modalItem.name} />
              </div>
            )}
            <button
              type="button"
              className="mov-modal-close"
              onClick={closeModal}
              aria-label={t("common.close")}
            >
              ×
            </button>
            <div className="mov-modal-body">
              <h3 className="mov-modal-title">{modalItem.name}</h3>
              {modalItem.description && (
                <p className="mov-modal-desc">{modalItem.description}</p>
              )}

              {
                <>
                  {editingLineId && (
                    <div className="mov-edit-banner">
                      <span className="mov-edit-banner-text">
                        {t("restaurant.editingExisting")}
                      </span>
                      <button
                        type="button"
                        className="mov-edit-banner-link"
                        onClick={() => startAddAnother(modalItem)}
                        disabled={busy}
                      >
                        {t("restaurant.addAnotherWithDifferent")}{" "}
                        <span className="rtl-flip">→</span>
                      </button>
                    </div>
                  )}

                  {modalItem.priceVariants.length > 0 && (
                    <div className="mov-group">
                      <div className="mov-group-label">
                        {t("restaurant.selectSize")}
                      </div>
                      <div className="mov-variant-list">
                        {modalItem.priceVariants.map((v) => {
                          const active = variantSel[modalItem._id] === v._id;
                          return (
                            <button
                              key={v._id}
                              type="button"
                              className={`mov-variant-btn ${active ? "active" : ""}`}
                              onClick={() =>
                                setVariantSel((p) => ({
                                  ...p,
                                  [modalItem._id]: v._id,
                                }))
                              }
                            >
                              <span>{v.name || modalItem.name}</span>
                              <span>
                                {formatAmount(parseFloat(v.price.amount))}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {modalItem.modifierGroups.map((group) => {
                    const sel = modSel[modalItem._id]?.[group._id] || [];
                    const invalid =
                      group.minChoices > 0 && sel.length < group.minChoices;
                    return (
                      <div key={group._id} className="mov-group">
                        <div
                          className={`mov-group-label ${invalid ? "mov-group-invalid" : ""}`}
                        >
                          {group.name}
                          {group.minChoices > 0 && (
                            <span className="mov-req"> *</span>
                          )}
                          {group.maxChoices > 1 && (
                            <span className="mov-group-hint">
                              {" "}
                              ·{" "}
                              {group.minChoices > 0
                                ? `choose ${group.minChoices}${group.maxChoices > group.minChoices ? `–${group.maxChoices}` : ""}`
                                : `up to ${group.maxChoices}`}
                            </span>
                          )}
                        </div>
                        {group.modifiers.map((mod) => {
                          const active = sel.includes(mod._id);
                          const isRadio = group.maxChoices === 1;
                          const icon = isRadio
                            ? active
                              ? "●"
                              : "○"
                            : active
                              ? "☑"
                              : "☐";
                          return (
                            <button
                              key={mod._id}
                              type="button"
                              className={`mov-mod-btn ${active ? "active" : ""}`}
                              onClick={() =>
                                toggleModifier(
                                  modalItem._id,
                                  group._id,
                                  mod._id,
                                  group.maxChoices,
                                )
                              }
                              role={isRadio ? "radio" : "checkbox"}
                              aria-checked={active}
                            >
                              <span>
                                {icon} {mod.name}
                              </span>
                              {mod.additionalPrice &&
                                parseFloat(mod.additionalPrice.amount) > 0 && (
                                  <span className="mov-mod-price">
                                    +
                                    {formatAmount(
                                      parseFloat(mod.additionalPrice.amount),
                                    )}
                                  </span>
                                )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}

                  <div className="mov-group">
                    <div className="mov-group-label">
                      {t("restaurant.quantity")}
                    </div>
                    <div className="mov-qty-row">
                      <button
                        type="button"
                        className="mov-qty-btn"
                        onClick={() =>
                          setQty((p) => ({
                            ...p,
                            [modalItem._id]: Math.max(
                              1,
                              (p[modalItem._id] || 1) - 1,
                            ),
                          }))
                        }
                      >
                        −
                      </button>
                      <span className="mov-qty-val">
                        {qty[modalItem._id] || 1}
                      </span>
                      <button
                        type="button"
                        className="mov-qty-btn"
                        onClick={() =>
                          setQty((p) => ({
                            ...p,
                            [modalItem._id]: (p[modalItem._id] || 1) + 1,
                          }))
                        }
                      >
                        +
                      </button>
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
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
