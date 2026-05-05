import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist_Mono } from "next/font/google";
import "./globals.css";

// Body / UI face. See DESIGN.md § Typography.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

// Data / prices face — tabular numerals enabled per-element via font-feature-settings.
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

// Display face — Editorial New is hosted by Fontshare (not on Google Fonts).
// The variable is declared in <head> via a <link> below.
// Same approach as design-consultation preview HTML.

export const metadata: Metadata = {
  title: "BeerBuddy — best beer deals in Nevada County",
  description:
    "Mobile-first PWA showing this week's best beer deals at chain and indie stores in Nevada County, CA. Ranked by deal-vs-baseline, not just sticker price.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4E8CB" },
    { media: "(prefers-color-scheme: dark)", color: "#1B130C" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${bricolage.variable} ${geistMono.variable}`}>
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=editorial-new@200,400,500,500i,700&display=swap"
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `:root { --font-display: "Editorial New", Georgia, serif; }`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
