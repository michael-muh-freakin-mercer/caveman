"use client";

import { useState } from "react";

/** A phrase under a black bar. Hover, focus or tap reveals it. Only ever used for jokes, never for information. */
export function Redacted({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      className="redact inline font-[inherit]"
      data-open={open}
      aria-pressed={open}
      onClick={() => setOpen((value) => !value)}
    >
      {children}
    </button>
  );
}
