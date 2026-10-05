import "./globals.css";
import type { Metadata } from "next";
import BackendProvider from "./components/BackendProvider";
import ThemeProvider from "./components/ThemeProvider";
import { themeScript } from "./lib/theme";
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = {
  title: "Social Network",
  description: "Powered By Reboot",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Puts the stored theme on <html> while the document is parsed, so the
            first paint is already correct. ThemeProvider owns the class after
            that; `suppressHydrationWarning` accepts the class the script added. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* `bg-fixed` pins the wash to the viewport instead of the document, so the gradient
          stays where it was painted while a long feed scrolls over it. Left unpinned it
          stretches over the whole page and appears to slide up as you scroll — the thing a
          fixed attachment (or a single flat colour) avoids. */}
      <body className="min-h-screen bg-bg bg-linear-to-b from-bg-grad-1 to-bg-grad-2 bg-fixed text-text">
        <ThemeProvider>
          <BackendProvider>{children}</BackendProvider>
        </ThemeProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "var(--ui-card)",
              color: "var(--ui-text)",
              border: "1px solid var(--ui-border)",
            },
          }}
        />
      </body>
    </html>
  );
}
