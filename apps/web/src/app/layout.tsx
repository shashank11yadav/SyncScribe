import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SyncScribe", template: "%s · SyncScribe" },
  description: "Write together in real time, with roles, version history and Markdown export.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#141413" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Every page renders per request so the CSP nonce from the proxy can be applied.
  await connection();
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" tabIndex={-1} className="outline-none">
          {children}
        </main>
      </body>
    </html>
  );
}
