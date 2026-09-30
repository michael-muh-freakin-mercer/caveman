import Link from "next/link";
import { Mark } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main id="main" className="stone flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <Mark className="h-10 w-10" />
      <h1 className="mt-6 text-3xl font-semibold text-fg">Nothing here.</h1>
      <p className="mt-2 text-muted">That page does not exist.</p>
      <Link href="/" className="mt-6 text-ember hover:underline">Back to Cavman</Link>
    </main>
  );
}
