import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "포카포켓 | 리센느 포카 명부",
  description: "찾고, 기록하고, 완성하는 오픈소스 포토카드 아카이브",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
