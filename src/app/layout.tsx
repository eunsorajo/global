import type { Metadata } from "next";
import Link from "next/link";
import { Geist } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Partner Network",
  description: "글로벌 파트너 네트워크 관리 플랫폼",
  // Google Search Console 도메인 소유권 확인용 메타태그.
  // GOOGLE_SITE_VERIFICATION 환경변수가 설정되면 자동으로 렌더된다(미설정 시 생략).
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-gray-50">
        <Navbar />
        <div className="flex-1">{children}</div>
        <footer className="border-t bg-white py-4 text-center text-xs text-gray-400">
          <Link href="/privacy" className="hover:text-gray-600">개인정보처리방침</Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="hover:text-gray-600">서비스 약관</Link>
        </footer>
      </body>
    </html>
  );
}
