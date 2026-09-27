import { Landing } from "@/components/marketing/landing";
import { currentUser } from "@/lib/session";

export default async function Home() {
  const user = await currentUser().catch(() => null);
  return <Landing signedIn={Boolean(user)} />;
}
