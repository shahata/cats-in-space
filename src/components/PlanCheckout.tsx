import { useState } from "react";
import { redirects } from "@wix/redirects";

interface Props {
  planId: string;
}

export default function PlanCheckout({ planId }: Props) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const { redirectSession } = await redirects.createRedirectSession({
        paidPlansCheckout: { planId },
        callbacks: {
          postFlowUrl: window.location.origin + "/plans?success=true",
        },
      });
      if (redirectSession?.fullUrl) {
        window.location.href = redirectSession.fullUrl;
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
      {loading ? "Processing..." : "Subscribe"}
    </button>
  );
}
