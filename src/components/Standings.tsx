/**
 * Standings —— 本房间积分盈亏排行（参考主流德扑客户端结算面板布局）
 *
 * 列：序号 | 用户(头像+昵称+ID) | 局数 | 买入 | 最终 | 分数
 * 排序：分数（净盈亏）降序
 */
import type { Player } from '@/engine/types';

interface StandingsProps {
  players: Player[];
  myAccountId: string;
  onClose: () => void;
}

function formatK(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  if (abs >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

export default function Standings({ players, myAccountId, onClose }: StandingsProps) {
  const rows = players
    .filter((p) => p.accountId)
    .map((p) => {
      const buyIn = p.totalBuyIn || 0;
      const stack = p.stack || 0;
      const pnl = stack - buyIn;
      const hands = p.handsPlayed || 0;
      return { p, buyIn, stack, pnl, hands };
    })
    .sort((a, b) => b.pnl - a.pnl);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center backdrop-blur-md bg-black/70"
      onClick={onClose}
    >
      <div
        className="rounded-2xl w-[760px] max-w-[94vw] max-h-[88vh] flex flex-col shadow-[0_20px_60px_rgba(0,0,0,0.8)]"
        style={{
          background: 'linear-gradient(180deg, #0a1626 0%, #03080f 100%)',
          border: '1px solid rgba(120, 80, 200, 0.35)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div>
            <div className="text-[10px] tracking-[3px] text-purple-300/70">STANDINGS</div>
            <div className="text-lg font-semibold">本房间积分排行</div>
          </div>
          <button onClick={onClose} className="text-emerald-100/50 hover:text-white text-2xl leading-none w-7 h-7 flex items-center justify-center">×</button>
        </div>

        {/* 表头 */}
        <div className="grid grid-cols-[64px_1fr_88px_88px_104px_120px] gap-3 items-center px-5 py-2 text-[12px] tracking-[2px] text-purple-200/70 border-b border-white/5">
          <div className="text-center">#</div>
          <div>用户</div>
          <div className="text-right">局数</div>
          <div className="text-right">买入</div>
          <div className="text-right">最终</div>
          <div className="text-right">分数</div>
        </div>

        {/* 列表 */}
        <div className="overflow-auto flex-1 py-2">
          {rows.length === 0 ? (
            <div className="text-center text-emerald-100/40 py-12">暂无数据</div>
          ) : (
            rows.map((row, i) => {
              const isMe = row.p.accountId === myAccountId;
              const positive = row.pnl > 0;
              const negative = row.pnl < 0;
              const isAI = row.p.isAI;
              const rank = i + 1;
              return (
                <div
                  key={row.p.seatIdx}
                  className="grid grid-cols-[64px_1fr_88px_88px_104px_120px] gap-3 items-center px-5 py-3 mx-2 my-1 rounded-xl"
                  style={{
                    background: isMe
                      ? 'linear-gradient(90deg, rgba(120,80,200,0.35), rgba(120,80,200,0.15))'
                      : 'rgba(255,255,255,0.02)',
                    border: isMe ? '1.5px solid #a78bfa' : '1px solid rgba(255,255,255,0.04)',
                    boxShadow: isMe ? '0 0 16px rgba(167,139,250,0.25)' : 'none',
                  }}
                >
                  {/* 排名 */}
                  <div className="flex items-center justify-center">
                    {rank === 1 ? (
                      <div className="text-[28px]" title="冠军">🏆</div>
                    ) : rank === 2 ? (
                      <RankBadge n={2} color="#c0c8d4" />
                    ) : rank === 3 ? (
                      <RankBadge n={3} color="#d49b6a" />
                    ) : (
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-[15px] font-bold text-emerald-100/40 border border-white/10">
                        {rank}
                      </div>
                    )}
                  </div>

                  {/* 用户：头像 + 昵称(ID) */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-[15px] font-semibold flex-shrink-0 border-2"
                      style={{
                        background: `linear-gradient(135deg, ${row.p.colorPair[0]}, ${row.p.colorPair[1]})`,
                        borderColor: isMe ? '#a78bfa' : 'rgba(255,255,255,0.12)',
                      }}
                    >
                      {row.p.avatar?.startsWith('data:')
                        ? <img src={row.p.avatar} className="w-full h-full object-cover rounded-full" alt="" />
                        : row.p.name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold truncate flex items-center gap-2">
                        {row.p.name}
                        {isMe && <span className="text-[10px] text-purple-300 font-normal">· 你</span>}
                        {isAI && <span className="text-[9px] text-emerald-100/40 px-1 py-0.5 rounded border border-white/10">AI</span>}
                      </div>
                      <div className="text-[11px] text-emerald-100/40 truncate">
                        ({row.p.accountId})
                        {row.p.hasLeft && <span className="ml-2 text-amber-300/70">中途离场</span>}
                        {row.p.outOfChips && <span className="ml-2 text-red-300/70">已破产</span>}
                      </div>
                    </div>
                  </div>

                  {/* 局数 */}
                  <div className="text-right text-[20px] font-bold tabular-nums text-purple-200">
                    {row.hands}
                  </div>

                  {/* 买入 */}
                  <div className="text-right text-[18px] font-semibold tabular-nums text-purple-200">
                    {formatK(row.buyIn)}
                  </div>

                  {/* 最终 */}
                  <div className="text-right text-[20px] font-bold tabular-nums text-white">
                    {row.stack.toLocaleString()}
                  </div>

                  {/* 分数 */}
                  <div
                    className="text-right text-[22px] font-extrabold tabular-nums"
                    style={{
                      color: positive ? '#34d399' : negative ? '#f87171' : '#9ca3af',
                    }}
                  >
                    {positive ? '+' : ''}{row.pnl.toLocaleString()}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-6 py-3 border-t border-white/5 text-[10px] text-emerald-100/40 text-center">
          分数 = 最终 − 买入 · 买入 = 起始筹码 + 累计补码
        </div>
      </div>
    </div>
  );
}

function RankBadge({ n, color }: { n: number; color: string }) {
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-[15px] font-bold"
      style={{
        background: `linear-gradient(135deg, ${color}33, ${color}11)`,
        border: `1.5px solid ${color}`,
        color,
        boxShadow: `0 0 8px ${color}55`,
      }}
    >
      {n}
    </div>
  );
}
