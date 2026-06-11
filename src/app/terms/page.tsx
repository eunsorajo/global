import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '서비스 약관 | Partner Network',
  description: 'SBA 해외 액셀러레이팅 파트너 네트워크 서비스 약관',
};

// 공개 페이지 (인증 게이트 없음).
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-gray-800">
      <h1 className="text-2xl font-bold">서비스 약관</h1>
      <p className="mt-2 text-sm text-gray-500">최종 업데이트: 2026-06-11</p>

      <h2 className="mt-8 text-lg font-semibold">1. 목적</h2>
      <p className="mt-2 leading-relaxed">
        본 약관은 서울경제진흥원(SBA) 해외 액셀러레이팅 프로그램의 파트너 네트워크 관리 서비스(이하
        &ldquo;서비스&rdquo;)의 이용 조건을 규정합니다.
      </p>

      <h2 className="mt-8 text-lg font-semibold">2. 이용 자격</h2>
      <p className="mt-2 leading-relaxed">
        서비스는 SBA 및 해외 액셀러레이팅 프로그램 참여 파트너 중 관리자가 사전 등록한 계정에 한해 이용할 수
        있습니다. 무단 접근 및 권한 외 사용은 금지됩니다.
      </p>

      <h2 className="mt-8 text-lg font-semibold">3. 이용자의 의무</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
        <li>로그인 계정 및 접근 권한을 타인과 공유하지 않습니다.</li>
        <li>본인에게 배정된 범위 내에서만 데이터를 조회·입력합니다.</li>
        <li>업무 목적 외로 데이터를 사용하거나 외부에 유출하지 않습니다.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">4. 서비스 제공 및 변경</h2>
      <p className="mt-2 leading-relaxed">
        운영자는 프로그램 운영 사정에 따라 서비스 내용을 변경하거나 중단할 수 있으며, 중요한 변경은 사전에
        공지합니다.
      </p>

      <h2 className="mt-8 text-lg font-semibold">5. 책임의 한계</h2>
      <p className="mt-2 leading-relaxed">
        서비스는 업무 관리 보조 도구로 제공되며, 이용자가 입력한 데이터의 정확성에 대한 책임은 입력 주체에게
        있습니다.
      </p>

      <h2 className="mt-8 text-lg font-semibold">6. 문의</h2>
      <p className="mt-2 leading-relaxed">
        문의: <a href="mailto:joeunsora@gmail.com" className="text-blue-600 underline">joeunsora@gmail.com</a>
      </p>

      <div className="mt-10 border-t pt-6 text-sm">
        <Link href="/" className="text-blue-600 underline">홈으로</Link>
        <span className="mx-2 text-gray-300">·</span>
        <Link href="/privacy" className="text-blue-600 underline">개인정보처리방침</Link>
      </div>
    </main>
  );
}
