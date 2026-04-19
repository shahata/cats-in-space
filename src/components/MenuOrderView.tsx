import { useState, useEffect } from "react";
import { currentCart } from "@wix/ecom";
import { i18n } from "@wix/essentials";
import { RESTAURANTS_APP_ID } from "../utils/appIds";

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

interface PriceVariant {
  _id: string;
  name: string;
  price: { amount: string; currency: string };
}

interface MenuItem {
  _id: string;
  name: string;
  description: string;
  image: string | null;
  price: { amount: string; currency: string } | null;
  priceVariants: PriceVariant[];
  labels: string[];
  modifierGroups: ModifierGroup[];
}

interface MenuSection {
  _id: string;
  name: string;
  items: MenuItem[];
}

interface Props {
  sections: MenuSection[];
}

export default function MenuOrderView({ sections }: Props) {
  const t = i18n.getTranslationFunction();
  const [cartCount, setCartCount] = useState(0);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [variantSelections, setVariantSelections] = useState<
    Record<string, string>
  >({});
  const [modifierSelections, setModifierSelections] = useState<
    Record<string, Record<string, string[]>>
  >({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [loadingItem, setLoadingItem] = useState<string | null>(null);
  const [addedItem, setAddedItem] = useState<string | null>(null);

  useEffect(() => {
    async function loadCart() {
      try {
        const cart = await currentCart.getCurrentCart();
        const count =
          cart.lineItems?.reduce((sum, li) => sum + (li.quantity || 0), 0) || 0;
        setCartCount(count);
      } catch {}
    }
    loadCart();

    const handler = () => loadCart();
    window.addEventListener("cart-updated", handler);
    return () => window.removeEventListener("cart-updated", handler);
  }, []);

  const formatPrice = (amount: string, currency: string = "USD") =>
    new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
      parseFloat(amount)
    );

  const getDisplayPrice = (item: MenuItem): string => {
    if (item.priceVariants.length > 0) {
      const prices = item.priceVariants.map((v) => parseFloat(v.price.amount));
      const min = Math.min(...prices);
      const currency = item.priceVariants[0]?.price.currency || "USD";
      return formatPrice(String(min), currency);
    }
    if (item.price) {
      return formatPrice(item.price.amount, item.price.currency);
    }
    return "";
  };

  const hasCustomization = (item: MenuItem): boolean =>
    item.priceVariants.length > 0 || item.modifierGroups.length > 0;

  const toggleModifier = (
    itemId: string,
    groupId: string,
    modifierId: string,
    maxChoices: number
  ) => {
    setModifierSelections((prev) => {
      const itemMods = prev[itemId] || {};
      const current = itemMods[groupId] || [];
      const isSelected = current.includes(modifierId);

      let updated: string[];
      if (isSelected) {
        updated = current.filter((id) => id !== modifierId);
      } else if (maxChoices === 1) {
        updated = [modifierId];
      } else if (maxChoices > 0 && current.length >= maxChoices) {
        return prev;
      } else {
        updated = [...current, modifierId];
      }

      return { ...prev, [itemId]: { ...itemMods, [groupId]: updated } };
    });
  };

  const addToCart = async (item: MenuItem) => {
    setLoadingItem(item._id);
    try {
      const variantId = variantSelections[item._id];
      const itemMods = modifierSelections[item._id] || {};
      const qty = quantities[item._id] || 1;

      await currentCart.addToCurrentCart({
        lineItems: [
          {
            quantity: qty,
            catalogReference: {
              appId: RESTAURANTS_APP_ID,
              catalogItemId: item._id,
              options: {
                ...(variantId ? { variantId } : {}),
                ...Object.fromEntries(
                  Object.entries(itemMods).filter(([, v]) => v.length > 0)
                ),
              },
            },
          },
        ],
      });

      setCartCount((c) => c + qty);
      setAddedItem(item._id);
      setTimeout(() => setAddedItem(null), 1500);
      setExpandedItem(null);
      window.dispatchEvent(new Event("cart-updated"));
    } catch (e) {
      console.error("Failed to add to cart:", e);
    } finally {
      setLoadingItem(null);
    }
  };

  const handleQuickAdd = (item: MenuItem) => {
    if (hasCustomization(item)) {
      setExpandedItem(expandedItem === item._id ? null : item._id);
      if (!variantSelections[item._id] && item.priceVariants.length > 0) {
        setVariantSelections((prev) => ({
          ...prev,
          [item._id]: item.priceVariants[0]!._id,
        }));
      }
    } else {
      addToCart(item);
    }
  };

  return (
    <div style={styles.root}>
      {sections.map((section) => (
        <div key={section._id} style={styles.section}>
          <h2 style={styles.sectionTitle}>{section.name}</h2>
          <div style={styles.itemList}>
            {section.items.map((item) => {
              const isExpanded = expandedItem === item._id;
              const isAdded = addedItem === item._id;
              const isLoading = loadingItem === item._id;

              return (
                <div key={item._id} style={styles.itemCard}>
                  <div style={styles.itemRow}>
                    {item.image && (
                      <img
                        src={item.image}
                        alt={item.name}
                        style={styles.itemImage}
                      />
                    )}
                    <div style={styles.itemInfo}>
                      <div style={styles.itemName}>{item.name}</div>
                      {item.description && (
                        <div style={styles.itemDesc}>
                          {item.description.length > 60
                            ? item.description.slice(0, 60) + "..."
                            : item.description}
                        </div>
                      )}
                      {item.labels.length > 0 && (
                        <div style={styles.labelsRow}>
                          {item.labels.map((label, i) => (
                            <span key={i} style={styles.labelTag}>
                              {label}
                            </span>
                          ))}
                        </div>
                      )}
                      <div style={styles.itemPrice}>
                        {getDisplayPrice(item)}
                      </div>
                    </div>
                    <button
                      onClick={() => handleQuickAdd(item)}
                      disabled={isLoading}
                      style={{
                        ...styles.addBtn,
                        background: isAdded ? "#4caf50" : "#ff6600",
                      }}
                    >
                      {isLoading
                        ? "..."
                        : isAdded
                          ? "\u2713"
                          : hasCustomization(item)
                            ? "+"
                            : "+"}
                    </button>
                  </div>

                  {isExpanded && (
                    <div style={styles.customizePanel}>
                      {item.priceVariants.length > 0 && (
                        <div style={styles.customizeSection}>
                          <div style={styles.customizeLabel}>
                            {t("restaurant.selectSize")}
                          </div>
                          <div style={styles.variantRow}>
                            {item.priceVariants.map((v) => (
                              <button
                                key={v._id}
                                onClick={() =>
                                  setVariantSelections((prev) => ({
                                    ...prev,
                                    [item._id]: v._id,
                                  }))
                                }
                                style={{
                                  ...styles.variantBtn,
                                  borderColor:
                                    variantSelections[item._id] === v._id
                                      ? "#ff6600"
                                      : "#333",
                                  color:
                                    variantSelections[item._id] === v._id
                                      ? "#ff6600"
                                      : "#aaa",
                                }}
                              >
                                {v.name ? `${v.name} - ` : ""}
                                {formatPrice(v.price.amount, v.price.currency)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {item.modifierGroups.map((group) => {
                        const selected =
                          (modifierSelections[item._id] || {})[group._id] || [];
                        return (
                          <div key={group._id} style={styles.customizeSection}>
                            <div style={styles.customizeLabel}>
                              {group.name}
                              {group.minChoices > 0 && (
                                <span style={{ color: "#f44336" }}> *</span>
                              )}
                            </div>
                            {group.modifiers.map((mod) => {
                              const isSelected = selected.includes(mod._id);
                              return (
                                <button
                                  key={mod._id}
                                  onClick={() =>
                                    toggleModifier(
                                      item._id,
                                      group._id,
                                      mod._id,
                                      group.maxChoices
                                    )
                                  }
                                  style={{
                                    ...styles.modifierBtn,
                                    borderColor: isSelected
                                      ? "#ff6600"
                                      : "#333",
                                    background: isSelected
                                      ? "rgba(255, 102, 0, 0.1)"
                                      : "#1a1a1a",
                                  }}
                                >
                                  <span>
                                    {isSelected ? "\u2611" : "\u2610"}{" "}
                                    {mod.name}
                                  </span>
                                  {mod.additionalPrice &&
                                    parseFloat(mod.additionalPrice.amount) >
                                      0 && (
                                      <span style={{ color: "#ff6600" }}>
                                        +
                                        {formatPrice(
                                          mod.additionalPrice.amount
                                        )}
                                      </span>
                                    )}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}

                      <div style={styles.customizeSection}>
                        <div style={styles.customizeLabel}>
                          {t("restaurant.quantity")}
                        </div>
                        <div style={styles.qtyRow}>
                          <button
                            style={styles.qtyBtn}
                            onClick={() =>
                              setQuantities((prev) => ({
                                ...prev,
                                [item._id]: Math.max(
                                  1,
                                  (prev[item._id] || 1) - 1
                                ),
                              }))
                            }
                          >
                            &minus;
                          </button>
                          <span style={styles.qtyValue}>
                            {quantities[item._id] || 1}
                          </span>
                          <button
                            style={styles.qtyBtn}
                            onClick={() =>
                              setQuantities((prev) => ({
                                ...prev,
                                [item._id]: (prev[item._id] || 1) + 1,
                              }))
                            }
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={() => addToCart(item)}
                        disabled={isLoading}
                        style={styles.confirmAddBtn}
                      >
                        {isLoading
                          ? t("restaurant.adding")
                          : t("restaurant.addToCart")}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {cartCount > 0 && (
        <div style={styles.floatingBar}>
          <a href="/store" style={styles.viewCartLink}>
            {t("restaurant.viewCart")} ({cartCount}{" "}
            {cartCount === 1
              ? t("restaurant.item")
              : t("restaurant.items")})
          </a>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: "relative",
  },
  section: {
    marginBottom: 40,
  },
  sectionTitle: {
    fontFamily: "'Bangers', cursive",
    fontSize: "1.5rem",
    color: "#ffcc00",
    letterSpacing: 2,
    marginBottom: 16,
    paddingBottom: 8,
    borderBottom: "1px solid #222",
  },
  itemList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  itemCard: {
    background: "#111",
    border: "1px solid #222",
    borderRadius: 12,
    overflow: "hidden",
  },
  itemRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  itemImage: {
    width: 64,
    height: 64,
    borderRadius: 8,
    objectFit: "cover" as const,
    flexShrink: 0,
  },
  itemInfo: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    fontFamily: "'Bangers', cursive",
    fontSize: "1rem",
    color: "#e0e0e0",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  itemDesc: {
    fontSize: "0.75rem",
    color: "#777",
    lineHeight: 1.3,
    marginBottom: 4,
  },
  labelsRow: {
    display: "flex",
    gap: 4,
    marginBottom: 4,
  },
  labelTag: {
    fontSize: "0.6rem",
    padding: "2px 6px",
    background: "rgba(255, 102, 0, 0.15)",
    color: "#ff6600",
    borderRadius: 4,
    fontWeight: 600,
  },
  itemPrice: {
    fontSize: "0.9rem",
    fontWeight: 700,
    color: "#ffcc00",
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    border: "none",
    color: "#000",
    fontSize: "1.2rem",
    fontWeight: 700,
    cursor: "pointer",
    flexShrink: 0,
    transition: "all 0.2s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  customizePanel: {
    padding: "0 16px 16px",
    borderTop: "1px solid #222",
  },
  customizeSection: {
    marginTop: 12,
  },
  customizeLabel: {
    fontFamily: "'Bangers', cursive",
    fontSize: "0.75rem",
    letterSpacing: 1,
    color: "#888",
    marginBottom: 6,
    textTransform: "uppercase" as const,
  },
  variantRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
  },
  variantBtn: {
    padding: "8px 14px",
    borderRadius: 8,
    border: "1px solid #333",
    background: "#1a1a1a",
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: 600,
    transition: "all 0.2s",
  },
  modifierBtn: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #333",
    cursor: "pointer",
    fontSize: "0.8rem",
    color: "#e0e0e0",
    marginBottom: 4,
    transition: "all 0.2s",
    textAlign: "left" as const,
  },
  qtyRow: {
    display: "flex",
    alignItems: "center",
    gap: 0,
    width: "fit-content",
    border: "1px solid #333",
    borderRadius: 8,
    overflow: "hidden",
  },
  qtyBtn: {
    width: 32,
    height: 32,
    background: "#1a1a1a",
    border: "none",
    color: "#aaa",
    fontSize: "1rem",
    cursor: "pointer",
  },
  qtyValue: {
    width: 36,
    textAlign: "center" as const,
    fontWeight: 700,
    fontSize: "0.85rem",
    color: "#e0e0e0",
    background: "#141414",
    height: 32,
    lineHeight: "32px",
  },
  confirmAddBtn: {
    width: "100%",
    marginTop: 12,
    padding: "10px 20px",
    background: "#ff6600",
    color: "#000",
    border: "none",
    borderRadius: 8,
    fontFamily: "'Bangers', cursive",
    fontSize: "0.9rem",
    letterSpacing: 1,
    cursor: "pointer",
    fontWeight: 700,
  },
  floatingBar: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    background: "rgba(17, 17, 17, 0.95)",
    borderTop: "1px solid #333",
    padding: "14px 24px",
    textAlign: "center" as const,
    zIndex: 100,
    backdropFilter: "blur(10px)",
  },
  viewCartLink: {
    fontFamily: "'Bangers', cursive",
    fontSize: "1rem",
    letterSpacing: 1.5,
    color: "#ff6600",
    textDecoration: "none",
    display: "inline-block",
    padding: "8px 32px",
    background: "rgba(255, 102, 0, 0.1)",
    border: "1px solid #ff6600",
    borderRadius: 8,
    transition: "all 0.2s",
  },
};
