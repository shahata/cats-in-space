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
          thankYouPageUrl: window.location.origin + "/plans/thank-you",
          postFlowUrl: window.location.origin + "/plans",
        },
      });
      if (redirectSession?.fullUrl) {
        window.location.href = redirectSession.fullUrl;
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Something went wrong");
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
