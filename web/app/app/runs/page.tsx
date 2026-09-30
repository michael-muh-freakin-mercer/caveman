import { ArrowRight, ListChecks } from "lucide-react";
import type { Metadata } from "next";
import { ApiError } from "@/components/app/api-error";
import { PageHeader } from "@/components/app/page-header";
import { RunList } from "@/components/app/run-list";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/panel";
import { load } from "@/lib/load";
import { requireUser } from "@/lib/session";
import type { RunSummary } from "@/lib/types";

export const metadata: Metadata = { title: "Runs" };

export default async function RunsPage() {
  const user = await requireUser("/app/runs");
  const result = await load<{ runs: RunSummary[] }>(user.id, "runs");
  return (
    <>
      <PageHeader eyebrow="Runs" title="All runs" description="Every build you have started, newest first." />
      <div className="px-4 py-6 sm:px-8 sm:py-8">
        {!result.ok ? (
          <ApiError status={result.status} message={result.message} />
        ) : result.data.runs.length ? (
          <RunList runs={result.data.runs} />
        ) : (
          <EmptyState icon={<ListChecks className="h-6 w-6" />} title="No runs yet" action={<ButtonLink href="/app/new">Start a build <ArrowRight className="h-4 w-4" aria-hidden="true" /></ButtonLink>}>
            Runs appear here as soon as you ask Cavman to build something.
          </EmptyState>
        )}
      </div>
    </>
  );
}
