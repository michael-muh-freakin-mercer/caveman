import type { ComponentProps } from "react";

/**
 * Cavman himself: a 12x12 pixel caveman. Each mood is a sprite; letters map to
 * palette entries and dots are transparent. Drawn as SVG rects so it scales
 * crisply, works in server components, and renders inside next/og images.
 */
export type Mood = "idle" | "blink" | "listen" | "dig" | "cheer" | "hide" | "sleep";

const IDLE = [
  "....hhh.....",
  "...hhhhh....",
  "..sssssss...",
  ".sssssssss..",
  ".sseessees.c",
  ".sssssssss.c",
  ".ssssmmsss.c",
  "..fffffff..c",
  ".fffffffff.w",
  ".fffffffffw.",
  "..ff...ff...",
  "..kk...kk...",
];

const SPRITES: Record<Mood, string[]> = {
  idle: IDLE,
  blink: IDLE.map((row, y) => (y === 4 ? ".sssssssss.c" : row)),
  listen: [
    "....hhh....x",
    "...hhhhh...x",
    "..sssssss...",
    ".sseessees.x",
    ".sssssssss.c",
    ".sssssssss.c",
    ".sssmmssss.c",
    "..fffffff..c",
    ".fffffffff.w",
    ".fffffffffw.",
    "..ff...ff...",
    "..kk...kk...",
  ],
  dig: [
    "....hhh.....",
    "...hhhhh....",
    "..sssssss...",
    ".sssssssss..",
    ".sseessees..",
    ".sssssssss..",
    ".ssssmmsss..",
    "..fffffff.w.",
    ".ffffffffww.",
    ".fffffffw...",
    "..ff...ffcc.",
    "..kk..dkkcdd",
  ],
  cheer: [
    "f...hhh...f.",
    "f..hhhhh..f.",
    "fsssssssssf.",
    ".sssssssss..",
    ".sseessees..",
    ".sssssssss..",
    ".sssmmmmss..",
    "..fffffff...",
    "..fffffff...",
    "..fffffff...",
    "..ff...ff...",
    "..kk...kk...",
  ],
  hide: [
    "............",
    "............",
    "............",
    "....hhh.....",
    "...hhhhh....",
    "..sssssss...",
    ".sseessees..",
    "..rrrrrrrr..",
    ".rrrrrrrrrr.",
    "rrrrrrrrrrrr",
    "rrrrrrrrrrrr",
    "rrrrrrrrrrrr",
  ],
  sleep: [
    "....hhh..zzz",
    "...hhhhh..z.",
    "..ssssssszzz",
    ".sssssssss..",
    ".sssssssss..",
    ".seessseess.",
    ".sssssssss..",
    "..fffffff...",
    ".fffffffff..",
    ".fffffffff..",
    "..ff...ff...",
    "..kk...kk...",
  ],
};

const PALETTE: Record<string, string> = {
  h: "#141414", // hair
  s: "#ffd400", // face, duck yellow
  e: "#141414", // eyes
  m: "#ff5fa2", // mouth
  f: "#8fd3ff", // tunic
  c: "#141414", // club
  w: "#141414", // club handle, shovel
  k: "#141414", // feet
  r: "#8a8f82", // rock
  d: "#6b5a45", // dirt
  x: "#ff5fa2", // exclamation
  z: "#1f5fd6", // snore
};

function rects(mood: Mood) {
  const out: React.ReactElement[] = [];
  SPRITES[mood].forEach((row, y) =>
    [...row].forEach((cell, x) => {
      const fill = PALETTE[cell];
      if (fill) out.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.04} height={1.04} fill={fill} />);
    }),
  );
  return out;
}

export function Cavman({
  mood = "idle",
  title,
  className = "h-8 w-8",
  ...props
}: { mood?: Mood; title?: string } & ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      {...props}
    >
      {rects(mood)}
    </svg>
  );
}
