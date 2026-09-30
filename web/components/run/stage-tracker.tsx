import { Check } from "lucide-react";
import { STAGES, stageIndex } from "@/lib/run-state";
import type { RunState, Stage } from "@/lib/types";

export function StageTracker({ stage, state }: { stage: Stage; state: RunState }) {
  const current = stageIndex(stage);
  const done = state === "complete";
  return (
    <ol className="grid grid-cols-5 gap-1.5" aria-label="Build stages">
      {STAGES.map((item, index) => {
        const complete = done || index < current;
        const active = !done && index === current;
        return (
          <li key={item.id} aria-current={active ? "step" : undefined} className="min-w-0">
            <div
              className={`h-2 rounded-full border border-ink/80 ${complete ? "bg-ok" : active ? "bg-ember" : "bg-surface-3"}`}
              aria-hidden="true"
            />
            <p className={`mt-2 flex items-center gap-1 truncate text-[0.68rem] sm:text-xs ${active ? "text-fg" : complete ? "text-fg-soft" : "text-faint"}`}>
              {complete ? <Check className="hidden h-3 w-3 shrink-0 text-ok sm:block" aria-hidden="true" /> : null}
              {item.label}
              <span className="sr-only">{complete ? " (done)" : active ? " (current)" : " (upcoming)"}</span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
