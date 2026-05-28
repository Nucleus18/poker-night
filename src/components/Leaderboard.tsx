import type { GameState } from '@/engine/types';

interface Props {
  state: GameState;
  onRestart: () => void;
  onExit: () => void;
}

export default function Leaderboard({ state, onRestart, onExit }: Props) {
  const ranked = [...state.players]
    .filter((p) => p.accountId)
    .sort((a, b) => b.stack - a.stack);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[100]">
      <div className="bg-gradient-to-b from-[#0e2820] to-[#03100b] border border-emerald-500/40 rounded-2xl p-8 w-[480px] shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
        <div className="text-center mb-6">
          <div className="text-[10px] tracking-[3px] text-emerald-100/60">FINAL STANDINGS</div>
          <h2 className="font-cinzel text-2xl tracking-[4px] text-emerald-200 mt-1">积分榜</h2>
          <div className="w-12 h-0.5 bg-emerald-500 mx-auto mt-2 rounded"></div>
        </div>

        <div className="space-y-2">
          {ranked.map((p, i) => (
            <div
              key={p.seatIdx}
              className={`flex items-center gap-3 p-3 rounded-lg ${
                i === 0
                  ? 'bg-amber-500/15 border border-amber-400'
                  : i === 1
                    ? 'bg-gray-400/10 border border-gray-400/40'
                    : i === 2
                      ? 'bg-amber-700/10 border border-amber-700/40'
                      : 'bg-white/5 border border-white/10'
              }`}
            >
              <div className={`w-8 text-lg font-bold ${i < 3 ? 'text-amber-300' : 'text-emerald-100/50'}`}>
                #{i + 1}
              </div>
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center font-semibold"
                style={{ background: `linear-gradient(135deg, ${p.colorPair[0]}, ${p.colorPair[1]})` }}
              >
                {p.name[0]?.toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="font-medium">{p.name}{p.isHero && <span className="text-[10px] text-emerald-400 ml-2">(你)</span>}</div>
                <div className="text-xs text-emerald-100/50">
                  {p.outOfChips ? '已破产' : p.isAllIn ? 'All-in 后' : '在场'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-amber-200">${p.stack.toLocaleString()}</div>
                <div className="text-[10px] text-emerald-100/40">
                  {p.stack >= state.config.startingStack ? '+' : ''}
                  ${(p.stack - state.config.startingStack).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onExit} className="flex-1 py-2.5 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10">回大厅</button>
          <button onClick={onRestart} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-semibold">再来一局</button>
        </div>
      </div>
    </div>
  );
}
