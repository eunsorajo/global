'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UserWithPartner } from '@/lib/user-data';
import type { UserRole } from '@/types/next-auth';

interface PartnerOption {
  id: string;
  name: string;
  country: string;
}

export default function AdminUsersManager({
  initialUsers,
  partners,
  currentEmail,
}: {
  initialUsers: UserWithPartner[];
  partners: PartnerOption[];
  currentEmail: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState<UserWithPartner[]>(initialUsers);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 추가 폼 상태
  const [form, setForm] = useState<{ email: string; name: string; role: UserRole; partnerId: string }>({
    email: '',
    name: '',
    role: 'partner',
    partnerId: '',
  });

  async function call(url: string, method: string, body?: unknown) {
    setError(null);
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? '요청 실패');
    return data;
  }

  async function addUser() {
    const email = form.email.trim().toLowerCase();
    if (!email) {
      setError('이메일을 입력하세요.');
      return;
    }
    if (form.role === 'partner' && !form.partnerId) {
      setError('파트너 역할은 파트너를 선택해야 합니다.');
      return;
    }
    setBusy(true);
    try {
      await call('/api/admin/users', 'POST', {
        email,
        name: form.name.trim() || null,
        role: form.role,
        partnerId: form.role === 'partner' ? form.partnerId : null,
      });
      setForm({ email: '', name: '', role: 'partner', partnerId: '' });
      router.refresh();
      // 서버에서 최신 목록을 다시 받기 위해 새로고침에 의존하되, 즉시 반영을 위해 재조회.
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reload() {
    try {
      const { users: fresh } = await call('/api/admin/users', 'GET');
      setUsers(fresh);
    } catch {
      /* 무시: 화면은 router.refresh 로도 갱신됨 */
    }
  }

  async function changeRole(u: UserWithPartner, role: UserRole, partnerId: string | null) {
    setBusy(true);
    try {
      await call(`/api/admin/users/${u.id}`, 'PATCH', { role, partnerId });
      await reload();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser(u: UserWithPartner) {
    if (!confirm(`'${u.email}' 계정을 삭제하시겠습니까? 해당 계정은 더 이상 로그인할 수 없습니다.`)) return;
    setBusy(true);
    try {
      await call(`/api/admin/users/${u.id}`, 'DELETE');
      setUsers((list) => list.filter((x) => x.id !== u.id));
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = 'border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-400';

  return (
    <div className="space-y-8">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>
      )}

      {/* 사용자 추가 */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-4">사용자 추가</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-400 mb-0.5">이메일 *</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="user@example.com"
              className={`${input} w-full`}
            />
          </div>
          <div className="min-w-[120px]">
            <label className="block text-xs text-gray-400 mb-0.5">이름</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={`${input} w-full`}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-0.5">역할 *</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
              className={input}
            >
              <option value="partner">파트너</option>
              <option value="admin">관리자</option>
            </select>
          </div>
          {form.role === 'partner' && (
            <div className="min-w-[200px]">
              <label className="block text-xs text-gray-400 mb-0.5">파트너 *</label>
              <select
                value={form.partnerId}
                onChange={(e) => setForm({ ...form, partnerId: e.target.value })}
                className={`${input} w-full`}
              >
                <option value="">선택하세요</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.country} / {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={addUser}
            disabled={busy}
            className="text-sm bg-gray-900 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
          >
            + 추가
          </button>
        </div>
      </section>

      {/* 사용자 목록 */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left px-4 py-3 font-medium">이메일</th>
              <th className="text-left px-4 py-3 font-medium">이름</th>
              <th className="text-left px-4 py-3 font-medium w-28">역할</th>
              <th className="text-left px-4 py-3 font-medium w-56">매핑 파트너</th>
              <th className="px-4 py-3 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => {
              const isSelf = u.email.toLowerCase() === currentEmail.toLowerCase();
              return (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">
                    {u.email}
                    {isSelf && <span className="ml-2 text-xs text-blue-600">(나)</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.name ?? '-'}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      disabled={busy}
                      onChange={(e) => {
                        const role = e.target.value as UserRole;
                        // partner 로 바꾸면 파트너 선택이 필요 → 기존 매핑 없으면 첫 파트너로 유도
                        const partnerId = role === 'partner' ? (u.partner_id ?? partners[0]?.id ?? null) : null;
                        changeRole(u, role, partnerId);
                      }}
                      className={`${input} disabled:opacity-50`}
                    >
                      <option value="partner">파트너</option>
                      <option value="admin">관리자</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {u.role === 'partner' ? (
                      <select
                        value={u.partner_id ?? ''}
                        disabled={busy}
                        onChange={(e) => changeRole(u, 'partner', e.target.value || null)}
                        className={`${input} w-full disabled:opacity-50`}
                      >
                        <option value="">선택하세요</option>
                        {partners.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.country} / {p.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gray-400 text-xs">전체 (관리자)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!isSelf && (
                      <button
                        onClick={() => deleteUser(u)}
                        disabled={busy}
                        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                      >
                        삭제
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">
                  등록된 사용자가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
