import { ImageResponse } from "next/og";

// 32×32 favicon — browser tabs, bookmarks. Same composition as the
// 180×180 apple-icon, just sized down. Bold serif "B." reads at
// favicon scale because the period (warm-amber) breaks up the form
// and gives a recognizable silhouette.

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const PLAYFAIR_700_URL =
  "https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKeiukDQ.ttf";

export default async function Icon() {
  const playfairBold = await fetch(PLAYFAIR_700_URL).then((r) =>
    r.arrayBuffer(),
  );

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
          fontFamily: "Playfair",
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
        { name: "Playfair", data: playfairBold, style: "normal", weight: 700 },
      ],
    },
  );
}
