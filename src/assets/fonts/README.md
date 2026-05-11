# Display-font drop-in

The OG card + apple-icon + favicon render through Satori (next/og),
which needs raw TTF buffers — not the CSS-served webfont that works
on rendered HTML. Editorial New (the brand display face) isn't exposed
via a programmatically-fetchable URL by Fontshare.

When you have access to the licensed TTFs (via your Pangram Pangram /
Fontshare subscription), drop them in here:

```
src/assets/fonts/editorial-new-500.ttf   ← used by the OG card wordmark
src/assets/fonts/editorial-new-700.ttf   ← used by the favicon + apple-icon "B."
```

[`src/app/_lib/ogFonts.ts`](../../app/_lib/ogFonts.ts) checks for both
paths via `existsSync` and uses the local file if present. No code
change required — the existing Playfair Display fallback stays in
place until both files land.

Files in this directory are git-ignored by default. To version-control
them, remove the `.gitignore` exception, but only if you're certain
the license permits distribution in your repo.
