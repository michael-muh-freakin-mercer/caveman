import Link from "next/link";
import { Cavman } from "@/components/brand/cavman";

export function SiteFooter() {
  return (
    <footer className="border-t-2 border-ink bg-surface">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex items-center gap-3">
          <Cavman mood="sleep" className="h-8 w-8" />
          <div>
            <p className="text-sm font-semibold text-fg">You describe. Cavman delivers.</p>
            <p className="font-mono text-xs text-muted">fire was a good start.</p>
          </div>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
          <Link href="/how-it-works" className="hover:text-fg hover:underline">How It Works</Link>
          <Link href="/pricing" className="hover:text-fg hover:underline">Pricing</Link>
          <Link href="/docs" className="hover:text-fg hover:underline">Docs</Link>
          <Link href="/terms" className="hover:text-fg hover:underline">Terms</Link>
          <Link href="/privacy" className="hover:text-fg hover:underline">Privacy</Link>
          <Link href="/acceptable-use" className="hover:text-fg hover:underline">Acceptable Use</Link>
          <a href="https://github.com/michael-muh-freakin-mercer/cavman" className="hover:text-fg hover:underline" rel="noreferrer">GitHub</a>
          <span className="text-faint">MIT licensed</span>
        </nav>
      </div>
    </footer>
  );
}
