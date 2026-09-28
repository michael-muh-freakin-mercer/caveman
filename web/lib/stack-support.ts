/**
 * What Caveman can verify by running it. Python and Node/TypeScript code is
 * compiled and tested in the sandbox; anything else is delivered as reviewed
 * source without executable checks. This only informs the user before a build
 * starts; it never blocks one.
 */
const UNVERIFIED: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(ios|iphone|ipad|swift|swiftui|xcode)\b/i, label: "iOS / Swift" },
  { pattern: /\b(android|kotlin)\b/i, label: "Android / Kotlin" },
  { pattern: /\b(flutter|dart)\b/i, label: "Flutter / Dart" },
  { pattern: /\breact[ -]native\b|\bexpo\b/i, label: "React Native" },
  { pattern: /\bmobile app\b/i, label: "native mobile apps" },
  { pattern: /\b(golang|go lang)\b|\bin go\b|\bgo (backend|service|api|cli)\b/i, label: "Go" },
  { pattern: /\brust\b|\bcargo\b/i, label: "Rust" },
  { pattern: /\b(java|spring boot|gradle|maven)\b/i, label: "Java" },
  { pattern: /\b(c#|\.net|dotnet|asp\.net)\b/i, label: ".NET" },
  { pattern: /\b(php|laravel|wordpress)\b/i, label: "PHP" },
  { pattern: /\b(ruby|rails)\b/i, label: "Ruby" },
  { pattern: /\b(c\+\+|cpp)\b/i, label: "C++" },
  { pattern: /\b(unity|unreal|godot)\b/i, label: "game engines" },
];

export function unverifiedStacks(...texts: string[]): string[] {
  const text = texts.join(" \n ");
  return [...new Set(UNVERIFIED.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label))];
}
