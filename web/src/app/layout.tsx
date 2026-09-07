import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aether // Logic Engine",
  description: "Automated trading agent dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-accent selection:text-background">{children}</body>
    </html>
  );
}
