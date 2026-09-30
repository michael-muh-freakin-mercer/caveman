import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Brand tokens for generated images, mirroring the @theme block in app/globals.css. */
export const brand = {
  ink: "#141414",
  ground: "#eceee8",
  paper: "#ffffff",
  line: "#d3d6cd",
  fg: "#141414",
  muted: "#50534c",
  duck: "#ffd400",
  gum: "#ff5fa2",
  sky: "#8fd3ff",
} as const;

const FONTS = join(process.cwd(), "assets/fonts");

/** Faces for next/og, which needs TTF/OTF rather than the woff2 the site serves (SIL OFL, see assets/fonts). */
export async function brandFonts() {
  const [display, body, mono] = await Promise.all([
    readFile(join(FONTS, "RubikMonoOne-Regular.ttf")),
    readFile(join(FONTS, "Archivo-SemiBold.ttf")),
    readFile(join(FONTS, "JetBrainsMono-Medium.ttf")),
  ]);
  return [
    { name: "Rubik Mono One", data: display, weight: 400 as const, style: "normal" as const },
    { name: "Archivo", data: body, weight: 600 as const, style: "normal" as const },
    { name: "JetBrains Mono", data: mono, weight: 500 as const, style: "normal" as const },
  ];
}
