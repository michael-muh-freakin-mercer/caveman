"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="flex min-h-[60dvh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold text-fg">Something went wrong.</h1>
      <p className="mt-2 max-w-md text-muted">Your builds are unaffected — they run on the server. Try loading this page again.</p>
      <button type="button" onClick={reset} className="mt-6 rounded-lg bg-ember px-4 py-2 text-sm font-semibold text-ink hover:bg-ember-hot">
        Try again
      </button>
    </main>
  );
}
