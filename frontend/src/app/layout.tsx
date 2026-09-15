import "./globals.css";
import type { Metadata } from "next";
import BackendProvider from "./components/BackendProvider";

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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full h-full flex bg-gray-100">
        <BackendProvider>{children}</BackendProvider>
      </body>
    </html>
  );
}