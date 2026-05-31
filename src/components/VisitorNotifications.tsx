import { useEffect, useRef, useState } from "react";
import { subscriber } from "@wix/realtime";
import { httpClient, i18n } from "@wix/essentials";

const CHANNEL = { name: "visitor-arrivals" };
const TOAST_TTL = 6000;

interface ArrivalPayload {
  senderId: string | null;
  name: string | null;
  photo: string | null;
  isMember: boolean;
}

interface Toast {
  id: number;
  name: string | null;
  photo: string | null;
}

export default function VisitorNotifications() {
  const t = i18n.getTranslationFunction();
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Stable per-tab id so we never show a notification about our own arrival.
  const senderId = useRef<string>(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : String(Math.random()),
  );
  // Guards against React StrictMode's double-mount in dev.
  const started = useRef(false);
  const nextId = useRef(0);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const dismiss = (id: number) =>
      setToasts((prev) => prev.filter((toast) => toast.id !== id));

    const pushToast = (payload: ArrivalPayload) => {
      const id = nextId.current++;
      setToasts((prev) => [
        ...prev,
        { id, name: payload.name, photo: payload.photo },
      ]);
      setTimeout(() => dismiss(id), TOAST_TTL);
    };

    let subscriptionId: string | undefined;
    try {
      subscriptionId = subscriber.subscribe(CHANNEL, (message) => {
        const payload = message.payload as ArrivalPayload;
        // Ignore the echo of our own arrival announcement.
        if (payload?.senderId && payload.senderId === senderId.current) return;
        pushToast(payload);
      });
    } catch {
      // Realtime unavailable — degrade silently, the page still works.
    }

    // Announce that this visitor just came aboard. Use fetchWithAuth so the
    // request carries the Wix visitor/member context — the backend needs it to
    // resolve the current member and to elevate the realtime publish call.
    httpClient
      .fetchWithAuth("/api/visitor-arrived", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderId: senderId.current }),
      })
      .catch(() => {});

    return () => {
      if (subscriptionId) {
        try {
          subscriber.unsubscribe({ subscriptionId });
        } catch {}
      }
    };
  }, []);

  return (
    <div className="visitor-toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="visitor-toast" role="status">
          {toast.photo ? (
            <img
              src={toast.photo}
              alt={toast.name || ""}
              className="visitor-toast-avatar"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="visitor-toast-avatar visitor-toast-avatar-fallback">
              🐾
            </span>
          )}
          <div className="visitor-toast-body">
            <span className="visitor-toast-text">
              {toast.name
                ? t("realtime.memberArrived", { name: toast.name })
                : t("realtime.guestArrived")}
            </span>
          </div>
        </div>
      ))}

      <style>{`
        .visitor-toasts {
          position: fixed;
          inset-block-end: 24px;
          inset-inline-end: 24px;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          gap: 10px;
          pointer-events: none;
        }
        .visitor-toast {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 240px;
          max-width: 340px;
          padding: 12px 16px;
          background: rgba(20, 20, 20, 0.96);
          border: 1px solid var(--accent, #ff6600);
          border-radius: 12px;
          box-shadow: 0 0 24px var(--accent-glow, rgba(255, 102, 0, 0.35));
          backdrop-filter: blur(10px);
          color: var(--text-primary, #fff);
          animation: visitor-toast-in 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .visitor-toast-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid var(--accent, #ff6600);
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
          background: rgba(255, 102, 0, 0.12);
        }
        .visitor-toast-text {
          font-family: var(--font-heading, sans-serif);
          font-size: 0.9rem;
          letter-spacing: 0.5px;
          line-height: 1.4;
        }
        @keyframes visitor-toast-in {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        :global(html[dir="rtl"]) .visitor-toasts {
          inset-inline-end: 24px;
        }
        @media (max-width: 600px) {
          .visitor-toasts {
            inset-inline: 12px;
            inset-block-end: 12px;
          }
          .visitor-toast { max-width: none; }
        }
      `}</style>
    </div>
  );
}
