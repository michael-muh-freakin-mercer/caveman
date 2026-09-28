import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Caveman — Type what you want. Caveman builds it.", template: "%s · Caveman" },
  description:
    "Describe the software you want in plain English. Caveman plans the work, coordinates specialist agents, tests the result, fixes failures, and delivers the project.",
  applicationName: "Caveman",
};

// Rendered per request so Next.js can stamp its scripts with the CSP nonce set in proxy.ts.
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#0b0c0f",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-ember focus:px-3 focus:py-2 focus:text-ink"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
