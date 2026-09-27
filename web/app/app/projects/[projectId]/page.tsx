import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { ApiError } from "@/components/app/api-error";
import { PageHeader } from "@/components/app/page-header";
import { RunList } from "@/components/app/run-list";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/panel";
import { load } from "@/lib/load";
import { requireUser } from "@/lib/session";
import type { ProjectView } from "@/lib/types";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser(`/app/projects/${projectId}`);
  const result = /^[0-9a-f]{32}$/.test(projectId)
    ? await load<ProjectView>(user.id, `projects/${projectId}`)
    : ({ ok: false, status: 404, message: "Not found" } as const);
  if (!result.ok) {
    return (
      <div className="px-4 py-10 sm:px-8">
        <ApiError status={result.status} message={result.message} />
      </div>
    );
  }
  const project = result.data;
  return (
    <>
      <PageHeader
        eyebrow="Project"
        title={project.name}
        description={project.description}
        actions={<ButtonLink href={`/app/new?project=${project.id}`} variant="secondary"><Plus className="h-4 w-4" aria-hidden="true" /> New run in this project</ButtonLink>}
      />
      <div className="px-4 py-6 sm:px-8 sm:py-8">
        {project.runs?.length ? <RunList runs={project.runs} showProject={false} /> : <EmptyState title="No runs in this project" />}
      </div>
    </>
  );
}
