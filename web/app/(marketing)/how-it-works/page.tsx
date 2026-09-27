import type { Metadata } from "next";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { currentUser } from "@/lib/session";

export const metadata: Metadata = { title: "How It Works" };

export default async function HowItWorksPage() {
  const user = await currentUser().catch(() => null);
  return <HowItWorks signedIn={Boolean(user)} />;
}
