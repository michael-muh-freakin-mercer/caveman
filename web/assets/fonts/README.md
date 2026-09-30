The site's typefaces, kept in the repo so builds never need to reach Google
Fonts.

- `*.woff2` are what the site serves, through `next/font/local` in
  `app/layout.tsx`. Archivo and JetBrains Mono are the variable-weight fonts
  from github.com/google/fonts, subset to Latin, Latin Extended and Vietnamese
  (JetBrains Mono and Rubik Mono One also keep Cyrillic; JetBrains Mono keeps
  Greek).
- `*.ttf` are static copies used only to draw generated images
  (`app/opengraph-image.tsx`), because `next/og` cannot read WOFF2 or variable
  fonts.

Rubik Mono One, Archivo and JetBrains Mono are licensed under the SIL Open
Font License 1.1 (https://openfontlicense.org).
