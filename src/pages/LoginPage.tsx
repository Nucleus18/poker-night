import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuthStore } from '@/auth/store';
import { BUILTIN_ACCOUNTS } from '@/auth/accounts';

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [id, setId] = useState('player01');
  const [pwd, setPwd] = useState('poker01');
  const [err, setErr] = useState('');
  const [showHint, setShowHint] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login(id.trim(), pwd.trim())) {
      navigate('/');
    } else {
      setErr('账号或密码不正确');
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
            <label className="text-xs text-emerald-100/70 mb-1 block">账号</label>
            <input className="input-base w-full" value={id} onChange={(e) => setId(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="text-xs text-emerald-100/70 mb-1 block">密码</label>
            <input className="input-base w-full" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
          </div>
          {err && <div className="text-red-400 text-xs">{err}</div>}
          <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-lg tracking-wider transition-colors">
            进入
          </button>
        </form>

        <div className="mt-4 text-center">
          <button onClick={() => setShowHint((v) => !v)} className="text-xs text-emerald-100/50 hover:text-emerald-300">
            {showHint ? '隐藏' : '查看'} 10 个内置账号
          </button>
        </div>

        {showHint && (
          <div className="mt-3 grid grid-cols-2 gap-1 text-[11px] text-emerald-100/70 bg-black/40 p-3 rounded-lg">
            {BUILTIN_ACCOUNTS.map((a) => (
              <div key={a.id} className="flex justify-between">
                <span>{a.id}</span>
                <span className="text-emerald-100/50">{a.password}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
