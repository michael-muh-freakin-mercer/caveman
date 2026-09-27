import type { Metadata } from "next";
import { ApiError } from "@/components/app/api-error";
import { RunDashboard } from "@/components/run/run-dashboard";
import { githubEnabled } from "@/lib/auth";
import { load } from "@/lib/load";
import { requireUser } from "@/lib/session";
import type { RunDetail } from "@/lib/types";

export const metadata: Metadata = { title: "Run" };

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const user = await requireUser(`/app/runs/${runId}`);
  const result = /^[0-9a-f]{32}$/.test(runId)
    ? await load<RunDetail>(user.id, `runs/${runId}`)
    : ({ ok: false, status: 404, message: "Not found" } as const);
  if (!result.ok) {
    return (
      <div className="px-4 py-10 sm:px-8">
        <ApiError status={result.status} message={result.message} />
      </div>
    );
  }
  return <RunDashboard key={result.data.id} initial={result.data} githubEnabled={githubEnabled} />;
}
