import "./globals.css";
import { Metadata } from "next";
import ClientLayoutWrapper from "./components/ClientLayoutWrapper";

export const metadata: Metadata = {
  title: "Social Network",
  description: "Powered By Reboot",
  icons: {
    icon: '/favicon.svg'
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full h-full flex bg-gray-100">
        <ClientLayoutWrapper>{children}</ClientLayoutWrapper>
      </body>
    </html>
  );
}