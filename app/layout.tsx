import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monitor Quality Rating Tool",
  description: "Local monitor-only video quality rating tool"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
