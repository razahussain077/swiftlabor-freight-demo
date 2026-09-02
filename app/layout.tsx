import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scout | SwiftLabor Lead Intelligence",
  description: "Evidence-led AI prospect research and qualification by SwiftLabor.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
