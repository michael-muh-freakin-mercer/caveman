import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono, Rubik_Mono_One } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono", display: "swap" });
const rubikMono = Rubik_Mono_One({ subsets: ["latin"], weight: "400", variable: "--font-rubik-mono", display: "swap" });

const description =
  "Describe the software you want in plain English. Cavman plans the work, coordinates specialist agents, tests the result, fixes failures, and delivers the project.";

export const metadata: Metadata = {
  // Link previews need absolute image URLs; the public origin is the one auth already uses.
  metadataBase: new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000"),
  title: { default: "Cavman — We dug up a caveman who builds software.", template: "%s · Cavman" },
  description,
  applicationName: "Cavman",
  openGraph: { type: "website", siteName: "Cavman", description },
  twitter: { card: "summary_large_image" },
};

// Rendered per request so Next.js can stamp its scripts with the CSP nonce set in proxy.ts.
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#eceee8",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${jetbrainsMono.variable} ${rubikMono.variable}`}>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border-2 focus:border-ink focus:bg-ember focus:px-3 focus:py-2 focus:font-semibold focus:text-ink"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
