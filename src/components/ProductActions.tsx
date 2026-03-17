import { useState, useMemo } from "react";
import { currentCart } from "@wix/ecom";
import { redirects } from "@wix/redirects";

const STORES_APP_ID = "215238eb-22a5-4c36-9e7b-e7c08025e04e";

interface ProductData {
  _id: string;
  name: string;
  productOptions: any[];
  variants: any[];
  stock: any;
  manageVariants: boolean;
  priceData: any;
}

interface Props {
  product: ProductData;
}

export default function ProductActions({ product }: Props) {
  const options = product.productOptions || [];
  const variants = product.variants || [];
  const hasOptions = options.length > 0;

  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const opt of options) {
      if (opt.choices?.length > 0) {
        init[opt.name] = opt.choices[0].value;
      }
    }
    return init;
  });
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [bisEmail, setBisEmail] = useState("");
  const [bisSubmitted, setBisSubmitted] = useState(false);

  const selectedVariant = useMemo(() => {
    if (!hasOptions) {
      return variants[0];
    }
    return variants.find((v: any) => {
      const choices = v.choices || {};
      return Object.entries(selections).every(
        ([optName, choiceVal]) => choices[optName] === choiceVal,
      );
    });
  }, [selections, variants, hasOptions]);

  const variantId = selectedVariant?.id || selectedVariant?._id;
  const isInStock = selectedVariant
    ? selectedVariant.stock?.inStock !== false
    : product.stock?.inStock !== false;

  const displayPrice =
    selectedVariant?.variant?.priceData?.formatted?.price ||
    selectedVariant?.variant?.priceData?.price ||
    product.priceData?.formatted?.price;

  const handleOptionChange = (optionName: string, value: string) => {
    setSelections((prev) => ({ ...prev, [optionName]: value }));
    setMessage(null);
    setBisSubmitted(false);
  };

  const buildCatalogRef = () => {
    const ref: any = {
      catalogItemId: product._id,
      appId: STORES_APP_ID,
    };
    if (hasOptions && variantId) {
      ref.options = { variantId };
    }
    return ref;
  };

  const addToCart = async () => {
    setLoading("cart");
    setMessage(null);
    try {
      await currentCart.addToCurrentCart({
        lineItems: [{ quantity, catalogReference: buildCatalogRef() }],
      });
      setMessage({ type: "success", text: "Added to cart!" });
      window.dispatchEvent(new CustomEvent("cart-updated"));
    } catch (e: any) {
      setMessage({
        type: "error",
        text: e?.message || "Failed to add to cart",
      });
    } finally {
      setLoading(null);
    }
  };

  const buyNow = async () => {
    setLoading("buy");
    setMessage(null);
    try {
      await currentCart.addToCurrentCart({
        lineItems: [{ quantity, catalogReference: buildCatalogRef() }],
      });
      const { checkoutId } = await currentCart.createCheckoutFromCurrentCart({
        channelType: "WEB",
      });
      const { redirectSession } = await redirects.createRedirectSession({
        ecomCheckout: { checkoutId },
        callbacks: {
          postFlowUrl: window.location.origin + "/store?success=true",
        },
      });
      if (redirectSession?.fullUrl) {
        window.location.href = redirectSession.fullUrl;
      }
    } catch (e: any) {
      setMessage({
        type: "error",
        text: e?.message || "Failed to start checkout",
      });
      setLoading(null);
    }
  };

  const submitBackInStock = async () => {
    if (!bisEmail) return;
    setLoading("bis");
    try {
      const res = await fetch("/api/back-in-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: bisEmail,
          catalogItemId: product._id,
          variantId: hasOptions ? variantId : undefined,
          productName: product.name,
          productPrice: product.priceData?.price,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setBisSubmitted(true);
      setMessage({
        type: "success",
        text: "You'll be notified when this item is back in stock!",
      });
    } catch (e: any) {
      setMessage({
        type: "error",
        text: e?.message || "Failed to register notification",
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="pa-root">
      {hasOptions && (
        <div className="pa-options">
          {options.map((opt: any) => (
            <div key={opt.name} className="pa-option">
              <label className="pa-option-label">{opt.name}</label>
              <div className="pa-choices">
                {opt.choices?.map((choice: any) => (
                  <button
                    key={choice.value}
                    className={`pa-choice ${selections[opt.name] === choice.value ? "pa-choice-active" : ""}`}
                    onClick={() => handleOptionChange(opt.name, choice.value)}
                  >
                    {choice.description || choice.value}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {displayPrice && <div className="pa-selected-price">{displayPrice}</div>}

      <div className="pa-stock-status">
        {isInStock ? (
          <span className="pa-in-stock">In Stock</span>
        ) : (
          <span className="pa-oos">Out of Stock</span>
        )}
      </div>

      {isInStock ? (
        <>
          <div className="pa-quantity">
            <label className="pa-option-label">Quantity</label>
            <div className="pa-qty-controls">
              <button
                className="pa-qty-btn"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
              >
                &minus;
              </button>
              <span className="pa-qty-value">{quantity}</span>
              <button
                className="pa-qty-btn"
                onClick={() => setQuantity(quantity + 1)}
              >
                +
              </button>
            </div>
          </div>

          <div className="pa-actions">
            <button
              className="pa-btn pa-btn-cart"
              onClick={addToCart}
              disabled={loading !== null}
            >
              {loading === "cart" ? "Adding..." : "Add to Cart"}
            </button>
            <button
              className="pa-btn pa-btn-buy"
              onClick={buyNow}
              disabled={loading !== null}
            >
              {loading === "buy" ? "Processing..." : "Buy Now"}
            </button>
          </div>
        </>
      ) : (
        <div className="pa-bis">
          {!bisSubmitted ? (
            <>
              <p className="pa-bis-text">
                Want to know when this is back? Enter your email:
              </p>
              <div className="pa-bis-form">
                <input
                  type="email"
                  className="pa-bis-input"
                  placeholder="your@email.com"
                  value={bisEmail}
                  onChange={(e) => setBisEmail(e.target.value)}
                />
                <button
                  className="pa-btn pa-btn-bis"
                  onClick={submitBackInStock}
                  disabled={loading !== null || !bisEmail}
                >
                  {loading === "bis" ? "..." : "Notify Me"}
                </button>
              </div>
            </>
          ) : (
            <p className="pa-bis-done">We'll email you when it's back!</p>
          )}
        </div>
      )}

      {message && (
        <div className={`pa-message pa-message-${message.type}`}>
          {message.text}
        </div>
      )}

      <style>{`
        .pa-root { margin-top: 4px; }
        .pa-options { display: flex; flex-direction: column; gap: 16px; margin-bottom: 20px; }
        .pa-option-label { display: block; font-family: 'Bangers', cursive; font-size: 0.8rem; letter-spacing: 1px; color: #888; margin-bottom: 6px; text-transform: uppercase; }
        .pa-choices { display: flex; flex-wrap: wrap; gap: 6px; }
        .pa-choice { padding: 8px 16px; border-radius: 8px; border: 1px solid #333; background: #1a1a1a; color: #aaa; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .pa-choice:hover { border-color: #ff6600; color: #e0e0e0; }
        .pa-choice-active { border-color: #ff6600; background: rgba(255, 102, 0, 0.15); color: #ff6600; }
        .pa-selected-price { font-size: 1.3rem; font-weight: 700; color: #ffcc00; margin-bottom: 8px; }
        .pa-stock-status { margin-bottom: 16px; }
        .pa-in-stock { color: #4caf50; font-size: 0.85rem; font-weight: 600; }
        .pa-oos { color: #f44336; font-size: 0.85rem; font-weight: 600; }
        .pa-quantity { margin-bottom: 20px; }
        .pa-qty-controls { display: flex; align-items: center; gap: 0; width: fit-content; border: 1px solid #333; border-radius: 8px; overflow: hidden; }
        .pa-qty-btn { width: 36px; height: 36px; background: #1a1a1a; border: none; color: #aaa; font-size: 1.1rem; cursor: pointer; transition: background 0.2s; }
        .pa-qty-btn:hover:not(:disabled) { background: #222; color: #ff6600; }
        .pa-qty-btn:disabled { opacity: 0.3; cursor: default; }
        .pa-qty-value { width: 44px; text-align: center; font-weight: 700; font-size: 0.95rem; color: #e0e0e0; background: #141414; height: 36px; line-height: 36px; }
        .pa-actions { display: flex; gap: 10px; margin-bottom: 12px; }
        .pa-btn { padding: 12px 24px; border-radius: 8px; font-family: 'Bangers', cursive; font-size: 1rem; letter-spacing: 1.5px; border: none; cursor: pointer; transition: all 0.2s; }
        .pa-btn:disabled { opacity: 0.5; cursor: default; }
        .pa-btn-cart { background: var(--accent, #ff6600); color: #000; flex: 1; }
        .pa-btn-cart:hover:not(:disabled) { background: #ff8533; }
        .pa-btn-buy { background: #ffcc00; color: #000; flex: 1; }
        .pa-btn-buy:hover:not(:disabled) { background: #ffd633; }
        .pa-bis { margin-top: 4px; }
        .pa-bis-text { color: #aaa; font-size: 0.85rem; margin-bottom: 8px; }
        .pa-bis-form { display: flex; gap: 8px; }
        .pa-bis-input { flex: 1; padding: 10px 14px; border-radius: 8px; border: 1px solid #333; background: #1a1a1a; color: #e0e0e0; font-size: 0.9rem; outline: none; }
        .pa-bis-input:focus { border-color: #ff6600; }
        .pa-btn-bis { padding: 10px 18px; background: #ff6600; color: #000; font-family: 'Bangers', cursive; font-size: 0.85rem; letter-spacing: 1px; border: none; border-radius: 8px; cursor: pointer; }
        .pa-bis-done { color: #4caf50; font-size: 0.9rem; }
        .pa-message { margin-top: 12px; padding: 10px 14px; border-radius: 8px; font-size: 0.85rem; }
        .pa-message-success { background: rgba(76, 175, 80, 0.15); border: 1px solid #4caf50; color: #4caf50; }
        .pa-message-error { background: rgba(244, 67, 54, 0.15); border: 1px solid #f44336; color: #f44336; }
      `}</style>
    </div>
  );
}
