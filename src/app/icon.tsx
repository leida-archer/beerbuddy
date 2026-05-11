import { ImageResponse } from "next/og";

import { loadDisplayFont } from "./_lib/ogFonts";

// 32×32 favicon — browser tabs, bookmarks. Same composition as the
// 180×180 apple-icon, just sized down. Bold serif "B." reads at
// favicon scale because the period (warm-amber) breaks up the form
// and gives a recognizable silhouette.

export const size = { width: 32, height: 32 };
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
          fontSize: 24,
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
