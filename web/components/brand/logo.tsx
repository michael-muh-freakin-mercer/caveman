import Link from "next/link";
import type { ComponentProps } from "react";
import { Cavman } from "./cavman";

/**
 * The old knapped-flint mark, kept as a die-cut sticker: a white outline around
 * the faceted stone. Decoration only; the logo is Cavman himself.
 */
export function FlintSticker({ className = "h-14 w-14", ...props }: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false" {...props}>
      <path d="M16 2 27 11 22 29 9 26 4 12Z" fill="#fff" stroke="#141414" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M16 5 25 12 21 26 10 24 6 13Z" fill="#ff6a1f" />
      <path d="M16 5 25 12 17 15Z" fill="#ff9a5c" />
      <path d="M16 5 6 13 17 15Z" fill="#ff7a33" />
      <path d="M17 15 21 26 10 24Z" fill="#c94a0c" />
    </svg>
  );
}

export function Logo({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={`group inline-flex items-center gap-2.5 ${className}`} aria-label="Cavman home">
      <Cavman className="h-8 w-8 transition-transform duration-200 group-hover:-rotate-6" />
      <span className="display text-[0.95rem] text-fg">CAVMAN</span>
    </Link>
  );
}
