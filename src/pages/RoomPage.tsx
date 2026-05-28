import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Hand } from 'pokersolver';
import { useAuthStore } from '@/auth/store';
import { useRoomStore } from '@/room/store';
import { LocalAdapter, buildPlayers } from '@/adapter/local';
import { SocketAdapter } from '@/adapter/socket';
import type { IAdapter, ConnectionStatus } from '@/adapter/types';
import type { GameState } from '@/engine/types';
import { getToCall, getMinRaiseTo } from '@/engine/engine';
import { audioBus } from '@/audio/bus';
import Seat from '@/components/Seat';
import PlayingCard from '@/components/PlayingCard';
import BestHand from '@/components/BestHand';
import BetPanel, { ActionScenario } from '@/components/BetPanel';
import { getSeatPosition, getBetChipPosition, getDealerPosition } from '@/components/seatPositions';
import Leaderboard from '@/components/Leaderboard';

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user)!;
  const getRoom = useRoomStore((s) => s.getRoom);
  const navigate = useNavigate();
  const room = id ? getRoom(id) : undefined;

  const adapterRef = useRef<IAdapter | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [muted, setMuted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [rebuyOffered, setRebuyOffered] = useState(false);
  const [showToast, setShowToast] = useState<string | null>(null);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('open');
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // 初始化 adapter
  useEffect(() => {
    if (!room) {
      navigate('/');
      return;
    }

    let adapter: IAdapter;

    if (room.mode === 'online') {
      // 联机：连 PartyKit
      const host = (import.meta as any).env?.VITE_PARTYKIT_HOST || 'localhost:1999';
      const sa = new SocketAdapter({
        host,
        roomCode: room.id,
        user: { id: user.id, name: user.name, avatar: user.avatar, colorPair: user.colorPair },
        config: room.isHost ? room.config : undefined,
        soundCb: (e) => audioBus.play(e as any),
      });
      sa.onStatusChange(setConnStatus);
      sa.onError(setErrMsg);
      adapter = sa;
    } else {
      // 本地：纯前端引擎 + AI
      const players = buildPlayers(room.config!, {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        colorPair: user.colorPair,
      });
      const la = new LocalAdapter(players, room.config!, (e) => audioBus.play(e as any));
      adapter = la;
      // 自动开第一手（联机模式由服务端驱动）
      setTimeout(() => la.startHand(), 600);
    }

    adapterRef.current = adapter;
    const unsub = adapter.subscribe(setState);
    setSecondsLeft((room.config?.durationMin ?? 60) * 60);

    return () => { unsub(); adapter.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 倒计时
  useEffect(() => {
    if (!state) return;
    if (showLeaderboard) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [state, showLeaderboard]);

  // 限时到了：标记本手打完结束
  useEffect(() => {
    if (secondsLeft === 0 && state && !state.endingAfterHand && !state.finished) {
      // 用一个 setState 拷贝 state，挂上 endingAfterHand
      const a = adapterRef.current;
      if (a) {
        const cur = a.getState();
        // 简单做法：直接 mutate 不会触发，但这里就此一例外
        (cur as any).endingAfterHand = true;
        setState({ ...cur });
      }
    }
  }, [secondsLeft, state]);

  // 监听摊牌完成 → 开下一手 或 结束
  useEffect(() => {
    if (!state) return;
    if (state.street === 'showdown' && state.winners) {
      // 结算展示时间：单赢家 4s / 多赢家(摊牌) 5s
      const isMultiwayShowdown = state.players.filter((p) => !p.hasFolded).length > 1;
      const showcaseDuration = isMultiwayShowdown ? 5000 : 4000;
      const t = setTimeout(() => {
        if (state.endingAfterHand) {
          setShowLeaderboard(true);
        } else {
          // 自动开下一手（如果 hero 没破产或已补码）
          const me = state.players[adapterRef.current?.mySeatIdx ?? 0];
          if (me.outOfChips && me.rebuysLeft > 0) {
            setRebuyOffered(true);
          } else {
            adapterRef.current?.startHand();
          }
        }
      }, showcaseDuration);
      return () => clearTimeout(t);
    }
  }, [state]);

  // 静音切换
  useEffect(() => { audioBus.setMuted(muted); }, [muted]);

  // showdown 时计算每个未弃牌玩家的牌型描述（用于头像下方大字）
  // 必须在任何早期 return 之前，遵守 React Hooks 规则
  const handLabels = useMemo(() => {
    if (!state || state.street !== 'showdown') return {} as Record<number, string>;
    const labels: Record<number, string> = {};
    for (const p of state.players) {
      if (p.hasFolded || p.holeCards.length < 2) continue;
      try {
        const all = [...p.holeCards, ...state.community].map((c) => `${c.rank}${c.suit}`);
        if (all.length < 5) continue;
        const hand = (Hand as any).solve(all);
        const name: string = hand.name || '';
        labels[p.seatIdx] = name.toUpperCase();
      } catch { /* ignore */ }
    }
    return labels;
  }, [state]);

  const winnerSet = useMemo(() => {
    return new Set((state?.winners || []).map((w) => w.seatIdx));
  }, [state?.winners]);

  if (!room || !state) return <div className="h-full w-full flex items-center justify-center text-emerald-100/50">加载中...</div>;

  const mySeatIdx = adapterRef.current?.mySeatIdx ?? 0;
  const hero = state.players[mySeatIdx];
  const pot = state.pots.reduce((a, p) => a + p.amount, 0)
    + state.players.reduce((a, p) => a + p.betThisRound, 0);
  const myToCall = getToCall(state, mySeatIdx);

  const myScenario: ActionScenario = (() => {
    if (state.toActSeat !== mySeatIdx || state.street === 'showdown' || state.street === 'idle') return 'wait';
    if (myToCall === 0) return 'check';
    if (myToCall >= hero.stack) return 'allin';
    return 'call';
  })();

  const minRaiseTo = getMinRaiseTo(state, mySeatIdx);

  return (
    <div className="h-full w-full flex flex-col">
      {/* 顶栏 */}
      <header className="fixed top-0 left-0 right-0 h-14 px-6 flex items-center justify-between z-50" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.5), rgba(0,0,0,0))' }}>
        <div className="flex gap-3 items-center">
          <div className="font-cinzel tracking-[4px] text-emerald-100/90 text-base">POKER NIGHT</div>
          <button onClick={() => navigate('/')} className="pill">大厅</button>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <div className="text-sm">{(state.config?.name || room.config?.name || '房间')} · 第 {state.handNumber} 手</div>
          <div className="w-7 h-0.5 bg-emerald-500 rounded"></div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`pill ${secondsLeft < 60 ? 'text-red-300 border-red-500/50' : ''}`}>
            ⏱ {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
          </div>
          {room.mode === 'online' && (
            <div
              className="pill flex items-center gap-1.5"
              style={{
                color: connStatus === 'open' ? '#10b981' : connStatus === 'reconnecting' ? '#f4d97a' : '#ff8585',
                borderColor: connStatus === 'open' ? 'rgba(16,185,129,0.4)' : connStatus === 'reconnecting' ? 'rgba(244,217,122,0.4)' : 'rgba(255,133,133,0.4)',
              }}
              title={`房间码 ${room.id}（点击复制）`}
              onClick={() => {
                navigator.clipboard?.writeText(`${location.origin}/room/${room.id}`);
                setShowToast('房间链接已复制');
                setTimeout(() => setShowToast(null), 2000);
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: connStatus === 'open' ? '#10b981' : connStatus === 'reconnecting' ? '#f4d97a' : '#ff8585' }} />
              {connStatus === 'open' ? room.id : connStatus === 'reconnecting' ? '重连中' : '未连接'}
            </div>
          )}
          <div className="bg-white/[0.06] border border-white/10 rounded-full px-3.5 py-1.5 text-[13px]">
            ${hero.stack.toLocaleString()}
          </div>
          <button onClick={() => setMuted((m) => !m)} className="pill">{muted ? '🔇' : '🔊'}</button>
        </div>
      </header>

      {/* 牌桌舞台 */}
      <div className="flex-1 flex items-center justify-center pt-12">
        <div className="relative" style={{ width: 'min(1200px, 94vw)', height: 'min(680px, 80vh)' }}>
          {/* 桌面分层 */}
          <div className="absolute" style={{ inset: '6% 4% -2% 4%', borderRadius: 9999, background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.7), rgba(0,0,0,0.3) 50%, transparent 75%)', filter: 'blur(20px)' }}></div>
          <div className="absolute rail-bg" style={{ inset: '6% 5%', borderRadius: 9999 }}></div>
          <div className="absolute rail-highlight-bg pointer-events-none" style={{ inset: 'calc(6% + 2px) calc(5% + 2px)', borderRadius: 9999 }}></div>
          <div className="absolute rail-inner-edge" style={{ inset: 'calc(6% + 22px) calc(5% + 22px)', borderRadius: 9999 }}></div>
          <div className="absolute felt-bg overflow-hidden" style={{ inset: 'calc(6% + 24px) calc(5% + 24px)', borderRadius: 9999 }}></div>
          <div className="absolute felt-glow-outer pointer-events-none" style={{ inset: 'calc(6% + 30px) calc(5% + 30px)', borderRadius: 9999 }}></div>
          <div className="absolute felt-glow-inner pointer-events-none" style={{ inset: 'calc(6% + 50px) calc(5% + 50px)', borderRadius: 9999 }}></div>

          {/* 中心：底池 */}
          <div className="absolute pointer-events-none text-center" style={{ top: '30%', left: '50%', transform: 'translate(-50%, -50%)' }}>
            <div className="text-[10px] tracking-[3px] text-emerald-100/60 mb-0.5">POT TOTAL</div>
            <div className="text-[20px] font-semibold text-white/95 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">${pot.toLocaleString()}</div>
          </div>

          {/* 公共牌 */}
          <div className="absolute flex gap-2.5" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
            {[0, 1, 2, 3, 4].map((i) => {
              const card = state.community[i];
              if (!card) return <PlayingCard key={i} faceDown />;
              return <PlayingCard key={i} card={card} glow />;
            })}
          </div>

          {/* Dealer button */}
          {state.buttonSeat >= 0 && (() => {
            const pos = getDealerPosition(state.buttonSeat);
            return (
              <div
                className="absolute w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-gray-900 z-[5]"
                style={{
                  left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)',
                  background: 'radial-gradient(circle at 35% 30%, #fff, #d8d8d8 60%, #888)',
                  boxShadow: '0 3px 6px rgba(0,0,0,0.6), inset 0 -2px 3px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.8)',
                }}
              >D</div>
            );
          })()}

          {/* 玩家位 */}
          {state.players.map((p) => {
            const pos = getSeatPosition(p.seatIdx);
            const isEmpty = !p.accountId || p.isSittingOut;
            return (
              <Seat
                key={p.seatIdx}
                player={isEmpty ? undefined : p}
                isEmpty={isEmpty}
                active={state.toActSeat === p.seatIdx}
                showCards={!p.isHero && p.holeCards.length > 0 && (
                  // 还在牌局中（未弃牌）→ 显示牌背
                  (!p.hasFolded && state.street !== 'showdown')
                  // 摊牌或主动 reveal → 翻面显示真牌
                  || p.revealCards
                )}
                revealCards={!p.isHero && p.revealCards && state.street === 'showdown'}
                isWinner={state.street === 'showdown' && winnerSet.has(p.seatIdx)}
                handLabel={state.street === 'showdown' && !p.hasFolded ? handLabels[p.seatIdx] : undefined}
                position={pos}
              />
            );
          })}

          {/* Bet 筹码胶囊（包括 hero 自己的） */}
          {state.players.map((p) => {
            if (!p.betThisRound) return null;
            const pos = getBetChipPosition(p.seatIdx);
            return (
              <div
                key={`bet-${p.seatIdx}`}
                className="absolute z-[7] flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={{
                  left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)',
                  background: 'rgba(8,18,14,0.92)',
                  border: '1px solid rgba(212,175,55,0.55)',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.6)',
                }}
              >
                <div className="w-5 h-5 rounded-full" style={{
                  background: 'radial-gradient(circle at 35% 30%, #ff7a7a, #c41e1e 60%, #7a0e0e)',
                  border: '2px dashed #fff',
                }}></div>
                <div className="text-[11px] font-bold text-amber-200">${p.betThisRound.toLocaleString()}</div>
              </div>
            );
          })}

          {/* Hero 手牌：fold 后保留显示（灰阶+半透明），到下一手才清除 */}
          {hero.holeCards.length === 2 && (
            <div
              className="absolute flex z-[6]"
              style={{
                bottom: '14%',
                left: '50%',
                transform: 'translateX(-50%)',
                opacity: hero.hasFolded && !hero.revealCards ? 0.35 : 1,
                filter: hero.hasFolded && !hero.revealCards ? 'grayscale(0.9)' : 'none',
                transition: 'opacity 0.3s, filter 0.3s',
              }}
            >
              <div
                className="relative flex"
                style={{
                  filter: hero.revealCards
                    ? 'drop-shadow(0 0 14px rgba(212,175,55,0.85)) drop-shadow(0 0 4px rgba(255,215,128,0.6))'
                    : 'none',
                  transition: 'filter 0.4s',
                }}
              >
                <PlayingCard card={hero.holeCards[0]} rotate={-7} />
                <PlayingCard card={hero.holeCards[1]} rotate={7} />
                {hero.revealCards && (
                  <div
                    className="absolute left-1/2 -top-7 -translate-x-1/2 px-2.5 py-0.5 rounded text-[10px] font-extrabold tracking-[2px] whitespace-nowrap"
                    style={{
                      background: 'linear-gradient(180deg, #f4d97a, #d4af37)',
                      color: '#1a1a1a',
                      border: '1.5px solid #fff',
                      boxShadow: '0 0 12px rgba(212,175,55,0.8)',
                      animation: 'winnerBanner 0.4s ease-out',
                    }}
                  >
                    REVEALED
                  </div>
                )}
              </div>
              {hero.hasFolded && !hero.revealCards && (
                <div
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-2.5 py-1 rounded text-[11px] font-bold tracking-widest"
                  style={{
                    background: 'rgba(0,0,0,0.85)',
                    color: '#ff8585',
                    border: '1px solid #d83a3a',
                    boxShadow: '0 0 8px rgba(216,58,58,0.5)',
                  }}
                >
                  FOLDED
                </div>
              )}
            </div>
          )}

          {/* 秀牌切换按钮（永远显示，方便随时切；位置紧贴手牌右侧） */}
          {!hero.isSittingOut && (
            <button
              onClick={() => {
                adapterRef.current?.toggleShowCards();
                const next = !hero.showCardsEnabled;
                setShowToast(next ? '已开启秀牌：本手结束时会展示你的手牌' : '已关闭秀牌：手牌将保持隐藏');
                setTimeout(() => setShowToast(null), 2500);
              }}
              className="absolute z-[7] flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all"
              style={{
                bottom: '16%', right: '24%',
                background: hero.showCardsEnabled ? 'rgba(16,185,129,0.18)' : 'rgba(20,20,20,0.7)',
                border: `1.5px solid ${hero.showCardsEnabled ? '#10b981' : 'rgba(255,255,255,0.15)'}`,
                boxShadow: hero.showCardsEnabled
                  ? '0 0 16px rgba(16,185,129,0.5), 0 4px 10px rgba(0,0,0,0.5)'
                  : '0 4px 10px rgba(0,0,0,0.5)',
                color: hero.showCardsEnabled ? '#10b981' : '#9fdcc2',
              }}
              title={hero.showCardsEnabled ? '点击关闭：手牌将隐藏' : '点击开启：本手结束时展示手牌'}
            >
              {hero.showCardsEnabled ? (
                /* 睁眼图标 */
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              ) : (
                /* 闭眼图标 */
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-7-10-7a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              )}
              <span className="text-[9px] font-semibold tracking-widest leading-none">
                {hero.showCardsEnabled ? '秀牌' : '藏牌'}
              </span>
            </button>
          )}

          {/* 摊牌特效层 */}
          {state.street === 'showdown' && state.winners && (
            <>
              {/* 桌中心辐射光（一次性脉冲） */}
              <div
                key={`burst-${state.handNumber}`}
                className="absolute pointer-events-none z-[2]"
                style={{
                  left: '50%', top: '50%',
                  width: 600, height: 600,
                  transform: 'translate(-50%, -50%)',
                  background: 'conic-gradient(from 0deg, rgba(255,235,180,0.0), rgba(255,235,180,0.55), rgba(255,235,180,0.0), rgba(255,235,180,0.55), rgba(255,235,180,0.0), rgba(255,235,180,0.55), rgba(255,235,180,0.0))',
                  borderRadius: '50%',
                  filter: 'blur(12px)',
                  animation: 'showdownBurst 1.1s ease-out forwards',
                }}
              />
              {/* 桌中心柔和外圈光 */}
              <div
                key={`halo-${state.handNumber}`}
                className="absolute pointer-events-none z-[2]"
                style={{
                  left: '50%', top: '50%',
                  width: 360, height: 360,
                  transform: 'translate(-50%, -50%)',
                  background: 'radial-gradient(circle, rgba(212,175,55,0.45) 0%, rgba(212,175,55,0.18) 40%, transparent 70%)',
                  borderRadius: '50%',
                  animation: 'showdownBurst 1.1s ease-out forwards',
                }}
              />

              {/* 升级版筹码飞行：从底池炸开旋转飞向每个胜者 */}
              {state.winners.flatMap((w, wi) => {
                const target = getSeatPosition(w.seatIdx);
                // 每个胜者飞 3 颗筹码，错峰发射
                return [0, 1, 2].map((k) => (
                  <div
                    key={`fly-${w.seatIdx}-${k}`}
                    className="absolute pointer-events-none z-[9]"
                    style={{
                      left: '50%', top: '46%',
                      width: 26, height: 26,
                      transform: 'translate(-50%, -50%)',
                      animation: `chipBurst 1.3s cubic-bezier(0.5, 0.0, 0.6, 1.0) ${0.15 + wi * 0.18 + k * 0.08}s forwards`,
                      ['--tx' as any]: `${(target.x - 50) + (k - 1) * 1.5}%`,
                      ['--ty' as any]: `${(target.y - 46) + (k - 1) * 1}%`,
                    } as React.CSSProperties}
                  >
                    <div
                      className="w-full h-full rounded-full"
                      style={{
                        background: 'radial-gradient(circle at 35% 30%, #ffe39a, #d4af37 60%, #8a6f1a)',
                        border: '2.5px dashed #fff',
                        boxShadow: '0 0 14px rgba(212,175,55,0.95), 0 3px 6px rgba(0,0,0,0.5)',
                      }}
                    />
                  </div>
                ));
              })}

              {/* 顶部克制式胜者条（极简） */}
              <div
                className="absolute pointer-events-none z-[10] flex flex-col items-center gap-1"
                style={{ top: '12%', left: '50%', transform: 'translateX(-50%)', animation: 'winnerBanner 0.4s ease-out' }}
              >
                {state.winners.map((w) => {
                  const p = state.players[w.seatIdx];
                  return (
                    <div
                      key={w.seatIdx}
                      className="px-3.5 py-1 rounded-full text-[12px] font-semibold whitespace-nowrap"
                      style={{
                        background: 'rgba(8,18,14,0.85)',
                        border: '1px solid rgba(212,175,55,0.6)',
                        color: '#f4d97a',
                        boxShadow: '0 0 12px rgba(212,175,55,0.4)',
                      }}
                    >
                      {p.name} 赢得 <span className="text-white font-bold">${w.amount.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 当前最佳牌型（实时） */}
      {hero.holeCards.length === 2 && !hero.hasFolded && (
        <BestHand holeCards={hero.holeCards} community={state.community} />
      )}

      {/* 底部行动区 */}
      <div className="fixed bottom-0 left-0 right-0 z-40 px-6 py-4" style={{ background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0.85))' }}>
        <BetPanel
          scenario={myScenario}
          toCall={myToCall}
          myStack={hero.stack}
          pot={pot}
          minBet={myScenario === 'check' ? state.config.bigBlind : minRaiseTo}
          maxBet={hero.stack + hero.betThisRound}
          step={state.config.step}
          bigBlind={state.config.bigBlind}
          onFold={() => adapterRef.current?.hero('fold')}
          onCheck={() => adapterRef.current?.hero('check')}
          onCall={() => adapterRef.current?.hero('call')}
          onBet={(amt) => adapterRef.current?.hero(myScenario === 'check' ? 'bet' : 'raise', amt)}
          onAllIn={() => adapterRef.current?.hero('allin')}
        />
      </div>

      {/* 秀牌开关 toast */}
      {showToast && (
        <div
          className="fixed top-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm z-[60] backdrop-blur-md"
          style={{
            background: 'rgba(8,18,14,0.92)',
            border: '1px solid rgba(16,185,129,0.5)',
            boxShadow: '0 4px 16px rgba(16,185,129,0.3)',
            animation: 'winnerBanner 0.3s ease-out',
          }}
        >
          {showToast}
        </div>
      )}

      {/* 限时到提示 */}
      {state.endingAfterHand && !showLeaderboard && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 bg-amber-900/80 border border-amber-400 rounded-lg px-4 py-2 text-sm z-50">
          ⏰ 限时已到，本手结束后结算
        </div>
      )}

      {/* 补码弹窗 */}
      {rebuyOffered && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]">
          <div className="bg-black/80 border border-emerald-500 rounded-2xl p-6 w-[360px] backdrop-blur-md">
            <h3 className="text-lg font-semibold mb-2">筹码用完了</h3>
            <p className="text-sm text-emerald-100/70 mb-4">补 ${(state.config?.rebuyAmount ?? 0).toLocaleString()} 继续？剩余补码次数：{hero.rebuysLeft}</p>
            <div className="flex gap-3">
              <button
                onClick={() => { adapterRef.current?.rebuy(); setRebuyOffered(false); adapterRef.current?.startHand(); }}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 py-2 rounded font-semibold"
              >补码</button>
              <button
                onClick={() => { setRebuyOffered(false); setShowLeaderboard(true); }}
                className="flex-1 bg-red-700 hover:bg-red-600 py-2 rounded font-semibold"
              >离场</button>
            </div>
          </div>
        </div>
      )}

      {/* 积分榜 */}
      {showLeaderboard && (
        <Leaderboard
          state={state}
          onRestart={() => { setShowLeaderboard(false); navigate('/'); }}
          onExit={() => navigate('/')}
        />
      )}
    </div>
  );
}
