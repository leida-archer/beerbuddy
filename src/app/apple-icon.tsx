import { ImageResponse } from "next/og";

// 180×180 apple-touch-icon — used by iOS home-screen, iMessage link
// preview avatar, and other Apple surfaces. Wheat-oak background +
// ink "B" with warm-amber period — iconic compression of the wordmark.

export const size = { width: 180, height: 180 };
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
        { name: "Playfair", data: playfairBold, style: "normal", weight: 700 },
      ],
    },
  );
}
