import { signIn } from '@/auth';
import MagicLinkForm from '@/components/MagicLinkForm';

// 미로그인 사용자에게 데이터 대신 노출하는 로그인 안내 화면.
// (데이터 조회는 이 컴포넌트를 거치지 않고 인증 이후에만 일어나야 함)
// - SBA 담당자(관리자): Google 로그인
// - 파트너 담당자: 등록된 회사 이메일로 매직링크 로그인 (Google 계정 불필요)
export default function LoginNotice({ title = '로그인이 필요합니다' }: { title?: string }) {
  return (
    <main className="max-w-md mx-auto px-6 py-20 text-center">
      <div className="bg-white rounded-2xl border border-gray-200 p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-2">{title}</h1>
        <p className="text-sm text-gray-500 mb-6">
          SBA 담당자는 Google 계정으로, 파트너 담당자는 등록된 회사 이메일로 로그인해주세요.
        </p>

        <form
          action={async () => {
            'use server';
            await signIn('google');
          }}
        >
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-3 rounded-xl transition-colors"
          >
            Google 로그인 (SBA 담당자)
          </button>
        </form>

        <div className="flex items-center gap-3 my-5">
          <span className="h-px flex-1 bg-gray-200" />
          <span className="text-xs text-gray-400">또는 파트너 담당자</span>
          <span className="h-px flex-1 bg-gray-200" />
        </div>

        <MagicLinkForm />
      </div>
    </main>
  );
}
