"use client";

import { Cavman } from "@/components/brand/cavman";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="flex min-h-[60dvh] flex-col items-center justify-center px-4 text-center">
      <Cavman mood="hide" className="h-16 w-16" />
      <h1 className="display mt-5 text-xl text-fg">Something went wrong.</h1>
      <p className="mt-3 max-w-md text-muted">Your builds are unaffected. They run on the server. Try loading this page again.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-md border-2 border-ink bg-ember px-4 py-2 text-sm font-bold text-ink shadow-[3px_3px_0_0_var(--color-ink)] hover:bg-ember-hot"
      >
        Try again
      </button>
    </main>
  );
}
