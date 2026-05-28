import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Hand } from 'pokersolver';
import { useAuthStore } from '@/auth/store';
import { useRoomStore } from '@/room/store';
import { LocalAdapter, buildPlayers } from '@/adapter/local';
import { SocketAdapter } from '@/adapter/socket';
import type { IAdapter, ConnectionStatus } from '@/adapter/types';
import type { GameState, RunItCount } from '@/engine/types';
import { getToCall, getMinRaiseTo } from '@/engine/engine';
import { audioBus } from '@/audio/bus';
import Seat from '@/components/Seat';
import PlayingCard from '@/components/PlayingCard';
import BestHand from '@/components/BestHand';
import BetPanel, { ActionScenario } from '@/components/BetPanel';
import { getSeatPosition, getBetChipPosition, getDealerPosition } from '@/components/seatPositions';
import Leaderboard from '@/components/Leaderboard';
import Standings from '@/components/Standings';

function MenuItem({ children, onClick, danger }: { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${danger ? 'text-red-300 hover:bg-red-500/10' : 'text-emerald-100/80 hover:bg-emerald-500/10'}`}
    >
      {children}
    </button>
  );
}

const STREET_SETTLE_DELAY_MS = 780;

type SettleView = {
  handNumber: number;
  community: GameState['community'];
  bets: { seatIdx: number; amount: number }[];
  token: string;
};

type ReactionView = { id: string; ts: number };
type TomatoView = { fromSeatIdx: number; ts: number };
type TomatoThrow = { id: string; fromSeatIdx: number; targetSeatIdx: number };

type ReactionMeta = { id: string; alt: string; code: string };

const REACTIONS: Record<string, ReactionMeta> = {
  wink: { id: 'wink', alt: '😉', code: '1f609' },
  angry: { id: 'angry', alt: '😡', code: '1f621' },
  shake: { id: 'shake', alt: '🙂', code: '1f642_200d_2194_fe0f' },
  party: { id: 'party', alt: '🥳', code: '1f973' },
};
const QUICK_REACTIONS = [REACTIONS.wink, REACTIONS.angry, REACTIONS.shake, REACTIONS.party];
const TOMATO = { id: 'tomato', alt: '🍅', code: '1f345' };
const reactionWebp = (code: string) => `https://fonts.gstatic.com/s/e/notoemoji/latest/${code}/512.webp`;
const reactionGif = (code: string) => `https://fonts.gstatic.com/s/e/notoemoji/latest/${code}/512.gif`;

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user)!;
  const getRoom = useRoomStore((s) => s.getRoom);
  const joinOnlineRoom = useRoomStore((s) => s.joinOnlineRoom);
  const navigate = useNavigate();
  const room = id ? getRoom(id) : undefined;

  const adapterRef = useRef<IAdapter | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [muted, setMuted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showToast, setShowToast] = useState<string | null>(null);
  const [showStandings, setShowStandings] = useState(false);
  const [showRoomMenu, setShowRoomMenu] = useState(false);
  const [activeRunIndex, setActiveRunIndex] = useState<number | null>(null);
  const [activeRunRevealCount, setActiveRunRevealCount] = useState(5);
  const [activeRunPayoutReady, setActiveRunPayoutReady] = useState(false);
  const [payoutCycle, setPayoutCycle] = useState(0);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('open');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [settleView, setSettleView] = useState<SettleView | null>(null);
  const [seatReactions, setSeatReactions] = useState<Record<number, ReactionView>>({});
  const [seatTomatoes, setSeatTomatoes] = useState<Record<number, TomatoView>>({});
  const [tomatoThrows, setTomatoThrows] = useState<TomatoThrow[]>([]);
  const [tomatoTargeting, setTomatoTargeting] = useState(false);
  const prevGameStateRef = useRef<GameState | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const reactionTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const tomatoTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const tomatoThrowTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isStreetSettling = !!settleView && state?.handNumber === settleView.handNumber;

  // 初始化 adapter
  useEffect(() => {
    if (!room) {
      // 已登录用户直接打开 6 位数字房间链接：默认按在线房间加入，不再踢回大厅
      if (id && /^\d{6}$/.test(id)) {
        joinOnlineRoom(id, user.id);
        return;
      }
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
    const unsubReaction = adapter.onReaction?.((seatIdx, reactionId) => {
      const ts = Date.now();
      setSeatReactions((cur) => ({ ...cur, [seatIdx]: { id: reactionId, ts } }));
      if (reactionTimersRef.current[seatIdx]) clearTimeout(reactionTimersRef.current[seatIdx]);
      reactionTimersRef.current[seatIdx] = setTimeout(() => {
        setSeatReactions((cur) => {
          if (cur[seatIdx]?.ts !== ts) return cur;
          const next = { ...cur };
          delete next[seatIdx];
          return next;
        });
        delete reactionTimersRef.current[seatIdx];
      }, 1900);
    }) || (() => {});
    const unsubTomato = adapter.onTomato?.((fromSeatIdx, targetSeatIdx) => {
      const ts = Date.now();
      const throwId = `${fromSeatIdx}-${targetSeatIdx}-${ts}`;
      setTomatoThrows((cur) => [...cur, { id: throwId, fromSeatIdx, targetSeatIdx }]);

      const hitTimer = setTimeout(() => {
        setSeatTomatoes((cur) => ({ ...cur, [targetSeatIdx]: { fromSeatIdx, ts } }));
        if (tomatoTimersRef.current[targetSeatIdx]) clearTimeout(tomatoTimersRef.current[targetSeatIdx]);
        tomatoTimersRef.current[targetSeatIdx] = setTimeout(() => {
          setSeatTomatoes((cur) => {
            if (cur[targetSeatIdx]?.ts !== ts) return cur;
            const next = { ...cur };
            delete next[targetSeatIdx];
            return next;
          });
          delete tomatoTimersRef.current[targetSeatIdx];
        }, 1400);
      }, 760);

      const cleanupTimer = setTimeout(() => {
        setTomatoThrows((cur) => cur.filter((item) => item.id !== throwId));
      }, 900);
      tomatoThrowTimersRef.current.push(hitTimer, cleanupTimer);
    }) || (() => {});
    setSecondsLeft((room.config?.durationMin ?? 60) * 60);

    return () => { unsub(); unsubReaction(); unsubTomato(); adapter.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, room?.id]);

  // 倒计时：基于 gameStartedAt 时间戳算剩余，准备阶段（gameStartedAt 未设置）显示满时间
  useEffect(() => {
    if (!state) return;
    if (showLeaderboard) return;
    const total = (state.config?.durationMin ?? 60) * 60;
    const tick = () => {
      if (!state.gameStartedAt) {
        setSecondsLeft(total);
        return;
      }
      // paused 时也走时（暂停的代价是占用游戏时间，但避免有人卡着不开始）
      // 如果你想 paused 不走时，用 state.waitingToStart 提前 return
      const elapsed = Math.floor((Date.now() - state.gameStartedAt) / 1000);
      setSecondsLeft(Math.max(0, total - elapsed));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [state, showLeaderboard]);

  // 限时到了：标记本手打完结束
  useEffect(() => {
    if (secondsLeft === 0 && state && !state.endingAfterHand && !state.finished) {
      // 用一个 setState 拷贝 state，挂上 endingAfterHand
      const a = adapterRef.current;
      if (a) {
        const cur = a.getState();
        if (cur) {
          // 简单做法：直接 mutate 不会触发，但这里就此一例外
          (cur as any).endingAfterHand = true;
          setState({ ...cur });
        }
      }
    }
  }, [secondsLeft, state]);

  // 街道结束时先收筹码/停顿，再展示新公共牌或结算高亮
  useEffect(() => {
    if (!state) {
      prevGameStateRef.current = null;
      setSettleView(null);
      return;
    }

    const prev = prevGameStateRef.current;
    if (!prev) {
      prevGameStateRef.current = state;
      return;
    }

    const sameHand = prev.handNumber === state.handNumber;
    const gainedCommunityCards = sameHand && state.community.length > prev.community.length;
    const enteredShowdown = sameHand && state.street === 'showdown' && prev.street !== 'showdown';
    const enteredRunoutVoting = sameHand && state.street === 'runout-voting' && prev.street !== 'runout-voting';
    const shouldSettle = gainedCommunityCards || enteredShowdown || enteredRunoutVoting;

    if (shouldSettle) {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      soundTimersRef.current.forEach(clearTimeout);
      soundTimersRef.current = [];

      const token = `${state.handNumber}-${state.street}-${state.community.length}-${Date.now()}`;
      const bets = prev.players
        .filter((p) => p.betThisRound > 0)
        .map((p) => ({ seatIdx: p.seatIdx, amount: p.betThisRound }));
      const newCardCount = Math.max(0, state.community.length - prev.community.length);
      const shouldPlayWin = state.street === 'showdown' && !!state.winners;

      if (bets.length > 0) audioBus.play('collect' as any);
      setSettleView({
        handNumber: state.handNumber,
        community: [...prev.community],
        bets,
        token,
      });
      settleTimerRef.current = setTimeout(() => {
        setSettleView((cur) => (cur?.token === token ? null : cur));
        settleTimerRef.current = null;

        for (let i = 0; i < Math.min(newCardCount, 5); i++) {
          const t = setTimeout(() => audioBus.play('flip' as any), i * 90);
          soundTimersRef.current.push(t);
        }
        if (shouldPlayWin) {
          const t = setTimeout(() => audioBus.play('win' as any), newCardCount > 0 ? Math.min(newCardCount, 5) * 90 + 180 : 0);
          soundTimersRef.current.push(t);
        }
      }, STREET_SETTLE_DELAY_MS);
    } else if (!sameHand || state.street === 'preflop' || state.street === 'idle' || state.street === 'paused') {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      soundTimersRef.current.forEach(clearTimeout);
      soundTimersRef.current = [];
      settleTimerRef.current = null;
      setSettleView(null);
    }

    prevGameStateRef.current = state;
  }, [state]);

  useEffect(() => () => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    soundTimersRef.current.forEach(clearTimeout);
    soundTimersRef.current = [];
    Object.values(reactionTimersRef.current).forEach(clearTimeout);
    reactionTimersRef.current = {};
    Object.values(tomatoTimersRef.current).forEach(clearTimeout);
    tomatoTimersRef.current = {};
    tomatoThrowTimersRef.current.forEach(clearTimeout);
    tomatoThrowTimersRef.current = [];
  }, []);

  // 监听摊牌完成 → 本地模式驱动下一手 / 限时结束触发结算
  useEffect(() => {
    if (!state) return;
    if (state.street === 'showdown' && state.winners) {
      // 结算展示时间：单赢家 4s / 多赢家(摊牌) 5s；跑多次时按逐张翻牌节奏额外给结果展示时间
      const isMultiwayShowdown = state.players.filter((p) => !p.hasFolded).length > 1;
      const runCount = state.runIt?.status === 'complete' ? (state.runIt.runCount || 1) : 1;
      const remainingRunCards = Math.max(0, 5 - (state.runIt?.baseCommunity.length ?? state.community.length));
      const runExtra = runCount > 1 ? runCount * (remainingRunCards * 420 + 1100) : 0;
      const showcaseDuration = (isMultiwayShowdown ? 5000 : 4000) + runExtra;
      const t = setTimeout(() => {
        if (state.endingAfterHand) {
          setShowLeaderboard(true);
          return;
        }
        // 本地模式：自动开下一手（hero 即使破产也允许 startNewHand 推进，破产玩家不会被发牌，
        // 但 UI 上头像旁的"补码"按钮一直可点，玩家任意时机点击即可补码继续）。
        // 联机模式由 PartyKit 服务端驱动。
        if (room?.mode === 'local') {
          adapterRef.current?.startHand();
        }
      }, showcaseDuration);
      return () => clearTimeout(t);
    }
  }, [state]);

  // 结算收益动画：单次结算直接高亮赢家；跑马多次逐条 RUN、逐张公共牌翻开，再高亮赢家
  useEffect(() => {
    if (!state || state.street !== 'showdown' || !state.winners || isStreetSettling) {
      setActiveRunIndex(null);
      setActiveRunRevealCount(5);
      setActiveRunPayoutReady(false);
      return;
    }

    setPayoutCycle((n) => n + 1);
    const runCount = state.runIt?.status === 'complete' ? (state.runIt.runCount || 1) : 1;
    if (runCount <= 1) {
      setActiveRunIndex(null);
      setActiveRunRevealCount(5);
      setActiveRunPayoutReady(true);
      return;
    }

    const runs = state.runIt?.runs || [];
    const baseCount = state.runIt?.baseCommunity.length ?? 0;
    const remaining = Math.max(0, 5 - baseCount);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let cursor = 0;

    runs.forEach((run) => {
      timers.push(setTimeout(() => {
        setActiveRunIndex(run.index);
        setActiveRunRevealCount(baseCount);
        setActiveRunPayoutReady(false);
      }, cursor));

      for (let n = 1; n <= remaining; n++) {
        timers.push(setTimeout(() => {
          setActiveRunRevealCount(baseCount + n);
          audioBus.play('flip' as any);
        }, cursor + n * 420));
      }

      timers.push(setTimeout(() => {
        setActiveRunPayoutReady(true);
        setPayoutCycle((n) => n + 1);
        audioBus.play('win' as any);
      }, cursor + remaining * 420 + 260));

      cursor += remaining * 420 + 1300;
    });

    timers.push(setTimeout(() => {
      setActiveRunIndex(null);
      setActiveRunRevealCount(5);
      setActiveRunPayoutReady(false);
    }, cursor + 500));

    return () => timers.forEach(clearTimeout);
  }, [state?.handNumber, state?.street, state?.winners, state?.runIt, isStreetSettling]);

  // 静音切换
  useEffect(() => { audioBus.setMuted(muted); }, [muted]);

  // 二级菜单：点击菜单外部 / 按 Esc 自动关闭（移动端没有显式关闭键时也能退出）
  useEffect(() => {
    if (!showRoomMenu) return;
    const handleDocClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // 点到菜单本身或触发按钮 → 不关；点到其他位置 → 关
      if (target.closest('.room-menu-popover') || target.closest('.mobile-menu-trigger')) return;
      setShowRoomMenu(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowRoomMenu(false);
    };
    // 用 mousedown / touchstart：比 click 更早触发，避免被 React 合成事件抢先 toggle
    document.addEventListener('mousedown', handleDocClick);
    document.addEventListener('touchstart', handleDocClick, { passive: true });
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDocClick);
      document.removeEventListener('touchstart', handleDocClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [showRoomMenu]);

  // showdown 时计算每个未弃牌玩家的牌型描述（用于头像下方大字）
  // 必须在任何早期 return 之前，遵守 React Hooks 规则
  const handLabels = useMemo(() => {
    if (!state || state.street !== 'showdown' || isStreetSettling) return {} as Record<number, string>;
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
  }, [state, isStreetSettling]);

  if (!room) return <div className="h-full w-full flex items-center justify-center text-emerald-100/50">加载中...</div>;
  if (!state) {
    const isOnline = room.mode === 'online';
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-4 text-emerald-100/70 px-8">
        <div className="text-base">
          {isOnline
            ? (connStatus === 'connecting' ? '正在连接服务器...' :
               connStatus === 'reconnecting' ? '连接中断，正在重连...' :
               connStatus === 'open' ? '已连接，等待房间初始化...' :
               '未连接到服务器')
            : '正在初始化牌桌...'}
        </div>
        {isOnline && connStatus !== 'open' && (
          <div className="text-xs text-emerald-100/40 max-w-md text-center leading-relaxed bg-black/30 border border-amber-500/30 rounded-lg p-4">
            <div className="text-amber-300 font-semibold mb-1">联机服务器没起？</div>
            <div className="font-mono text-[11px]">npm run dev:all</div>
            <div className="mt-2 text-emerald-100/40">
              这条命令会同时启动前端 + PartyKit 服务端 (localhost:1999)。
              <br />
              如果你只跑了 <code className="font-mono">npm run dev</code>，请回终端补一条 <code className="font-mono">npm run party</code>。
            </div>
          </div>
        )}
        {errMsg && (
          <div className="text-red-400 text-xs">服务器错误：{errMsg}</div>
        )}
        <button onClick={() => navigate('/')} className="pill mt-2">返回大厅</button>
      </div>
    );
  }

  const mySeatIdx = adapterRef.current?.mySeatIdx ?? 0;
  const hero = state.players[mySeatIdx];
  const pot = state.pots.reduce((a, p) => a + p.amount, 0)
    + state.players.reduce((a, p) => a + p.betThisRound, 0);
  const communityCards = isStreetSettling ? settleView?.community ?? state.community : state.community;
  const showdownReady = state.street === 'showdown' && !isStreetSettling;
  const showRunItBoards = !isStreetSettling && state.runIt?.status === 'complete' && (state.runIt.runCount || 1) > 1;
  const myToCall = getToCall(state, mySeatIdx);

  const myScenario: ActionScenario = (() => {
    if (isStreetSettling || hero.holeCards.length !== 2 || state.toActSeat !== mySeatIdx || state.street === 'showdown' || state.street === 'idle' || state.street === 'runout-voting') return 'wait';
    if (myToCall === 0) return 'check';
    if (myToCall >= hero.stack) return 'allin';
    return 'call';
  })();

  const minRaiseTo = getMinRaiseTo(state, mySeatIdx);
  const activePayouts = (() => {
    if (!showdownReady) return [] as { seatIdx: number; amount: number }[];
    if (state.runIt?.status === 'complete' && (state.runIt.runCount || 1) > 1) {
      const activeRun = activeRunIndex && activeRunPayoutReady ? state.runIt.runs.find((run) => run.index === activeRunIndex) : null;
      return activeRun?.winners || [];
    }
    return state.winners || [];
  })();

  const copyRoomLink = () => {
    navigator.clipboard?.writeText(`${location.origin}/room/${room.id}`);
    setShowToast('房间链接已复制');
    setTimeout(() => setShowToast(null), 2000);
  };

  const exitRoom = () => {
    const tip = room.mode === 'online'
      ? '确定退出房间？\n联机模式下退出后筹码会丢失（保留到本手结算后再清算积分）。'
      : '确定退出房间？';
    if (!confirm(tip)) return;
    try { adapterRef.current?.leave?.(); } catch { /* ignore */ }
    useRoomStore.getState().leaveActiveRoom();
    navigate('/');
  };

  const reactionsDisabled = myScenario !== 'wait';
  const sendQuickReaction = (reactionId: string) => {
    if (reactionsDisabled) return;
    setTomatoTargeting(false);
    adapterRef.current?.sendReaction?.(reactionId);
  };
  const toggleTomatoTargeting = () => {
    if (reactionsDisabled) return;
    setTomatoTargeting((v) => !v);
  };
  const sendTomatoTo = (targetSeatIdx: number) => {
    if (reactionsDisabled || targetSeatIdx === mySeatIdx) return;
    adapterRef.current?.sendTomato?.(targetSeatIdx);
    setTomatoTargeting(false);
  };

  return (
    <div className="room-root h-full w-full flex flex-col">
      {/* 顶栏 */}
      <header className="room-header fixed top-0 left-0 right-0 h-14 px-6 flex items-center justify-between z-50" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.5), rgba(0,0,0,0))' }}>
        <div className="header-left flex gap-3 items-center">
          <div className="font-cinzel tracking-[4px] text-emerald-100/90 text-base">POKER NIGHT</div>
          <div className="desktop-actions flex gap-3 items-center">
            <button onClick={exitRoom} className="pill" title="退出房间">退出房间</button>
            <button onClick={() => setShowStandings(true)} className="pill" title="查看本房间积分排行">战绩</button>
          </div>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <div className="text-sm">{(state.config?.name || room.config?.name || '房间')} · 第 {state.handNumber} 手</div>
          <div className="w-7 h-0.5 bg-emerald-500 rounded"></div>
        </div>
        <div className="header-right flex items-center gap-2 relative">
          <div className={`timer-pill pill ${secondsLeft < 60 ? 'text-red-300 border-red-500/50' : ''}`}>
            ⏱ {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
          </div>
          {room.mode === 'online' && (
            <div
              className="room-code-pill pill flex items-center gap-1.5"
              style={{
                color: connStatus === 'open' ? '#10b981' : connStatus === 'reconnecting' ? '#f4d97a' : '#ff8585',
                borderColor: connStatus === 'open' ? 'rgba(16,185,129,0.4)' : connStatus === 'reconnecting' ? 'rgba(244,217,122,0.4)' : 'rgba(255,133,133,0.4)',
              }}
              title={`房间码 ${room.id}（点击复制）`}
              onClick={copyRoomLink}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: connStatus === 'open' ? '#10b981' : connStatus === 'reconnecting' ? '#f4d97a' : '#ff8585' }} />
              {connStatus === 'open' ? room.id : connStatus === 'reconnecting' ? '重连中' : '未连接'}
            </div>
          )}
          <div className="stack-pill bg-white/[0.06] border border-white/10 rounded-full px-3.5 py-1.5 text-[13px]">
            {hero.stack.toLocaleString()}
          </div>
          <button onClick={() => setMuted((m) => !m)} className="mute-btn pill">{muted ? '🔇' : '🔊'}</button>
          <button
            onClick={() => setShowRoomMenu((v) => !v)}
            className="mobile-menu-trigger pill"
            aria-label="房间菜单"
          >
            ☰
          </button>
          {showRoomMenu && (
            <div className="room-menu-popover absolute right-0 top-[calc(100%+8px)] w-[220px] rounded-xl border border-emerald-500/30 bg-[rgba(8,18,14,0.96)] shadow-[0_12px_30px_rgba(0,0,0,0.65)] backdrop-blur-md p-2 z-[80]">
              <div className="px-3 py-2 border-b border-white/5 mb-1 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] tracking-[2px] text-emerald-300/70">房间菜单</div>
                  <div className="text-xs text-emerald-100/60 mt-1 truncate">{room.mode === 'online' ? `房间码 ${room.id}` : '本地房间'}</div>
                </div>
                <button
                  onClick={() => setShowRoomMenu(false)}
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-emerald-100/70 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
                  aria-label="关闭菜单"
                  title="关闭"
                >
                  ✕
                </button>
              </div>
              {room.mode === 'online' && <MenuItem onClick={() => { copyRoomLink(); setShowRoomMenu(false); }}>复制房间链接</MenuItem>}
              <MenuItem onClick={() => { setShowStandings(true); setShowRoomMenu(false); }}>战绩排行</MenuItem>
              <MenuItem onClick={() => { setMuted((m) => !m); setShowRoomMenu(false); }}>声音：{muted ? '关' : '开'}</MenuItem>
              <MenuItem danger onClick={() => { setShowRoomMenu(false); exitRoom(); }}>退出房间</MenuItem>
            </div>
          )}
        </div>
      </header>

      {/* 牌桌舞台 */}
      <div className="table-wrap flex-1 flex items-center justify-center pt-12">
        <div className="poker-stage relative">
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
            <div className="text-[20px] font-semibold text-white/95 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">{pot.toLocaleString()}</div>
          </div>

          {/* 公共牌 / 跑马多条牌面：多次跑马时直接发在桌面上，而不是另起浮层 */}
          {showRunItBoards ? (
            <div className="runit-table-boards absolute left-1/2 top-[50%] z-[6] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
              {state.runIt!.runs.map((run) => {
                const isActiveRun = activeRunIndex === run.index;
                const isPastRun = activeRunIndex !== null && run.index < activeRunIndex;
                const isDimmedRun = activeRunIndex !== null && !isActiveRun;
                const baseCount = state.runIt?.baseCommunity.length ?? 0;
                const visibleCount = activeRunIndex === null
                  ? 5
                  : isPastRun
                  ? 5
                  : isActiveRun
                  ? activeRunRevealCount
                  : baseCount;
                return (
                  <div
                    key={run.index}
                    className={`runit-table-board flex items-center gap-2 rounded-xl border px-3 py-2 backdrop-blur-[2px] transition-all duration-300 ${
                      isActiveRun
                        ? 'runit-table-board-active border-amber-200/90 bg-amber-300/15 shadow-[0_0_22px_rgba(244,217,122,0.45),0_6px_18px_rgba(0,0,0,0.35)]'
                        : isDimmedRun
                        ? 'border-white/10 bg-black/15 opacity-45 shadow-[0_6px_18px_rgba(0,0,0,0.25)]'
                        : 'border-amber-400/35 bg-black/20 shadow-[0_6px_18px_rgba(0,0,0,0.35)]'
                    }`}
                  >
                    <div className="w-12 text-center text-[10px] font-bold tracking-[2px] text-amber-200">RUN {run.index}</div>
                    <div className="flex gap-1.5">
                      {run.community.map((card, i) => {
                        const revealed = i < visibleCount;
                        return revealed ? (
                          <PlayingCard key={`run-board-${run.index}-${i}-${card.rank}${card.suit}-up`} card={card} size="table" glow={isActiveRun || activeRunIndex === null} deal={isActiveRun && i >= baseCount} />
                        ) : (
                          <PlayingCard key={`run-board-${run.index}-${i}-down`} faceDown size="table" />
                        );
                      })}
                    </div>
                    <div className="w-20 truncate text-right text-[10px] font-semibold text-emerald-100/70">
                      {(activeRunIndex === null || isPastRun || (isActiveRun && activeRunPayoutReady))
                        ? run.winners.map((w) => state.players[w.seatIdx]?.name || `Seat ${w.seatIdx + 1}`).join(' / ')
                        : '待揭晓'}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="community-cards absolute flex gap-2.5" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
              {[0, 1, 2, 3, 4].map((i) => {
                const card = communityCards[i];
                if (!card) return <PlayingCard key={`community-empty-${i}`} faceDown />;
                return (
                  <PlayingCard
                    key={`community-${state.handNumber}-${i}-${card.rank}${card.suit}`}
                    card={card}
                    glow
                    deal
                  />
                );
              })}
            </div>
          )}

          {/* 番茄飞行特效 */}
          {tomatoThrows.map((throwItem) => {
            const from = getSeatPosition(throwItem.fromSeatIdx, mySeatIdx);
            const to = getSeatPosition(throwItem.targetSeatIdx, mySeatIdx);
            return (
              <div
                key={throwItem.id}
                className="tomato-throw pointer-events-none absolute z-[45]"
                style={{
                  ['--from-x' as any]: `${from.x}%`,
                  ['--from-y' as any]: `${from.y}%`,
                  ['--to-x' as any]: `${to.x}%`,
                  ['--to-y' as any]: `${to.y}%`,
                } as React.CSSProperties}
              >
                <picture>
                  <source srcSet={reactionWebp(TOMATO.code)} type="image/webp" />
                  <img src={reactionGif(TOMATO.code)} alt={TOMATO.alt} width="64" height="64" className="h-16 w-16 object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.65)]" />
                </picture>
              </div>
            );
          })}

          {/* Dealer button */}
          {state.buttonSeat >= 0 && (() => {
            const pos = getDealerPosition(state.buttonSeat, mySeatIdx);
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
            const pos = getSeatPosition(p.seatIdx, mySeatIdx);
            const isEmpty = !p.accountId || p.isSittingOut;
            const tomatoTargetable = tomatoTargeting && !isEmpty && p.seatIdx !== mySeatIdx && !p.hasLeft;
            const payout = activePayouts.find((w) => w.seatIdx === p.seatIdx);
            return (
              <Seat
                key={`${p.seatIdx}-${payoutCycle}`}
                player={isEmpty ? undefined : p}
                isEmpty={isEmpty}
                active={!isStreetSettling && state.toActSeat === p.seatIdx}
                showCards={!p.isHero && p.holeCards.length > 0 && (
                  // 还在牌局中（未弃牌）→ 显示牌背；收筹码过渡期间先不翻开
                  (!p.hasFolded && !showdownReady)
                  // 摊牌结算正式开始后再 reveal
                  || (showdownReady && p.revealCards)
                )}
                revealCards={!p.isHero && p.revealCards && showdownReady}
                isWinner={showdownReady && !!payout}
                handLabel={showdownReady && !p.hasFolded ? handLabels[p.seatIdx] : undefined}
                position={pos}
                rebuyAmount={p.seatIdx === mySeatIdx && (p.outOfChips || p.stack === 0) && p.rebuysLeft > 0 ? (state.config?.rebuyAmount ?? 0) : undefined}
                rebuysLeft={p.seatIdx === mySeatIdx ? p.rebuysLeft : undefined}
                onRebuy={p.seatIdx === mySeatIdx && (p.outOfChips || p.stack === 0) && p.rebuysLeft > 0 ? () => {
                  adapterRef.current?.rebuy();
                  // 本地模式只有在非进行中状态才自动开下一手。
                  // 如果其他玩家正在打当前手，补码只补到自己的 stack，等本手自然结束后再参与下一手。
                  if (room.mode === 'local' && ['idle', 'paused', 'showdown'].includes(state.street)) {
                    adapterRef.current?.startHand();
                  }
                } : undefined}
                payoutAmount={payout?.amount}
                payoutActive={!!payout}
                reactionTs={seatReactions[p.seatIdx]?.ts}
                reactionId={seatReactions[p.seatIdx]?.id}
                tomatoTs={seatTomatoes[p.seatIdx]?.ts}
                tomatoTargetable={tomatoTargetable}
                onTomatoTarget={tomatoTargetable ? () => sendTomatoTo(p.seatIdx) : undefined}
              />
            );
          })}

          {/* Bet 筹码胶囊（包括 hero 自己的）：进入下一街时使用上一状态快照向底池收拢。 */}
          {state.players.map((p) => {
            const visualBet = !isStreetSettling
              && p.visualAction
              && ['call', 'bet', 'raise', 'allin'].includes(p.visualAction.kind)
              && Date.now() - p.visualAction.ts < 1800
              ? (p.visualAction.amount || 0)
              : 0;
            const chipAmount = p.betThisRound || visualBet;
            if (!chipAmount) return null;
            const pos = getBetChipPosition(p.seatIdx, mySeatIdx);
            const isCollecting = !p.betThisRound && visualBet > 0;
            return (
              <div
                key={`bet-${p.seatIdx}-${isCollecting ? p.visualAction?.ts : 'live'}`}
                className={`bet-chip absolute z-[7] flex items-center gap-1.5 px-2.5 py-1 rounded-full ${isCollecting ? 'bet-chip-collecting' : ''}`}
                style={{ 
                  left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)',
                  ['--collect-tx' as any]: `${50 - pos.x}%`,
                  ['--collect-ty' as any]: `${50 - pos.y}%`,
                  background: 'rgba(8,18,14,0.92)',
                  border: '1px solid rgba(212,175,55,0.55)',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.6)',
                } as React.CSSProperties}
              >
                <div className="bet-chip-icon w-5 h-5 rounded-full" style={{
                  background: 'radial-gradient(circle at 35% 30%, #ff7a7a, #c41e1e 60%, #7a0e0e)',
                  border: '2px dashed #fff',
                }}></div>
                <div className="bet-chip-amount text-[11px] font-bold text-amber-200">{chipAmount.toLocaleString()}</div>
              </div>
            );
          })}
          {isStreetSettling && settleView?.bets.map((bet) => {
            const pos = getBetChipPosition(bet.seatIdx, mySeatIdx);
            return (
              <div
                key={`collect-${settleView.token}-${bet.seatIdx}`}
                className="bet-chip bet-chip-collecting absolute z-[8] flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={{
                  left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)',
                  ['--collect-tx' as any]: `${50 - pos.x}%`,
                  ['--collect-ty' as any]: `${50 - pos.y}%`,
                  background: 'rgba(8,18,14,0.92)',
                  border: '1px solid rgba(212,175,55,0.55)',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.6)',
                } as React.CSSProperties}
              >
                <div className="bet-chip-icon w-5 h-5 rounded-full" style={{
                  background: 'radial-gradient(circle at 35% 30%, #ff7a7a, #c41e1e 60%, #7a0e0e)',
                  border: '2px dashed #fff',
                }}></div>
                <div className="bet-chip-amount text-[11px] font-bold text-amber-200">{bet.amount.toLocaleString()}</div>
              </div>
            );
          })}

          {/* Hero 手牌：fold 后保留显示（灰阶+半透明），到下一手才清除 */}
          {hero.holeCards.length === 2 && (
            <div
              className="hero-hand absolute flex z-[6]"
              style={{
                bottom: '14%',
                left: '50%',
                transform: 'translateX(-50%)',
                opacity: hero.hasFolded && !(showdownReady && hero.revealCards) ? 0.35 : 1,
                filter: hero.hasFolded && !(showdownReady && hero.revealCards) ? 'grayscale(0.9)' : 'none',
                transition: 'opacity 0.3s, filter 0.3s',
              }}
            >
              <div
                className="relative flex"
                style={{
                  filter: showdownReady && hero.revealCards
                    ? 'drop-shadow(0 0 14px rgba(212,175,55,0.85)) drop-shadow(0 0 4px rgba(255,215,128,0.6))'
                    : 'none',
                  transition: 'filter 0.4s',
                }}
              >
                <PlayingCard key={`hero-${state.handNumber}-0-${hero.holeCards[0].rank}${hero.holeCards[0].suit}`} card={hero.holeCards[0]} rotate={-7} deal dealDelay={80} />
                <PlayingCard key={`hero-${state.handNumber}-1-${hero.holeCards[1].rank}${hero.holeCards[1].suit}`} card={hero.holeCards[1]} rotate={7} deal dealDelay={240} />

              </div>
              {hero.hasFolded && !hero.revealCards && (
                <div
                  className="absolute left-1/2 -bottom-7 -translate-x-1/2 px-2.5 py-1 rounded text-[11px] font-bold tracking-widest whitespace-nowrap"
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
                setShowToast(next ? '本手已开启秀牌：结算时会展示你的手牌' : '本手已关闭秀牌：结算时保持隐藏');
                setTimeout(() => setShowToast(null), 2500);
              }}
              className="show-toggle absolute z-[7] flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all"
              style={{ 
                bottom: '16%', right: '24%',
                background: hero.showCardsEnabled ? 'rgba(16,185,129,0.18)' : 'rgba(20,20,20,0.7)',
                border: `1.5px solid ${hero.showCardsEnabled ? '#10b981' : 'rgba(255,255,255,0.15)'}`,
                boxShadow: hero.showCardsEnabled
                  ? '0 0 16px rgba(16,185,129,0.5), 0 4px 10px rgba(0,0,0,0.5)'
                  : '0 4px 10px rgba(0,0,0,0.5)',
                color: hero.showCardsEnabled ? '#10b981' : '#9fdcc2',
              }}
              title={hero.showCardsEnabled ? '点击关闭：本手结算时隐藏' : '点击开启：本手结算时展示手牌'}
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

          {/* 摊牌结果提示：不再从桌面中心发光/飞筹码，只保留聚焦赢家头像的收益动画 */}
        </div>
      </div>

      {/* 快捷表情 + 番茄 */}
      <div className="quick-reactions fixed right-5 z-[58] flex gap-2 rounded-2xl border border-white/10 bg-black/45 p-2 shadow-[0_10px_28px_rgba(0,0,0,0.45)] backdrop-blur-md">
        <button
          type="button"
          onClick={toggleTomatoTargeting}
          disabled={reactionsDisabled}
          className={`flex h-11 w-11 items-center justify-center rounded-xl border transition-all active:scale-95 ${tomatoTargeting ? 'border-red-300/80 bg-red-400/25 shadow-[0_0_16px_rgba(248,113,113,0.45)]' : 'border-white/10 bg-white/[0.06]'} ${reactionsDisabled ? 'cursor-not-allowed opacity-35 grayscale' : 'hover:-translate-y-0.5 hover:border-red-300/70 hover:bg-red-400/15'}`}
          title={reactionsDisabled ? '行动中先完成下注操作' : tomatoTargeting ? '选择要砸的玩家' : '扔番茄'}
          aria-label="扔番茄"
        >
          <span className="text-[26px] leading-none" aria-hidden="true">{TOMATO.alt}</span>
        </button>
        <div className="mx-0.5 h-8 w-px self-center bg-white/10" />
        {QUICK_REACTIONS.map((reaction, i) => (
          <button
            key={`${reaction.id}-${i}`}
            type="button"
            onClick={() => sendQuickReaction(reaction.id)}
            disabled={reactionsDisabled}
            className={`flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] transition-all active:scale-95 ${reactionsDisabled ? 'cursor-not-allowed opacity-35 grayscale' : 'hover:-translate-y-0.5 hover:border-emerald-300/55 hover:bg-emerald-400/15'}`}
            title={reactionsDisabled ? '行动中先完成下注操作' : '发送表情'}
            aria-label={`发送表情 ${reaction.alt}`}
          >
            <span className="text-[26px] leading-none" aria-hidden="true">{reaction.alt}</span>
          </button>
        ))}
      </div>

      {/* 当前最佳牌型（实时） */}
      {hero.holeCards.length === 2 && !hero.hasFolded && (
        <BestHand holeCards={hero.holeCards} community={communityCards} />
      )}

      {/* 跑马协商：移动端用底部卡片，避免挡住桌面关键区域 */}
      {!isStreetSettling && state.street === 'runout-voting' && state.runIt?.status === 'voting' && (() => {
        const myVote = state.runIt?.votes?.[mySeatIdx];
        const canVote = state.runIt?.eligibleSeats.includes(mySeatIdx);
        const votedCount = Object.keys(state.runIt?.votes || {}).length;
        const totalVote = state.runIt?.eligibleSeats.length || 0;
        const remainingCards = Math.max(0, 5 - (state.runIt?.baseCommunity.length || state.community.length));
        return (
          <div className="runit-vote-panel fixed left-1/2 -translate-x-1/2 z-[70] w-[min(420px,calc(100vw-24px))] rounded-2xl border border-emerald-500/45 bg-[rgba(8,18,14,0.94)] p-4 shadow-[0_16px_36px_rgba(0,0,0,0.72),0_0_24px_rgba(16,185,129,0.18)] backdrop-blur-md">
            <div className="text-[10px] tracking-[3px] text-emerald-300/75">RUN IT</div>
            <div className="mt-1 text-lg font-bold text-white">是否跑马？</div>
            <div className="mt-1 text-xs text-emerald-100/60">
              还剩 {remainingCards} 张公共牌 · 已选择 {votedCount}/{totalVote} · 最终次数取所有人选择的最小值
            </div>
            {canVote ? (
              myVote ? (
                <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                  你选择了发 {myVote} 次，等待其他玩家...
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {([1, 2, 3] as RunItCount[]).map((count) => (
                    <button
                      key={count}
                      onClick={() => adapterRef.current?.runItVote(count)}
                      className="rounded-xl border border-emerald-500/35 bg-emerald-600/90 px-3 py-3 text-sm font-bold text-white shadow-[0_6px_0_rgba(0,80,55,0.75)] active:translate-y-[2px] active:shadow-[0_3px_0_rgba(0,80,55,0.75)]"
                    >
                      发 {count} 次
                    </button>
                  ))}
                </div>
              )
            ) : (
              <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-emerald-100/65">
                等待本手仍在争夺底池的玩家协商跑马次数...
              </div>
            )}
          </div>
        );
      })()}

      {/* 等待覆盖层（仅在线房间）：
          - 第一局未开始（handNumber === 0）→ Lobby：显示准备 + 开始
          - 已经开过局（handNumber > 0）但临时人不够 → Paused：仅显示等待人加入，不再有"准备"概念 */}
      {state.waitingToStart && room.mode === 'online' && state.handNumber > 0 && (
        <div className="waiting-overlay fixed left-1/2 -translate-x-1/2 z-[55] flex flex-col items-center gap-3" style={{ bottom: 200 }}>
          <div
            className="px-5 py-3 rounded-xl backdrop-blur-md text-center"
            style={{
              background: 'rgba(8,18,14,0.92)',
              border: '1.5px solid rgba(244,217,122,0.5)',
              boxShadow: '0 0 24px rgba(244,217,122,0.18), 0 8px 20px rgba(0,0,0,0.6)',
              minWidth: 320,
            }}
          >
            <div className="text-[10px] tracking-[3px] text-amber-200/80 mb-1">PAUSED</div>
            <div className="text-lg font-semibold text-white mb-1">等待玩家加入</div>
            <div className="text-[12px] text-emerald-100/60">
              在场人数不足 2，分享房间码邀请朋友进入即可继续
            </div>
          </div>
        </div>
      )}

      {/* Lobby（首次开局前）覆盖层 */}
      {state.waitingToStart && room.mode === 'online' && state.handNumber === 0 && (() => {
        const realPlayers = state.players.filter((p) => !p.isSittingOut && !p.isAI && p.accountId);
        const readyCount = realPlayers.filter((p) => p.ready).length;
        const allReady = readyCount === realPlayers.length;
        const enoughPlayers = realPlayers.length >= 2;
        const isHost = state.hostSeatIdx === mySeatIdx;
        return (
          <div className="waiting-overlay fixed left-1/2 -translate-x-1/2 z-[55] flex flex-col items-center gap-3" style={{ bottom: 200 }}>
            <div
              className="px-5 py-3 rounded-xl backdrop-blur-md text-center"
              style={{
                background: 'rgba(8,18,14,0.92)',
                border: '1.5px solid rgba(16,185,129,0.5)',
                boxShadow: '0 0 24px rgba(16,185,129,0.25), 0 8px 20px rgba(0,0,0,0.6)',
                minWidth: 320,
              }}
            >
              <div className="text-[10px] tracking-[3px] text-emerald-300/80 mb-1">WAITING ROOM</div>
              <div className="text-lg font-semibold text-white mb-2">
                {realPlayers.length} 人在场 · {readyCount}/{realPlayers.length} 准备
              </div>
              <div className="flex flex-wrap justify-center gap-1.5 mb-3">
                {realPlayers.map((p) => (
                  <div
                    key={p.seatIdx}
                    className="px-2 py-0.5 rounded text-[11px] font-medium"
                    style={{
                      background: p.ready ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${p.ready ? '#10b981' : 'rgba(255,255,255,0.15)'}`,
                      color: p.ready ? '#10b981' : '#9fdcc2',
                    }}
                  >
                    {p.ready ? '✓' : '·'} {p.name}
                    {p.seatIdx === state.hostSeatIdx && <span className="ml-1 opacity-70">(房主)</span>}
                  </div>
                ))}
              </div>
              {!enoughPlayers && (
                <div className="text-[11px] text-amber-300/80">至少需要 2 个真人，分享房间码邀请朋友</div>
              )}
              {enoughPlayers && !allReady && !isHost && (
                <div className="text-[11px] text-emerald-100/60">等待其他玩家准备 / 房主开始</div>
              )}
              {enoughPlayers && allReady && !isHost && (
                <div className="text-[11px] text-emerald-300">全员准备完毕 · 等房主开始</div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => adapterRef.current?.toggleReady()}
                className="px-6 py-2.5 rounded-lg font-semibold tracking-wider transition-all"
                style={{
                  background: hero.ready ? 'rgba(255,255,255,0.06)' : 'linear-gradient(180deg, #10b981, #0e8e6c)',
                  border: hero.ready ? '1.5px solid rgba(255,255,255,0.25)' : '1.5px solid #10b981',
                  color: hero.ready ? '#9fdcc2' : '#fff',
                  boxShadow: hero.ready ? 'none' : '0 0 16px rgba(16,185,129,0.5)',
                  minWidth: 130,
                }}
              >
                {hero.ready ? '取消准备' : '准备'}
              </button>
              {isHost && (
                <button
                  onClick={() => adapterRef.current?.startHand()}
                  disabled={!enoughPlayers || !allReady}
                  className="px-6 py-2.5 rounded-lg font-semibold tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    background: 'linear-gradient(180deg, #d4af37, #8a6f1a)',
                    color: '#1a1a1a',
                    boxShadow: enoughPlayers && allReady ? '0 4px 0 #4a3808, 0 6px 12px rgba(0,0,0,0.4)' : 'none',
                    minWidth: 150,
                  }}
                >
                  开始游戏
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* 本地模式 idle 状态：显示加载中（启动 / 配置错误时） */}
      {state.waitingToStart && room.mode === 'local' && (
        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[55] text-emerald-100/50">
          准备中...
        </div>
      )}

      {/* 底部行动区 */}
      {!state.waitingToStart && state.street !== 'runout-voting' && (
        <div className="action-bar fixed bottom-0 left-0 right-0 z-40 px-6 py-4" style={{ background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0.85))' }}>
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
      )}

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

      {/* 积分榜 */}
      {showLeaderboard && (
        <Leaderboard
          state={state}
          myAccountId={user.id}
          onRestart={() => { setShowLeaderboard(false); navigate('/'); }}
          onExit={() => navigate('/')}
        />
      )}

      {/* 战绩面板（盈亏排行） */}
      {showStandings && (
        <Standings
          players={state.players}
          myAccountId={user.id}
          onClose={() => setShowStandings(false)}
        />
      )}
    </div>
  );
}
