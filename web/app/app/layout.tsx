import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: { default: "Dashboard", template: "%s · Caveman" } };
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/app");
  return <AppShell user={{ name: user.name, email: user.email }}>{children}</AppShell>;
}
