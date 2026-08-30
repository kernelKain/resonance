import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Resonance — Customer Emotion Archaeology",
  description:
    "A TrueForge agent that excavates psychological subtext from customer reviews: Plutchik emotions, cognitive dissonance, and unmet Maslow needs.",
};

export const viewport: Viewport = {
  themeColor: "#071018",
  colorScheme: "dark light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background font-sans text-foreground transition-colors duration-300">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:px-4 focus:py-2 focus:bg-cyan-900 focus:text-cyan-50 focus:outline-none focus:ring-2 focus:ring-cyan-300"
        >
          Skip to main content
        </a>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}