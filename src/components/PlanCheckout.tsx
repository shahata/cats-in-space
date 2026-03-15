import { useState } from "react";
import { redirects } from "@wix/redirects";
import { orders } from "@wix/pricing-plans";

interface Props {
  planId: string;
  isFree: boolean;
  isLoggedIn: boolean;
}

export default function PlanCheckout({ planId, isFree, isLoggedIn }: Props) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!isLoggedIn) {
      window.location.href = "/api/auth/login";
      return;
    }

    setLoading(true);
    try {
      if (isFree) {
        await orders.createOnlineOrder(planId);
        alert("You have joined the free plan!");
        window.location.reload();
      } else {
        const { redirectSession } = await redirects.createRedirectSession({
          paidPlansCheckout: { planId },
          callbacks: {
            postFlowUrl: window.location.origin + "/plans?success=true",
          },
        });
        if (redirectSession?.fullUrl) {
          window.location.href = redirectSession.fullUrl;
        }
      }
    } catch (e: any) {
      alert(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="plan-checkout-btn"
    >
      {loading ? "Processing..." : isFree ? "Join Free" : "Subscribe"}
    </button>
  );
}
