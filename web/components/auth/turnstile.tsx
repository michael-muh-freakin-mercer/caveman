"use client";

import { useEffect, useRef, useState } from "react";

type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    // Inserted by already-trusted code, so the page's 'strict-dynamic' CSP allows it.
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    const fail = () => {
      // Forget the failed attempt so a retry inserts a fresh script.
      loading = null;
      script.remove();
      reject(new Error("Turnstile did not load"));
    };
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : fail());
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Cloudflare Turnstile's human check. Reports a token when solved and null when
 * it expires or fails; `resetKey` changes force a fresh challenge (tokens are
 * single-use, so the form bumps it after every submission).
 */
export function TurnstileWidget({
  siteKey,
  onToken,
  resetKey = 0,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
  resetKey?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const report = useRef(onToken);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    report.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current) return;
        widget.current = turnstile.render(container.current, {
          sitekey: siteKey,
          theme: "dark",
          callback: (token: string) => report.current(token),
          "expired-callback": () => report.current(null),
          "error-callback": () => report.current(null),
        });
      })
      .catch(() => {
        if (cancelled) return;
        report.current(null);
        setFailed(true);
      });
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey, attempt]);

  useEffect(() => {
    if (resetKey && widget.current && window.turnstile) {
      window.turnstile.reset(widget.current);
      report.current(null);
    }
  }, [resetKey]);

  return (
    <div>
      <div ref={container} data-testid="captcha" className={failed ? undefined : "min-h-[65px]"} />
      {failed ? (
        <p role="alert" className="text-sm text-bad">
          The human check could not load. Check your connection or content blocker, then{" "}
          <button
            type="button"
            className="font-medium text-glacier underline-offset-2 hover:underline"
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            try again
          </button>
          .
        </p>
      ) : null}
    </div>
  );
}
