import { signOut } from '@/auth';

// 가입 신청은 완료했으나 아직 최고관리자 승인을 받지 못한 사용자에게 노출.
// 데이터에는 접근할 수 없으며, 승인 후 새로고침하면 정상 화면으로 전환된다.
export default function PendingNotice({ email }: { email?: string }) {
  return (
    <main className="max-w-md mx-auto px-6 py-20 text-center">
      <div className="bg-white rounded-2xl border border-gray-200 p-8">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 text-2xl">
          ⏳
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">승인 대기 중입니다</h1>
        <p className="text-sm text-gray-500 mb-2">
          가입 신청이 접수되었습니다. 최고관리자가 승인하면 이용할 수 있습니다.
        </p>
        {email && <p className="text-xs text-gray-400 mb-6">{email}</p>}
        <p className="text-xs text-gray-400 mb-6">
          승인 후 이 페이지를 새로고침하면 정상 화면으로 전환됩니다.
        </p>
        <form
          action={async () => {
            'use server';
            await signOut();
          }}
        >
          <button
            type="submit"
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-4 py-3 rounded-xl transition-colors"
          >
            로그아웃
          </button>
        </form>
      </div>
    </main>
  );
}
