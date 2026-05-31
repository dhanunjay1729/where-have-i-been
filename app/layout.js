import { Geist, Geist_Mono } from "next/font/google";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "WHERE HAVE I BEEN — Travel Visualizer",
  description:
    "Upload your Google Timeline, GPX, KML, or GeoJSON travel data and visualize your entire journey on a stunning interactive map with rich statistics, heatmaps, and route animations.",
  keywords: [
    "travel visualizer",
    "Google Timeline",
    "GPX viewer",
    "KML viewer",
    "location history",
    "travel map",
    "heatmap",
    "route animation",
  ],
  authors: [{ name: "Where Have I Been" }],
  openGraph: {
    title: "WHERE HAVE I BEEN — Travel Visualizer",
    description:
      "Upload your travel data and see where you've been. Beautiful heatmaps, route animations, and travel statistics.",
    type: "website",
    siteName: "Where Have I Been",
  },
  twitter: {
    card: "summary_large_image",
    title: "WHERE HAVE I BEEN — Travel Visualizer",
    description:
      "Upload your travel data and see where you've been on a stunning interactive map.",
  },

};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#050510",
  colorScheme: "dark",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head />
      <body className="min-h-full flex flex-col scanlines">{children}</body>
    </html>
  );
}
