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
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
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
