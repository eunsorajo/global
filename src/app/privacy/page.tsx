import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '개인정보처리방침 | Partner Network',
  description: 'SBA 해외 액셀러레이팅 파트너 네트워크 개인정보처리방침',
};

// 공개 페이지 (인증 게이트 없음) — Google OAuth 검증 및 동의 화면에서 접근 가능해야 함.
export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-gray-800">
      <h1 className="text-2xl font-bold">개인정보처리방침</h1>
      <p className="mt-2 text-sm text-gray-500">최종 업데이트: 2026-06-11</p>

      <section className="mt-8 space-y-3 leading-relaxed">
        <p>
          본 서비스(&ldquo;Partner Network&rdquo;, 이하 &ldquo;서비스&rdquo;)는 서울경제진흥원(SBA) 해외 액셀러레이팅
          프로그램의 파트너 및 참여기업 KPI 관리를 위해 운영됩니다. 본 방침은 서비스가 수집·이용하는 정보와
          그 보호 방법을 설명합니다.
        </p>
      </section>

      <h2 className="mt-8 text-lg font-semibold">1. 수집하는 정보</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
        <li>
          <strong>계정 정보(Google 로그인)</strong>: 이름, 이메일 주소, 프로필 이미지. 본인 확인 및 접근 권한
          관리(관리자/파트너 역할 구분)에 사용합니다.
        </li>
        <li>
          <strong>Google 캘린더 정보(읽기 전용)</strong>: 회의 일정 표시를 위해 캘린더 이벤트(제목, 시간,
          화상회의 링크)를 <strong>읽기 전용</strong>으로 조회합니다. 캘린더를 수정·생성·삭제하지 않습니다.
        </li>
        <li>
          <strong>업무 데이터</strong>: 사용자가 입력한 파트너·참여기업·KPI 진척도·회의록 내용.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">2. 정보의 이용 목적</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
        <li>로그인 인증 및 역할 기반 접근 제어</li>
        <li>회의 일정 표시(Google 캘린더 읽기)</li>
        <li>파트너별 KPI 현황 집계 및 관리</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">3. 제3자 제공 및 공유</h2>
      <p className="mt-2 leading-relaxed">
        서비스는 수집한 정보를 외부에 판매하거나 광고 목적으로 제공하지 않습니다. 데이터는 서비스 운영에 필요한
        범위(인증: Google, 데이터 저장: Supabase, 호스팅: Vercel) 내에서만 처리됩니다.
      </p>

      <h2 className="mt-8 text-lg font-semibold">4. Google 사용자 데이터의 제한적 사용 (Limited Use)</h2>
      <p className="mt-2 leading-relaxed">
        본 서비스가 Google API로부터 받은 정보의 이용 및 다른 앱으로의 전송은 Google API Services User Data Policy
        (제한적 사용 요건 포함)를 준수합니다. 구체적으로, Google 캘린더 데이터는 사용자에게 회의 일정을 표시하는
        기능 제공 목적으로만 사용하며, 광고 목적으로 사용하거나 제3자에게 양도하지 않고, 사람이 데이터를 열람하지
        않습니다(법적 요구·보안·집계된 익명 통계 제외).
      </p>
      <p className="mt-2 text-sm text-gray-600">
        This application&apos;s use and transfer of information received from Google APIs adhere to the{' '}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          className="text-blue-600 underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      <h2 className="mt-8 text-lg font-semibold">5. 데이터 보관 및 삭제</h2>
      <p className="mt-2 leading-relaxed">
        업무 데이터는 프로그램 운영 기간 동안 보관되며, 계정 삭제 또는 파기 요청 시 합리적 기간 내에 삭제됩니다.
        Google 캘린더 데이터는 서버에 영구 저장하지 않고 조회 시점에만 표시에 사용합니다. 연동 해제는 Google 계정의{' '}
        <a
          href="https://myaccount.google.com/permissions"
          className="text-blue-600 underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          타사 앱 액세스 설정
        </a>
        에서 직접 철회할 수 있습니다.
      </p>

      <h2 className="mt-8 text-lg font-semibold">6. 접근 제한</h2>
      <p className="mt-2 leading-relaxed">
        서비스는 관리자가 사전 등록한 계정만 로그인할 수 있으며, 미등록 계정은 데이터에 접근할 수 없습니다.
        파트너 계정은 자신에게 배정된 정보만 조회·수정할 수 있습니다.
      </p>

      <h2 className="mt-8 text-lg font-semibold">7. 문의</h2>
      <p className="mt-2 leading-relaxed">
        개인정보 관련 문의: <a href="mailto:joeunsora@gmail.com" className="text-blue-600 underline">joeunsora@gmail.com</a>
      </p>

      <div className="mt-10 border-t pt-6 text-sm">
        <Link href="/" className="text-blue-600 underline">홈으로</Link>
        <span className="mx-2 text-gray-300">·</span>
        <Link href="/terms" className="text-blue-600 underline">서비스 약관</Link>
      </div>
    </main>
  );
}
