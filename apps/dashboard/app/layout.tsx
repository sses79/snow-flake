import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "School Wellbeing Signals",
  description: "Synthetic school wellbeing trend and support-signal dashboard"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
