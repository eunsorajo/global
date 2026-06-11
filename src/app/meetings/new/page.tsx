import { auth } from '@/auth';
import LoginNotice from '@/components/LoginNotice';
import DbErrorNotice from '@/components/DbErrorNotice';
import MeetingImportForm from '@/components/MeetingImportForm';
import { getPartnerOptions, MeetingDataError } from '@/lib/meeting-data';

export const dynamic = 'force-dynamic';

export default async function ImportMeetingPage() {
  // 인증 이후에만 데이터 조회
  const session = await auth();
  if (!session) return <LoginNotice />;

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
