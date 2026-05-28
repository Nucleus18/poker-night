import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuthStore, PRESET_COLORS } from '@/auth/store';
import { useRoomStore, generateRoomCode } from '@/room/store';

type Mode = 'local' | 'create' | 'join';

export default function LobbyPage() {
  const user = useAuthStore((s) => s.user)!;
  const logout = useAuthStore((s) => s.logout);
  const createLocalRoom = useRoomStore((s) => s.createLocalRoom);
  const createOnlineRoom = useRoomStore((s) => s.createOnlineRoom);
  const joinOnlineRoom = useRoomStore((s) => s.joinOnlineRoom);
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('local');
  const [name, setName] = useState('朋友的局');
  const [smallBlind, setSmallBlind] = useState(25);
  const [bigBlind, setBigBlind] = useState(50);
  const [startingStack, setStartingStack] = useState(5000);
  const [rebuyAmount, setRebuyAmount] = useState(5000);
  const [maxRebuys, setMaxRebuys] = useState(3);
  const [durationMin, setDurationMin] = useState(60);
  const [aiCount, setAiCount] = useState(5);
  const [joinCode, setJoinCode] = useState('');
  const [joinErr, setJoinErr] = useState('');

  const start = () => {
    const config = {
      name, smallBlind, bigBlind, startingStack, rebuyAmount, maxRebuys, durationMin, aiCount,
      step: smallBlind,
    };
    if (mode === 'local') {
      const id = createLocalRoom(config);
      navigate(`/room/${id}`);
    } else if (mode === 'create') {
      const code = generateRoomCode();
      createOnlineRoom(code, config);
      navigate(`/room/${code}`);
    }
  };

  const joinRoom = () => {
    const code = joinCode.trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(code)) {
      setJoinErr('房间码格式：6 位大写字母或数字');
      return;
    }
    joinOnlineRoom(code);
    navigate(`/room/${code}`);
  };

  return (
    <div className="h-full w-full flex flex-col">
      <header className="h-14 px-6 flex items-center justify-between border-b border-white/5">
        <div className="font-cinzel tracking-[4px] text-emerald-100/90">POKER NIGHT</div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/profile')} className="flex items-center gap-2 pill">
            <Avatar user={user} size={24} />
            <span>{user.name}</span>
          </button>
          <button onClick={() => { logout(); navigate('/login'); }} className="pill">登出</button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-3xl mx-auto">
          {/* 模式切换 */}
          <div className="flex gap-2 mb-6">
            <ModeTab active={mode === 'local'} onClick={() => setMode('local')}>
              <div className="text-base font-semibold">本地</div>
              <div className="text-[11px] opacity-60">vs AI · 立刻开打</div>
            </ModeTab>
            <ModeTab active={mode === 'create'} onClick={() => setMode('create')}>
              <div className="text-base font-semibold">创建朋友局</div>
              <div className="text-[11px] opacity-60">生成房间码 · 分享给朋友</div>
            </ModeTab>
            <ModeTab active={mode === 'join'} onClick={() => setMode('join')}>
              <div className="text-base font-semibold">加入房间</div>
              <div className="text-[11px] opacity-60">输入房间码加入</div>
            </ModeTab>
          </div>

          {mode === 'join' ? (
            <div className="bg-black/30 border border-white/10 rounded-2xl p-6">
              <Field label="房间码">
                <input
                  className="input-base w-full font-mono text-2xl tracking-[8px] text-center uppercase"
                  value={joinCode}
                  onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinErr(''); }}
                  maxLength={6}
                  placeholder="ABCDEF"
                  autoFocus
                />
              </Field>
              {joinErr && <div className="text-red-400 text-xs mt-2">{joinErr}</div>}
              <button
                onClick={joinRoom}
                disabled={joinCode.length !== 6}
                className="w-full mt-5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/30 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg tracking-wider transition-colors"
              >
                加入
              </button>
            </div>
          ) : (
            <div className="bg-black/30 border border-white/10 rounded-2xl p-6 space-y-5">
              <Field label="房间名">
                <input className="input-base w-full" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="小盲">
                  <input type="number" className="input-base w-full" value={smallBlind} onChange={(e) => {
                    const v = +e.target.value || 0; setSmallBlind(v); if (v * 2 !== bigBlind) setBigBlind(v * 2);
                  }} />
                </Field>
                <Field label="大盲">
                  <input type="number" className="input-base w-full" value={bigBlind} onChange={(e) => setBigBlind(+e.target.value || 0)} />
                </Field>
                <Field label="起始筹码">
                  <input type="number" className="input-base w-full" value={startingStack} onChange={(e) => {
                    const v = +e.target.value || 0; setStartingStack(v); setRebuyAmount(v);
                  }} />
                </Field>
                <Field label="补码额度">
                  <input type="number" className="input-base w-full" value={rebuyAmount} onChange={(e) => setRebuyAmount(+e.target.value || 0)} />
                </Field>
                <Field label="最多补码次数">
                  <input type="number" className="input-base w-full" value={maxRebuys} onChange={(e) => setMaxRebuys(+e.target.value || 0)} />
                </Field>
                <Field label="限时（分钟）">
                  <select className="input-base w-full" value={durationMin} onChange={(e) => setDurationMin(+e.target.value)}>
                    {[15, 30, 60, 90, 120].map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
              </div>

              <Field label={`AI 玩家数：${aiCount}${mode === 'create' ? '（其余空位等真人加入）' : ''}`}>
                <input type="range" className="range-input" min={0} max={8} value={aiCount} onChange={(e) => setAiCount(+e.target.value)} />
              </Field>

              <button onClick={start} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-lg tracking-wider transition-colors">
                {mode === 'local' ? '开局' : '创建房间'}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ModeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-4 py-3 rounded-lg text-left transition-all ${
        active
          ? 'bg-emerald-600/20 border border-emerald-500 text-white'
          : 'bg-white/5 border border-white/10 text-emerald-100/70 hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-emerald-100/70 mb-1">{label}</div>
      {children}
    </label>
  );
}

function Avatar({ user, size = 32 }: { user: { name: string; colorPair: [string, string] }; size?: number }) {
  const [c1, c2] = user.colorPair || PRESET_COLORS[0];
  return (
    <div
      className="rounded-full flex items-center justify-center font-semibold text-white"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${c1}, ${c2})`, fontSize: size * 0.5 }}
    >
      {user.name[0]?.toUpperCase()}
    </div>
  );
}
