/**
 * 德州扑克引擎核心
 *
 * 设计原则：
 * - 所有游戏推进通过 (state, action) => newState 的 reducer
 * - state 是 immutable（用 Immer 帮助）
 * - 不依赖 UI、不依赖网络
 * - 二期联机时服务器和客户端跑同一份代码
 */

import { produce } from 'immer';
import { Hand } from 'pokersolver';
import type { GameState, Player, Card, ActionKind, Pot } from './types';
import { buildDeck, shuffle, cardToStr } from './deck';

// ==================== 创建游戏状态 ====================
export function createInitialState(players: Player[], config: GameState['config'], hostSeatIdx: number = 0): GameState {
  return {
    config,
    players,
    deck: [],
    community: [],
    street: 'idle',
    pots: [],
    currentBet: 0,
    minRaise: config.bigBlind,
    buttonSeat: -1,
    toActSeat: -1,
    handNumber: 0,
    startedAt: Date.now(),
    endingAfterHand: false,
    finished: false,
    waitingToStart: true,
    hostSeatIdx,
  };
}

// ==================== 开始新一手 ====================
export function startNewHand(state: GameState): GameState {
  return produce(state, (s) => {
    s.handNumber += 1;
    s.deck = shuffle(buildDeck());
    s.community = [];
    s.pots = [];
    s.currentBet = 0;
    s.minRaise = s.config.bigBlind;
    s.street = 'preflop';
    s.winners = undefined;
    s.waitingToStart = false;
    // 第一手真正发牌时记录倒计时基准；后续手不重置
    if (!s.gameStartedAt) s.gameStartedAt = Date.now();

    // 重置玩家本手状态
    s.players.forEach((p) => {
      p.holeCards = [];
      p.hasFolded = false;
      p.isAllIn = false;
      p.betThisRound = 0;
      p.totalBetThisHand = 0;
      p.lastAction = undefined;
      p.revealCards = false;
      // 秀牌是"每手"设置：每手开局默认不秀牌，玩家本手内可切换
      p.showCardsEnabled = false;
    });

    // 找参与本手的玩家（有筹码、不破产、不离场）
    const eligible = s.players.filter((p) => p.stack > 0 && !p.outOfChips && !p.isSittingOut);
    if (eligible.length < 2) {
      s.street = 'idle';
      return;
    }

    // Button 移动
    s.buttonSeat = nextEligibleSeat(s, s.buttonSeat);

    // 小盲 / 大盲（双人桌：button 是 SB；多人桌：button 后一位是 SB）
    let sbSeat: number, bbSeat: number;
    if (eligible.length === 2) {
      sbSeat = s.buttonSeat;
      bbSeat = nextEligibleSeat(s, sbSeat);
    } else {
      sbSeat = nextEligibleSeat(s, s.buttonSeat);
      bbSeat = nextEligibleSeat(s, sbSeat);
    }

    const sb = s.players[sbSeat];
    const bb = s.players[bbSeat];
    postBlind(sb, s.config.smallBlind);
    postBlind(bb, s.config.bigBlind);
    s.currentBet = s.config.bigBlind;
    s.minRaise = s.config.bigBlind;

    // 发手牌（每人 2 张）
    for (let r = 0; r < 2; r++) {
      let cur = sbSeat;
      for (let i = 0; i < eligible.length; i++) {
        const p = s.players[cur];
        if (p.stack > 0 || p.isAllIn) {
          p.holeCards.push(s.deck.shift()!);
        }
        cur = nextEligibleSeat(s, cur);
      }
    }

    // 第一个行动：BB 后一位
    s.toActSeat = nextEligibleSeat(s, bbSeat);
  });
}

function postBlind(p: Player, amount: number) {
  const actual = Math.min(amount, p.stack);
  p.stack -= actual;
  p.betThisRound = actual;
  p.totalBetThisHand += actual;
  if (p.stack === 0) p.isAllIn = true;
}

// ==================== 玩家行动 ====================
export interface ApplyActionResult {
  state: GameState;
  needsAdvance: boolean;
}

export function applyAction(state: GameState, seatIdx: number, kind: ActionKind, amount?: number): GameState {
  if (state.toActSeat !== seatIdx || state.street === 'idle' || state.street === 'showdown' || state.finished) {
    return state;
  }
  return produce(state, (s) => {
    const p = s.players[seatIdx];
    const toCall = s.currentBet - p.betThisRound;

    switch (kind) {
      case 'fold': {
        p.hasFolded = true;
        p.lastAction = { kind: 'fold', ts: Date.now() };
        break;
      }
      case 'check': {
        if (toCall > 0) return; // illegal
        p.lastAction = { kind: 'check', ts: Date.now() };
        break;
      }
      case 'call': {
        const pay = Math.min(toCall, p.stack);
        p.stack -= pay;
        p.betThisRound += pay;
        p.totalBetThisHand += pay;
        if (p.stack === 0) p.isAllIn = true;
        p.lastAction = { kind: pay >= p.stack + pay ? 'call' : 'call', amount: pay, ts: Date.now() };
        break;
      }
      case 'allin': {
        const pay = p.stack;
        const newBet = p.betThisRound + pay;
        p.stack = 0;
        p.betThisRound = newBet;
        p.totalBetThisHand += pay;
        p.isAllIn = true;
        if (newBet > s.currentBet) {
          const raiseAmount = newBet - s.currentBet;
          if (raiseAmount >= s.minRaise) s.minRaise = raiseAmount;
          s.currentBet = newBet;
        }
        p.lastAction = { kind: 'allin', amount: pay, ts: Date.now() };
        break;
      }
      case 'bet':
      case 'raise': {
        // amount 是"目标到达额"
        const target = amount ?? 0;
        if (target <= s.currentBet) return; // 不是合法 bet/raise
        const need = target - p.betThisRound;
        if (need > p.stack) return;
        p.stack -= need;
        p.betThisRound = target;
        p.totalBetThisHand += need;
        if (p.stack === 0) p.isAllIn = true;
        const raiseAmount = target - s.currentBet;
        if (raiseAmount >= s.minRaise) s.minRaise = raiseAmount;
        s.currentBet = target;
        p.lastAction = { kind: kind === 'bet' ? 'bet' : 'raise', amount: target, ts: Date.now() };
        break;
      }
    }

    // 推进到下一个行动者
    advanceTurn(s);
  });
}

// ==================== 推进 turn / street ====================
function advanceTurn(s: GameState) {
  // 1) 只剩一人未弃牌 → 直接结束
  const notFolded = s.players.filter((p) => !p.hasFolded && (p.stack > 0 || p.isAllIn || p.totalBetThisHand > 0));
  if (notFolded.length === 1) {
    s.toActSeat = -1;
    finalizeHand(s);
    return;
  }

  // 2) 还能行动的人 = 未弃牌且还有筹码（all-in 已无筹码）
  const canAct = s.players.filter((p) => !p.hasFolded && p.stack > 0);

  // 3) 全员 all-in（或只剩一人能行动且他已经把当前轮 call 平） → 直接进下一街
  if (canAct.length === 0) {
    advanceStreet(s);
    return;
  }
  if (canAct.length === 1) {
    const lone = canAct[0];
    // 唯一能行动的人，如果他下注已经匹配 currentBet（无需再行动），且其他人都 all-in，跳街
    const opponentsAllIn = s.players.filter((p) => !p.hasFolded && p.seatIdx !== lone.seatIdx).every((p) => p.isAllIn);
    if (opponentsAllIn && lone.betThisRound >= s.currentBet) {
      advanceStreet(s);
      return;
    }
  }

  // 4) 找下一个能行动的人
  let cur = s.toActSeat;
  for (let tries = 0; tries < s.players.length; tries++) {
    cur = (cur + 1) % s.players.length;
    const p = s.players[cur];
    if (p.hasFolded || p.stack === 0) continue;
    // 是否还需要他行动：投入小于 currentBet，或本轮还没行动过
    if (p.betThisRound < s.currentBet || p.lastAction === undefined) {
      s.toActSeat = cur;
      return;
    }
  }

  // 5) 该轮所有人都行动到位 → 进入下一街
  advanceStreet(s);
}

function advanceStreet(s: GameState) {
  collectIntoPots(s);

  // 还能行动的人 = 未弃牌 + 还有筹码
  // （p.stack > 0 自然排除了 isAllIn、isSittingOut、空位）
  const stillCanAct = s.players.filter((p) => !p.hasFolded && p.stack > 0);

  // 多人 all-in：直接发完剩余社区牌走摊牌
  if (stillCanAct.length <= 1 && s.street !== 'river' && s.street !== 'showdown') {
    while (s.community.length < 5) dealNextCommunity(s);
    s.street = 'showdown';
    s.toActSeat = -1;
    finalizeHand(s);
    return;
  }

  switch (s.street) {
    case 'preflop':
      dealNextCommunity(s, 3);
      s.street = 'flop';
      break;
    case 'flop':
      dealNextCommunity(s, 1);
      s.street = 'turn';
      break;
    case 'turn':
      dealNextCommunity(s, 1);
      s.street = 'river';
      break;
    case 'river':
      s.street = 'showdown';
      s.toActSeat = -1;
      finalizeHand(s);
      return;
  }

  // 重置本轮下注
  s.currentBet = 0;
  s.minRaise = s.config.bigBlind;
  s.players.forEach((p) => { p.betThisRound = 0; p.lastAction = undefined; });

  // postflop 第一个行动：button 后第一个未弃牌且有筹码的
  let cur = s.buttonSeat;
  for (let tries = 0; tries < s.players.length; tries++) {
    cur = (cur + 1) % s.players.length;
    const p = s.players[cur];
    if (!p.hasFolded && p.stack > 0) {
      s.toActSeat = cur;
      return;
    }
  }
  // 没人能行动（理论不该到这）：直接发完 + 摊牌兜底
  s.toActSeat = -1;
  while (s.community.length < 5) dealNextCommunity(s);
  s.street = 'showdown';
  finalizeHand(s);
}

function dealNextCommunity(s: GameState, count: number = 1) {
  for (let i = 0; i < count; i++) {
    s.community.push(s.deck.shift()!);
  }
}

// ==================== 边池计算 ====================
function collectIntoPots(s: GameState) {
  // 把本轮 betThisRound 累加到 pot 里
  // 简化做法：保留单一 main pot；如果有 all-in 玩家，按 totalBetThisHand 分边池
  const contributions = s.players.map((p) => ({ seat: p.seatIdx, amt: p.betThisRound, folded: p.hasFolded }));

  // 简单做法：先累加到 main pot
  const total = contributions.reduce((sum, c) => sum + c.amt, 0);
  if (s.pots.length === 0) s.pots.push({ amount: 0, eligible: s.players.map((p) => p.seatIdx) });
  s.pots[s.pots.length - 1].amount += total;

  // 每轮结束后，如果有 all-in 玩家，做一次边池切分
  rebuildSidePots(s);
}

function rebuildSidePots(s: GameState) {
  // 用 totalBetThisHand 重建 pots
  const players = s.players.map((p) => ({
    seat: p.seatIdx,
    total: p.totalBetThisHand,
    folded: p.hasFolded,
    allIn: p.isAllIn,
  }));

  // 找出所有 all-in 的"投入额阶梯"
  const allInTotals = [...new Set(players.filter((p) => p.allIn && !p.folded).map((p) => p.total))].sort((a, b) => a - b);

  const pots: Pot[] = [];
  let prev = 0;
  for (const cap of allInTotals) {
    const layer = cap - prev;
    let amount = 0;
    const eligible: number[] = [];
    for (const p of players) {
      const contribution = Math.min(p.total, cap) - Math.min(p.total, prev);
      amount += contribution;
      if (!p.folded && p.total >= cap) eligible.push(p.seat);
    }
    if (amount > 0) pots.push({ amount, eligible });
    prev = cap;
  }
  // 主池剩余（非 all-in 的人继续投入）
  let mainAmount = 0;
  const mainEligible: number[] = [];
  for (const p of players) {
    const contribution = Math.max(0, p.total - prev);
    mainAmount += contribution;
    if (!p.folded && p.total > prev) mainEligible.push(p.seat);
  }
  if (mainAmount > 0) pots.push({ amount: mainAmount, eligible: mainEligible });

  if (pots.length > 0) s.pots = pots;
}

// ==================== Showdown / 结算 ====================
function finalizeHand(s: GameState) {
  // 把本轮 betThisRound 也并入
  collectIntoPots(s);
  s.players.forEach((p) => { p.betThisRound = 0; });

  s.street = 'showdown';

  // 一手牌真正结算时才统计局数：所有本手发过牌的玩家（包括已 fold）各 +1
  // 注意不要在 startNewHand 统计，否则重复 start / 服务端与客户端竞态会导致虚高。
  s.players.forEach((p) => {
    if (p.accountId && p.holeCards.length === 2) {
      p.handsPlayed = (p.handsPlayed || 0) + 1;
    }
  });

  const alive = s.players.filter((p) => !p.hasFolded);
  const winners: { seatIdx: number; amount: number; handDescription?: string }[] = [];

  if (alive.length === 1) {
    const w = alive[0];
    const total = s.pots.reduce((a, p) => a + p.amount, 0);
    w.stack += total;
    winners.push({ seatIdx: w.seatIdx, amount: total });
    s.pots = [];
  } else {
    // 多人摊牌
    for (const pot of s.pots) {
      const contenders = alive.filter((p) => pot.eligible.includes(p.seatIdx));
      if (contenders.length === 0) continue;
      const evaluated = contenders.map((p) => {
        const all = [...p.holeCards, ...s.community].map(cardToStr);
        const hand = (Hand as any).solve(all);
        return { player: p, hand };
      });
      const winning = (Hand as any).winners(evaluated.map((e) => e.hand));
      const winnerPlayers = evaluated.filter((e) => winning.includes(e.hand)).map((e) => e.player);
      const split = Math.floor(pot.amount / winnerPlayers.length);
      const remainder = pot.amount - split * winnerPlayers.length;
      winnerPlayers.forEach((wp, i) => {
        const give = split + (i === 0 ? remainder : 0);
        wp.stack += give;
        const existing = winners.find((w) => w.seatIdx === wp.seatIdx);
        if (existing) existing.amount += give;
        else {
          const desc = (winning[0] as any).descr;
          winners.push({ seatIdx: wp.seatIdx, amount: give, handDescription: desc });
        }
      });
    }
    s.pots = [];
  }

  s.winners = winners;
  s.toActSeat = -1;

  // ===== 决定哪些牌要 reveal =====
  // 规则：
  // 1) showdown（多人 alive 比牌）→ 所有参与摊牌的人都强制 reveal
  // 2) 一人收池（其他人都 fold）→ 收池者只有开了 showCardsEnabled 才 reveal
  // 3) 已 fold 的玩家 → 只有开了 showCardsEnabled 才 reveal
  const isMultiwayShowdown = alive.length > 1;
  s.players.forEach((p) => {
    if (p.holeCards.length === 0) {
      p.revealCards = false;
      return;
    }
    if (p.hasFolded) {
      p.revealCards = !!p.showCardsEnabled;
    } else if (isMultiwayShowdown) {
      // 走到摊牌：强制 reveal
      p.revealCards = true;
    } else {
      // 一人收池
      p.revealCards = !!p.showCardsEnabled;
    }
  });

  // 标记破产
  s.players.forEach((p) => {
    if (p.stack === 0 && !p.isSittingOut) p.outOfChips = true;
  });
}

function nextEligibleSeat(s: GameState, from: number): number {
  let cur = from;
  for (let i = 0; i < s.players.length; i++) {
    cur = (cur + 1) % s.players.length;
    const p = s.players[cur];
    if (p.stack > 0 && !p.isSittingOut && !p.outOfChips) return cur;
  }
  return from;
}

// ==================== 公共查询 ====================
export function getToCall(state: GameState, seatIdx: number): number {
  const p = state.players[seatIdx];
  return Math.max(0, state.currentBet - p.betThisRound);
}

export function getMinRaiseTo(state: GameState, seatIdx: number): number {
  const p = state.players[seatIdx];
  // 至少把 currentBet 抬高 minRaise
  return Math.min(p.stack + p.betThisRound, state.currentBet + state.minRaise);
}

export function rebuyPlayer(state: GameState, seatIdx: number): GameState {
  return produce(state, (s) => {
    const p = s.players[seatIdx];
    if (p.rebuysLeft > 0 && p.outOfChips) {
      p.stack = s.config.rebuyAmount;
      p.outOfChips = false;
      p.rebuysLeft -= 1;
      p.totalBuyIn = (p.totalBuyIn || 0) + s.config.rebuyAmount;
    }
  });
}
