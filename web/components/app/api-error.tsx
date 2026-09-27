import { CloudOff } from "lucide-react";
import { EmptyState } from "@/components/ui/panel";

export function ApiError({ status, message }: { status: number; message: string }) {
  if (status === 404) {
    return <EmptyState title="Not found">This does not exist, or it belongs to someone else.</EmptyState>;
  }
  return (
    <div role="alert">
      <EmptyState icon={<CloudOff className="h-6 w-6" />} title={status >= 500 ? "Caveman is temporarily unavailable" : "Something went wrong"}>
        {status >= 500
          ? "The Caveman service could not be reached. Your builds are safe and keep running on the server; try again in a moment."
          : message}
      </EmptyState>
    </div>
  );
}
