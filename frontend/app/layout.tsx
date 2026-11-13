import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Sora } from "next/font/google";
import MotionProvider from "./components/MotionProvider";
import NavBar from "./components/NavBar";
import "./globals.css";

// Type pairing: Sora (display, geometric/techy) + Inter (body) + JetBrains
// Mono (numbers and data). Swap here + the --font-* tokens in globals.css.
const sora = Sora({ variable: "--font-sora", subsets: ["latin"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Quorum — AI Trading Agent", template: "%s · Quorum" },
  description: "Multi-agent LangGraph trading agent with human-in-the-loop approval.",
};

export const viewport: Viewport = {
  themeColor: "#050810",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${inter.variable} ${jetbrains.variable}`}
    >
      <body>
        <MotionProvider>
          <NavBar />
          <main className="page">{children}</main>
        </MotionProvider>
      </body>
    </html>
  );
}
