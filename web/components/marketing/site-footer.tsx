import Link from "next/link";
import { Mark } from "@/components/brand/logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex items-center gap-3">
          <Mark className="h-6 w-6" />
          <p className="text-sm text-muted">You describe. Caveman delivers.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
          <Link href="/how-it-works" className="hover:text-fg">How It Works</Link>
          <Link href="/pricing" className="hover:text-fg">Pricing</Link>
          <Link href="/docs" className="hover:text-fg">Docs</Link>
          <a href="https://github.com/who-is-michael-mercer/caveman" className="hover:text-fg" rel="noreferrer">GitHub</a>
          <span className="text-faint">MIT licensed</span>
        </nav>
      </div>
    </footer>
  );
}
