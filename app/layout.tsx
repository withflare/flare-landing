import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flare — Find signal from noise",
  description:
    "The product signals layer for teams drowning in conversations, replays, and tickets.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
