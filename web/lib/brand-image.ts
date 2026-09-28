import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Brand tokens for generated images, mirroring the @theme block in app/globals.css. */
export const brand = {
  ink: "#08090b",
  ground: "#0b0c0f",
  line: "#252a31",
  fg: "#eceef1",
  fgSoft: "#c3c8d0",
  muted: "#8b95a4",
  ember: "#ff6a1f",
  emberHot: "#ff8445",
} as const;

const GEIST_FONTS = join(process.cwd(), "node_modules/geist/dist/fonts");

/** Geist faces for next/og, which needs TTF/OTF rather than the woff2 the site serves. */
export async function geistFonts() {
  const [sans, mono] = await Promise.all([
    readFile(join(GEIST_FONTS, "geist-sans/Geist-SemiBold.ttf")),
    readFile(join(GEIST_FONTS, "geist-mono/GeistMono-Medium.ttf")),
  ]);
  return [
    { name: "Geist", data: sans, weight: 600 as const, style: "normal" as const },
    { name: "Geist Mono", data: mono, weight: 500 as const, style: "normal" as const },
  ];
}
