import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chérie",
  description: "Private shared Roblox gamepass order tracker for Chérie.",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png"
  }
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
