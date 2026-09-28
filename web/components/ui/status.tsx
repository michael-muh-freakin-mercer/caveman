import { TONE_CLASSES, type Tone } from "@/lib/run-state";

export function StatusPill({ tone, children, pulse = false }: { tone: Tone; children: React.ReactNode; pulse?: boolean }) {
  const t = TONE_CLASSES[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${t.text} ${t.bg} ${t.border}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${t.dot} ${pulse ? "animate-pulse-dot" : ""}`} />
      {children}
    </span>
  );
}

export function Dot({ tone, pulse = false }: { tone: Tone; pulse?: boolean }) {
  return <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-full ${TONE_CLASSES[tone].dot} ${pulse ? "animate-pulse-dot" : ""}`} />;
}
