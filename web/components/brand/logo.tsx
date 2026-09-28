import Link from "next/link";

/** A knapped-flint mark: faceted, angular, deliberate. */
export function Mark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      {/* Flat facets (no gradient ids), so any number of marks can share a page. */}
      <path d="M16 2 27 11 22 29 9 26 4 12Z" fill="#f2621a" />
      <path d="M16 2 27 11 17 15Z" fill="#ff9a5c" />
      <path d="M16 2 4 12 17 15Z" fill="#ff7a33" />
      <path d="M4 12 17 15 9 26Z" fill="#c94a0c" />
      <path d="M17 15 22 29 9 26Z" fill="#9c3a08" />
      <path d="M16 2 4 12" stroke="#2fd4ee" strokeWidth="1.2" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}

export function Logo({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={`group inline-flex items-center gap-2.5 ${className}`} aria-label="Caveman home">
      <Mark />
      <span className="text-[1.05rem] font-semibold tracking-[0.14em] text-fg">CAVEMAN</span>
    </Link>
  );
}
