import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuthStore } from '@/auth/store';
import { BUILTIN_ACCOUNTS } from '@/auth/accounts';

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [id, setId] = useState(BUILTIN_ACCOUNTS[0].id);
  const [pwd, setPwd] = useState(BUILTIN_ACCOUNTS[0].password);
  const [err, setErr] = useState('');

  const onIdChange = (newId: string) => {
    setId(newId);
    const account = BUILTIN_ACCOUNTS.find((a) => a.id === newId);
    if (account) setPwd(account.password);
    setErr('');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login(id, pwd.trim())) {
      navigate('/');
    } else {
      setErr('密码不正确');
    }
  };

  return (
    <div className="h-full w-full flex items-center justify-center">
      <div className="w-[400px] bg-black/40 border border-white/10 rounded-2xl p-8 backdrop-blur-md">
        <div className="text-center mb-6">
          <h1 className="font-cinzel text-2xl tracking-[6px] text-emerald-100">POKER NIGHT</h1>
          <div className="w-12 h-0.5 bg-emerald-500 mx-auto mt-2 rounded"></div>
          <p className="text-xs text-emerald-100/60 mt-3">朋友局 · 私域德扑</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs text-emerald-100/70 mb-1 block">选择你的账号</label>
            <select
              className="input-base w-full"
              value={id}
              onChange={(e) => onIdChange(e.target.value)}
            >
              {BUILTIN_ACCOUNTS.map((a) => (
                <option key={a.id} value={a.id}>{a.id} · {a.defaultName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-emerald-100/70 mb-1 block">密码</label>
            <input
              className="input-base w-full"
              type="password"
              value={pwd}
              onChange={(e) => { setPwd(e.target.value); setErr(''); }}
              autoFocus
            />
          </div>
          {err && <div className="text-red-400 text-xs">{err}</div>}
          <button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-lg tracking-wider transition-colors"
          >
            进入
          </button>
        </form>

        <div className="mt-4 text-center text-[11px] text-emerald-100/40">
          每个朋友各自挑一个账号 · 同一账号不可同时登录两处
        </div>
      </div>
    </div>
  );
}
