import "./globals.css";
import type { Metadata } from "next";
import BackendProvider from "./components/BackendProvider";
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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-screen bg-gray-100">
        <BackendProvider>{children}</BackendProvider>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
