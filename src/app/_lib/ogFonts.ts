/**
 * Font-loader for Next.js `next/og` (Satori) routes.
 *
 * Editorial New is the brand display face but Fontshare doesn't expose
 * raw TTF buffers via a programmatically-fetchable URL — Satori needs
 * raw bytes, not the CSS-served webfont that works on the rendered HTML.
 *
 * Strategy:
 *   1. If `src/assets/fonts/editorial-new-{weight}.ttf` exists, load it.
 *      That's the path the brand-correct OG card / icons take.
 *   2. Otherwise fall back to Playfair Display 700 / 500 from gstatic.
 *      Same Did-one classification (serif, high-contrast), close enough
 *      until the developer drops the licensed TTF in.
 *
 * Drop-in path: download Editorial New 500 + 700 TTFs from your
 * Fontshare/Pangram Pangram subscription and save them as:
 *   src/assets/fonts/editorial-new-500.ttf
 *   src/assets/fonts/editorial-new-700.ttf
 * No code change required — both paths short-circuit on `existsSync`.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const FONTS_DIR = path.join(process.cwd(), "src", "assets", "fonts");

const PLAYFAIR_500_URL =
  "https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKd3vUDQ.ttf";
const PLAYFAIR_700_URL =
  "https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKeiukDQ.ttf";

export interface DisplayFont {
  data: ArrayBuffer;
  /** Name to set as `fontFamily` and pass to ImageResponse. */
  fontFamily: string;
  weight: 500 | 700;
}

export async function loadDisplayFont(weight: 500 | 700): Promise<DisplayFont> {
  const localPath = path.join(FONTS_DIR, `editorial-new-${weight}.ttf`);
  if (existsSync(localPath)) {
    const buf = await readFile(localPath);
    return {
      data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
      fontFamily: "Editorial New",
      weight,
    };
  }
  const url = weight === 700 ? PLAYFAIR_700_URL : PLAYFAIR_500_URL;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Playfair fallback fetch failed: ${url} (${res.status})`);
  }
  return {
    data: await res.arrayBuffer(),
    fontFamily: "Playfair",
    weight,
  };
}
