import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://poca.rescene.fun"),
  title: "리센느 포카도감 | 포토카드 검색·이미지 인식",
  description: "RESCENE(리센느) 앨범·이벤트 포토카드를 멤버별로 찾아보고, 사진으로 포카를 인식해 나의 포카를 기록하는 리센느 포카도감입니다.",
  keywords: ["리센느 포카", "RESCENE 포카", "리센느 포토카드", "리센느 포카도감", "원이", "리브", "미나미", "메이", "제나"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "/",
    siteName: "리센느 포카도감",
    title: "리센느 포카도감 | 포토카드 검색·이미지 인식",
    description: "리센느 앨범·이벤트 포카를 검색하고 사진으로 인식해 나의 포카를 기록하세요.",
  },
  robots: { index: true, follow: true },
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
      <body className="antialiased">
        {children}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "리센느 포카도감",
          alternateName: "RESCENE Photocard Pocket",
          url: "https://poca.rescene.fun",
          description: "리센느 앨범·이벤트 포토카드 검색, 이미지 인식 및 소장 기록 서비스",
          inLanguage: "ko-KR",
        }) }} />
      </body>
    </html>
  );
}
