"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { buttonClass } from "@/components/ui/button";

const NAV = [
  { href: "/#product", label: "Product" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
];

const GITHUB_URL = "https://github.com/michael-muh-freakin-mercer/cavman";

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-ground/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className="rounded-md px-3 py-2 text-sm text-fg-soft transition-colors hover:text-fg aria-[current=page]:text-fg"
            >
              {item.label}
            </Link>
          ))}
          <a href={GITHUB_URL} className="rounded-md px-3 py-2 text-sm text-fg-soft transition-colors hover:text-fg" rel="noreferrer">
            GitHub
          </a>
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {signedIn ? (
            <Link href="/app" className={buttonClass("primary", "sm")}>
              Open Cavman
            </Link>
          ) : (
            <>
              <Link href="/sign-in" className={buttonClass("ghost", "sm")}>
                Sign In
              </Link>
              <Link href="/sign-up" className={buttonClass("primary", "sm")}>
                Get Started
              </Link>
            </>
          )}
        </div>
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-fg-soft hover:bg-surface-2 md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpenOn(open ? null : pathname)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open ? (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-line bg-ground px-4 pb-5 pt-2 md:hidden">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="block rounded-md px-2 py-3 text-base text-fg-soft hover:text-fg">
              {item.label}
            </Link>
          ))}
          <a href={GITHUB_URL} className="block rounded-md px-2 py-3 text-base text-fg-soft hover:text-fg" rel="noreferrer">
            GitHub
          </a>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {signedIn ? (
              <Link href="/app" className={buttonClass("primary", "md", "col-span-2")}>
                Open Cavman
              </Link>
            ) : (
              <>
                <Link href="/sign-in" className={buttonClass("secondary", "md")}>
                  Sign In
                </Link>
                <Link href="/sign-up" className={buttonClass("primary", "md")}>
                  Get Started
                </Link>
              </>
            )}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
