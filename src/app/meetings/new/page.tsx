import { redirect } from 'next/navigation';
import LoginNotice from '@/components/LoginNotice';
import Forbidden from '@/components/Forbidden';
import DbErrorNotice from '@/components/DbErrorNotice';
import MeetingImportForm from '@/components/MeetingImportForm';
import { getPartnerOptions, MeetingDataError } from '@/lib/meeting-data';
import { getSessionUser } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export default async function ImportMeetingPage() {
  // 인증 이후에만 데이터 조회
  const user = await getSessionUser();
  if (!user) return <LoginNotice />;
  // 회의록 가져오기는 관리자 전용. partner 차단.
  if (user.role !== 'admin') {
    if (user.partnerId) redirect(`/kpi/${user.partnerId}`);
    return <Forbidden message="계정에 파트너가 매핑되어 있지 않습니다. 관리자에게 문의해주세요." />;
  }

  let partners;
  try {
    partners = await getPartnerOptions();
  } catch (e) {
    const message = e instanceof MeetingDataError ? e.message : '데이터베이스 연결에 실패했습니다.';
    return (
      <main className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">회의록 가져오기</h1>
        <DbErrorNotice message={message} />
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">회의록 가져오기</h1>
        <p className="text-gray-500 text-sm mt-1">
          외부 AI(ChatGPT/Gemini)로 정리한 회의록을 붙여넣거나 엑셀로 업로드하세요.
        </p>
      </div>
      <MeetingImportForm partners={partners} />
    </main>
  );
}
