import Link from "next/link";

/** A knapped-flint mark: faceted, angular, deliberate. */
export function Mark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="flint-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff8a4c" />
          <stop offset="1" stopColor="#e2530f" />
        </linearGradient>
        <linearGradient id="flint-b" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb07a" />
          <stop offset="1" stopColor="#ff6a1f" />
        </linearGradient>
      </defs>
      <path d="M16 2 27 11 22 29 9 26 4 12Z" fill="url(#flint-a)" />
      <path d="M16 2 27 11 17 15Z" fill="url(#flint-b)" opacity="0.9" />
      <path d="M4 12 17 15 9 26Z" fill="#b8430a" opacity="0.55" />
      <path d="M17 15 22 29 9 26Z" fill="#8f3207" opacity="0.5" />
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
