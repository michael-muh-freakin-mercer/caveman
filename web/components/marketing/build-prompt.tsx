"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { MAX_PROMPT_LENGTH, newBuildPath, savePendingPrompt } from "@/lib/prompt-storage";
import { announceTyping } from "@/components/brand/live-cavman";
import { useHydrated } from "@/lib/use-hydrated";

// Examples stay within what live builds have proven: Python and TypeScript code with real tests.
const EXAMPLES: { label: string; prompt: string }[] = [
  { label: "CLI", prompt: "Build a Python CLI that renames photos by the date they were taken, with tests" },
  { label: "Library", prompt: "Build a Python library that parses and validates ISO 8601 durations, with tests" },
  { label: "API", prompt: "Build a REST API core for a recipe catalogue (routing and search, no framework) in Python, with tests" },
  { label: "TypeScript", prompt: "Build a TypeScript rate limiter (token bucket) with node:test tests" },
  { label: "Parser", prompt: "Build a TypeScript CSV parser that handles quoted fields, with tests" },
  { label: "Booking logic", prompt: "Build the availability engine for a tattoo studio's bookings in Python, with tests" },
];

export function BuildPrompt({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = prompt.trim();
    if (text.length < 3) {
      setError("Describe what you want to build.");
      return;
    }
    setError(null);
    if (!signedIn) {
      savePendingPrompt(text);
      router.push(`/sign-up?next=${encodeURIComponent(newBuildPath(text))}`);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/cavman/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Cavman could not start this build.");
      router.push(`/app/runs/${body.run_id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cavman could not start this build.");
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      <form method="post" onSubmit={submit} className="group relative" aria-describedby={error ? errorId : undefined}>
        <div className="rounded-lg border-[2.5px] border-ink bg-surface shadow-[5px_5px_0_0_var(--color-ink)] transition-shadow focus-within:shadow-[5px_5px_0_0_var(--color-ink),0_0_0_5px_rgb(255_212_0/0.55)]">
          <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-end sm:p-2 sm:pl-4">
            <label htmlFor={inputId} className="sr-only">
              Describe the software you want
            </label>
            <textarea
              id={inputId}
              name="prompt"
              rows={1}
              value={prompt}
              maxLength={MAX_PROMPT_LENGTH}
              onChange={(event) => {
                setPrompt(event.target.value);
                announceTyping();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Build a Python CLI that renames photos by the date they were taken"
              className="min-h-12 flex-1 resize-none bg-transparent px-1 py-3 text-base text-fg placeholder:text-faint focus:outline-none focus-visible:shadow-none focus-visible:outline-none sm:py-2.5 sm:text-lg"
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
            <button
              type="submit"
              disabled={busy || !hydrated}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md border-2 border-ink bg-ember px-6 text-base font-bold text-ink transition-colors hover:bg-ember-hot disabled:opacity-60"
            >
              {busy ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
              {busy ? "Starting…" : "Build it"}
              {busy ? null : <ArrowRight className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
        </div>
        {error ? (
          <p id={errorId} role="alert" className="mt-3 text-sm text-bad">
            {error}
          </p>
        ) : null}
      </form>
      <ul className="mt-5 flex flex-wrap gap-2" aria-label="Examples">
        {EXAMPLES.map((example) => (
          <li key={example.label}>
            <button
              type="button"
              onClick={() => {
                setPrompt(example.prompt);
                announceTyping();
              }}
              className="rounded-full border-2 border-ink bg-surface px-3.5 py-1 text-sm font-semibold text-fg transition-colors hover:bg-ember"
            >
              {example.label}
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => {
              setPrompt("");
              document.getElementById(inputId)?.focus();
            }}
            className="rounded-full border-2 border-dashed border-ink/50 px-3.5 py-1 text-sm font-semibold text-muted transition-colors hover:border-ink hover:text-fg"
          >
            Anything...
          </button>
        </li>
      </ul>
    </div>
  );
}
