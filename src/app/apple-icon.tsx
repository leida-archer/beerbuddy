import { ImageResponse } from "next/og";

import { loadDisplayFont } from "./_lib/ogFonts";

// 180×180 apple-touch-icon — used by iOS home-screen, iMessage link
// preview avatar, and other Apple surfaces. Wheat-oak background +
// ink "B" with warm-amber period — iconic compression of the wordmark.

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function Icon() {
  const display = await loadDisplayFont(700);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: "#F4E8CB",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: display.fontFamily,
          fontSize: 132,
          lineHeight: 1,
          letterSpacing: "-0.04em",
          color: "#1F1610",
        }}
      >
        B<span style={{ color: "#B8651E" }}>.</span>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: display.fontFamily,
          data: display.data,
          style: "normal",
          weight: 700,
        },
      ],
    },
  );
}
