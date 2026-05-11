import { ImageResponse } from "next/og";

import { loadDisplayFont } from "./_lib/ogFonts";

// Filename convention: src/app/opengraph-image.tsx → /opengraph-image
// Next.js auto-wires <meta property="og:image" /> when this file exists.
// Re-rendered at request time and cached by Vercel.

export const alt =
  "BeerBuddy — best beer deals in Nevada County, CA. Ranked by what's actually on sale.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Inter and JetBrains Mono are battle-tested with Satori (next/og's
// rendering engine). Bricolage Grotesque + Geist Mono use GSUB
// features Satori doesn't yet support — Inter / JetBrains Mono have
// the same vibe and render reliably.
const INTER_500_URL =
  "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fMZg.ttf";
const JETBRAINS_MONO_500_URL =
  "https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8-qxjPQ.ttf";

async function loadFont(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch font: ${url} (${res.status})`);
  return res.arrayBuffer();
}

export default async function Image() {
  const [display, jetbrainsMono, inter] = await Promise.all([
    loadDisplayFont(500),
    loadFont(JETBRAINS_MONO_500_URL),
    loadFont(INTER_500_URL),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: "#F4E8CB",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "72px 96px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: "Mono",
            fontSize: 22,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "#B8651E",
            marginBottom: 56,
          }}
        >
          Golden Hour
        </div>

        <div
          style={{
            fontFamily: display.fontFamily,
            fontSize: 192,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            color: "#1F1610",
            display: "flex",
          }}
        >
          BeerBuddy<span style={{ color: "#B8651E" }}>.</span>
        </div>

        <div
          style={{
            width: 160,
            height: 2,
            backgroundColor: "#D9C9A4",
            margin: "56px 0 44px",
          }}
        />

        <div
          style={{
            fontFamily: "Body",
            fontSize: 28,
            lineHeight: 1.4,
            color: "#7A6855",
            maxWidth: 760,
          }}
        >
          Best beer deals in Nevada County, CA — ranked by what&rsquo;s actually
          on sale.
        </div>

        <div
          style={{
            fontFamily: "Mono",
            fontSize: 18,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#7A6855",
            marginTop: 56,
          }}
        >
          Nevada County · v0
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: display.fontFamily,
          data: display.data,
          style: "normal",
          weight: 500,
        },
        { name: "Mono", data: jetbrainsMono, style: "normal", weight: 500 },
        { name: "Body", data: inter, style: "normal", weight: 500 },
      ],
    },
  );
}
