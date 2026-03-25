import { useState } from "react";
import { redirects } from "@wix/redirects";
import { i18n } from "@wix/essentials";

interface Props {
  planId: string;
}

export default function PlanCheckout({ planId }: Props) {
  const t = i18n.getTranslationFunction();
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
        preferences: { checkIfPublish: true },
      });
      if (redirectSession?.fullUrl) {
        window.location.href = redirectSession.fullUrl;
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : t('common.errorGeneric'));
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
      {loading ? t('plans.processing') : t('plans.subscribe')}
    </button>
  );
}
