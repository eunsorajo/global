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

  // 승인 시 역할·소속 확정용 임시 상태 (pending row id → 선택값)
  const [approveDraft, setApproveDraft] = useState<Record<string, { role: UserRole; partnerId: string }>>({});

  const pending = users.filter((u) => u.status === 'pending');
  const active = users.filter((u) => u.status === 'active');

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

  async function reload() {
    try {
      const { users: fresh } = await call('/api/admin/users', 'GET');
      setUsers(fresh);
    } catch {
      /* 무시: router.refresh 로도 갱신됨 */
    }
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
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
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

  async function toggleSuperAdmin(u: UserWithPartner) {
    const next = !u.is_super_admin;
    if (!confirm(next ? `'${u.email}' 을(를) 최고관리자로 지정할까요?` : `'${u.email}' 의 최고관리자 권한을 해제할까요?`)) return;
    setBusy(true);
    try {
      await call(`/api/admin/users/${u.id}`, 'PATCH', { isSuperAdmin: next });
      await reload();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function approve(u: UserWithPartner) {
    const draft = approveDraft[u.id] ?? { role: u.role, partnerId: u.partner_id ?? '' };
    if (draft.role === 'partner' && !draft.partnerId) {
      setError('파트너 역할은 소속 파트너사를 선택해야 합니다.');
      return;
    }
    setBusy(true);
    try {
      await call(`/api/admin/users/${u.id}`, 'PATCH', {
        status: 'active',
        role: draft.role,
        partnerId: draft.role === 'partner' ? draft.partnerId : null,
      });
      await reload();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function reject(u: UserWithPartner) {
    if (!confirm(`'${u.email}' 의 가입 신청을 거부(삭제)하시겠습니까?`)) return;
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

  async function deleteUser(u: UserWithPartner) {
    if (!confirm(`'${u.email}' 계정을 삭제하시겠습니까? 해당 계정은 더 이상 이용할 수 없습니다.`)) return;
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

  function draftFor(u: UserWithPartner) {
    return approveDraft[u.id] ?? { role: u.role, partnerId: u.partner_id ?? '' };
  }
  function setDraft(id: string, patch: Partial<{ role: UserRole; partnerId: string }>) {
    setApproveDraft((d) => ({ ...d, [id]: { ...(d[id] ?? { role: 'partner', partnerId: '' }), ...patch } }));
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>
      )}

      {/* 승인 대기 */}
      <section className="bg-white rounded-xl border border-amber-200 overflow-hidden">
        <div className="bg-amber-50 px-5 py-3 border-b border-amber-200 flex items-center gap-2">
          <h3 className="font-semibold text-amber-800">승인 대기</h3>
          <span className="text-xs bg-amber-200 text-amber-800 rounded-full px-2 py-0.5">{pending.length}</span>
        </div>
        {pending.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400">승인 대기 중인 신청이 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left px-4 py-3 font-medium">이메일 / 이름</th>
                <th className="text-left px-4 py-3 font-medium w-28">신청 역할</th>
                <th className="text-left px-4 py-3 font-medium w-56">소속 파트너</th>
                <th className="px-4 py-3 w-40"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pending.map((u) => {
                const d = draftFor(u);
                return (
                  <tr key={u.id} className="hover:bg-amber-50/40">
                    <td className="px-4 py-3">
                      <span className="text-gray-900 block">{u.email}</span>
                      <span className="text-gray-500 text-xs">{u.name ?? '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={d.role}
                        disabled={busy}
                        onChange={(e) => setDraft(u.id, { role: e.target.value as UserRole })}
                        className={`${input} disabled:opacity-50`}
                      >
                        <option value="partner">파트너</option>
                        <option value="admin">관리자(조직)</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {d.role === 'partner' ? (
                        <select
                          value={d.partnerId}
                          disabled={busy}
                          onChange={(e) => setDraft(u.id, { partnerId: e.target.value })}
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
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => approve(u)}
                        disabled={busy}
                        className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 mr-2"
                      >
                        승인
                      </button>
                      <button
                        onClick={() => reject(u)}
                        disabled={busy}
                        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                      >
                        거부
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* 사용자 추가 (즉시 활성) */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-1">사용자 직접 추가</h3>
        <p className="text-xs text-gray-400 mb-4">추가한 계정은 즉시 활성(active) 상태가 됩니다.</p>
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

      {/* 활성 사용자 목록 */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">활성 사용자 ({active.length})</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left px-4 py-3 font-medium">이메일</th>
              <th className="text-left px-4 py-3 font-medium">이름</th>
              <th className="text-left px-4 py-3 font-medium w-28">역할</th>
              <th className="text-left px-4 py-3 font-medium w-56">매핑 파트너</th>
              <th className="text-center px-4 py-3 font-medium w-28">최고관리자</th>
              <th className="px-4 py-3 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {active.map((u) => {
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
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleSuperAdmin(u)}
                      disabled={busy}
                      className={`text-xs px-2 py-1 rounded-full border disabled:opacity-50 ${
                        u.is_super_admin
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : 'bg-gray-50 text-gray-500 border-gray-200'
                      }`}
                      title="최고관리자 권한 토글"
                    >
                      {u.is_super_admin ? '최고관리자' : '일반'}
                    </button>
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
            {active.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">
                  활성 사용자가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
