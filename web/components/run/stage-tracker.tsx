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
              className={`h-1.5 rounded-full ${complete ? "bg-ok/80" : active ? "bg-ember" : "bg-line-strong"}`}
              aria-hidden="true"
            />
            <p className={`mt-2 flex items-center gap-1 truncate text-xs ${active ? "text-fg" : complete ? "text-fg-soft" : "text-faint"}`}>
              {complete ? <Check className="h-3 w-3 shrink-0 text-ok" aria-hidden="true" /> : null}
              {item.label}
              <span className="sr-only">{complete ? " (done)" : active ? " (current)" : " (upcoming)"}</span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
