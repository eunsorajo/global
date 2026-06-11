import { signIn } from '@/auth';

// 미로그인 사용자에게 데이터 대신 노출하는 로그인 안내 화면.
// (데이터 조회는 이 컴포넌트를 거치지 않고 인증 이후에만 일어나야 함)
export default function LoginNotice({ title = '로그인이 필요합니다' }: { title?: string }) {
  return (
    <main className="max-w-md mx-auto px-6 py-20 text-center">
      <div className="bg-white rounded-2xl border border-gray-200 p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-2">{title}</h1>
        <p className="text-sm text-gray-500 mb-6">
          파트너 데이터를 조회하려면 허용된 Google 계정으로 로그인해주세요.
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
            Google 로그인
          </button>
        </form>
      </div>
    </main>
  );
}
