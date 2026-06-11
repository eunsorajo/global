export default function DbErrorNotice({ message }: { message: string }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
      <p className="text-amber-800 font-semibold mb-1">데이터를 불러올 수 없습니다</p>
      <p className="text-amber-700 text-sm">{message}</p>
    </div>
  );
}
