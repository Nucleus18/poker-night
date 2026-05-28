import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuthStore, PRESET_COLORS } from '@/auth/store';

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)!;
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const navigate = useNavigate();
  const [name, setName] = useState(user.name);
  const [colorIdx, setColorIdx] = useState(
    PRESET_COLORS.findIndex((p) => p[0] === user.colorPair[0]) === -1
      ? 0
      : PRESET_COLORS.findIndex((p) => p[0] === user.colorPair[0]),
  );
  const [customAvatar, setCustomAvatar] = useState<string | null>(
    user.avatar?.startsWith('data:') ? user.avatar : null,
  );

  const handleFile = (file: File) => {
    if (file.size > 200 * 1024) { alert('图片不能超过 200KB'); return; }
    const reader = new FileReader();
    reader.onload = () => setCustomAvatar(String(reader.result));
    reader.readAsDataURL(file);
  };

  const save = () => {
    updateProfile({
      name: name.trim() || user.name,
      colorPair: PRESET_COLORS[colorIdx],
      avatar: customAvatar || `preset:${colorIdx}`,
    });
    navigate('/');
  };

  return (
    <div className="h-full w-full flex flex-col">
      <header className="h-14 px-6 flex items-center justify-between border-b border-white/5">
        <button onClick={() => navigate('/')} className="pill">← 返回大厅</button>
        <div className="font-cinzel tracking-[4px] text-emerald-100/80">个人资料</div>
        <div></div>
      </header>

      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-md mx-auto">
          <div className="bg-black/30 border border-white/10 rounded-2xl p-6 space-y-5">
            <div className="flex justify-center">
              {customAvatar ? (
                <img src={customAvatar} className="w-24 h-24 rounded-full object-cover border-2 border-emerald-500" />
              ) : (
                <div
                  className="w-24 h-24 rounded-full flex items-center justify-center text-4xl font-semibold border-2 border-emerald-500"
                  style={{ background: `linear-gradient(135deg, ${PRESET_COLORS[colorIdx][0]}, ${PRESET_COLORS[colorIdx][1]})` }}
                >
                  {name[0]?.toUpperCase()}
                </div>
              )}
            </div>

            <div>
              <div className="text-xs text-emerald-100/70 mb-1">昵称</div>
              <input className="input-base w-full" value={name} onChange={(e) => setName(e.target.value)} maxLength={16} />
            </div>

            <div>
              <div className="text-xs text-emerald-100/70 mb-2">头像配色</div>
              <div className="grid grid-cols-5 gap-2">
                {PRESET_COLORS.map(([c1, c2], i) => (
                  <button
                    key={i}
                    onClick={() => { setColorIdx(i); setCustomAvatar(null); }}
                    className={`h-12 rounded-lg ${colorIdx === i && !customAvatar ? 'ring-2 ring-emerald-500' : ''}`}
                    style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs text-emerald-100/70 mb-2">或上传自定义头像 (≤200KB)</div>
              <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} className="text-xs" />
              {customAvatar && (
                <button onClick={() => setCustomAvatar(null)} className="text-xs text-red-400 mt-2">清除上传，回到预设</button>
              )}
            </div>

            <button onClick={save} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-lg tracking-wider transition-colors">
              保存
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
