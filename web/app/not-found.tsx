import Link from "next/link";
import { Cavman } from "@/components/brand/cavman";

export default function NotFound() {
  return (
    <main id="main" className="stone dig-grid flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <Cavman mood="hide" className="h-20 w-20" />
      <p className="eyebrow mt-6 text-muted">Grid ??? · nothing excavated</p>
      <h1 className="display mt-3 text-2xl text-fg sm:text-3xl">Nothing here.</h1>
      <p className="mt-3 text-muted">We dug. That page does not exist.</p>
      <Link href="/" className="mt-6 font-semibold text-fg underline decoration-ember decoration-4 hover:bg-ember">
        Back to the dig site
      </Link>
    </main>
  );
}
