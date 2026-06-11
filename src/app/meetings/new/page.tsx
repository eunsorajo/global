import { redirect } from 'next/navigation';
import LoginNotice from '@/components/LoginNotice';
import PendingNotice from '@/components/PendingNotice';
import Forbidden from '@/components/Forbidden';
import DbErrorNotice from '@/components/DbErrorNotice';
import MeetingImportForm from '@/components/MeetingImportForm';
import { getPartnerOptions, MeetingDataError } from '@/lib/meeting-data';
import { getDirectoryMatchCandidates, DirectoryDataError } from '@/lib/directory-data';
import { pageGate } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export default async function ImportMeetingPage() {
  // 가입 게이트
  const gate = await pageGate();
  if (gate.state === 'login') return <LoginNotice />;
  if (gate.state === 'register') redirect('/register');
  if (gate.state === 'pending') return <PendingNotice email={gate.email} />;
  const user = gate.user;
  // 회의록 가져오기는 관리자 전용. partner 차단.
  if (user.role !== 'admin') {
    if (user.partnerId) redirect('/partner');
    return <Forbidden message="계정에 파트너가 매핑되어 있지 않습니다. 최고관리자에게 문의해주세요." />;
  }

  let partners;
  let directoryOptions;
  try {
    [partners, directoryOptions] = await Promise.all([
      getPartnerOptions(),
      getDirectoryMatchCandidates(),
    ]);
  } catch (e) {
    const message =
      e instanceof MeetingDataError || e instanceof DirectoryDataError
        ? e.message
        : '데이터베이스 연결에 실패했습니다.';
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
      <MeetingImportForm partners={partners} directoryOptions={directoryOptions} />
    </main>
  );
}
