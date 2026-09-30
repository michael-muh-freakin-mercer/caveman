"use client";

import { FolderKanban, LayoutDashboard, ListChecks, LogOut, Menu, Plus, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { signOut } from "@/lib/auth-client";

const NAV = [
  { href: "/app", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/app/runs", label: "Runs", icon: ListChecks },
  { href: "/app/projects", label: "Projects", icon: FolderKanban },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export function AppShell({ user, children }: { user: { name: string; email: string }; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  const active = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(href + "/"));

  const nav = (
    <nav aria-label="App" className="flex flex-col gap-1">
      <Link
        href="/app/new"
        className="mb-4 inline-flex h-10 items-center justify-center gap-2 rounded-md border-2 border-ink bg-ember text-sm font-bold text-ink shadow-[3px_3px_0_0_var(--color-ink)] hover:bg-ember-hot active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_0_var(--color-ink)]"
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> New build
      </Link>
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={active(item.href, item.exact) ? "page" : undefined}
          className="flex items-center gap-3 rounded-md border-2 border-transparent px-3 py-2 text-sm text-fg-soft transition-colors hover:bg-surface-2 hover:text-fg aria-[current=page]:border-ink aria-[current=page]:bg-ember/35 aria-[current=page]:font-semibold aria-[current=page]:text-fg"
        >
          <item.icon className="h-4 w-4" aria-hidden="true" />
          {item.label}
        </Link>
      ))}
    </nav>
  );

  const account = (
    <div className="border-t-2 border-dashed border-line-strong pt-4">
      <p className="truncate text-sm text-fg">{user.name}</p>
      <p className="truncate text-xs text-muted">{user.email}</p>
      <button
        type="button"
        onClick={async () => {
          await signOut();
          router.push("/");
          router.refresh();
        }}
        className="mt-3 inline-flex items-center gap-2 text-xs text-muted hover:text-fg"
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden border-r border-line bg-surface-2 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:justify-between lg:px-4 lg:py-5">
        <div>
          <div className="mb-8 px-2">
            <Logo href="/app" />
          </div>
          {nav}
        </div>
        {account}
      </aside>
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b-2 border-ink bg-ground/95 px-4 backdrop-blur lg:hidden">
        <Logo href="/app" />
        <button
          type="button"
          aria-expanded={open}
          aria-controls="app-mobile-nav"
          aria-label={open ? "Close navigation" : "Open navigation"}
          onClick={() => setOpenOn(open ? null : pathname)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-fg-soft hover:bg-surface-2"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open ? (
        <div id="app-mobile-nav" className="border-b-2 border-ink bg-ground px-4 py-4 lg:hidden">
          {nav}
          <div className="mt-4">{account}</div>
        </div>
      ) : null}
      <main id="main" className="min-w-0">
        {children}
      </main>
    </div>
  );
}
