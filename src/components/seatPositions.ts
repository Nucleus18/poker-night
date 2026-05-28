/**
 * 9 个座位的位置算法：
 * - "viewIdx" = 视图座位号：当前玩家永远在 viewIdx=0（屏幕底部）
 * - "viewIdx 0" 在底部 6 点钟，独占 100° 空白弧
 * - viewIdx 1..8 在剩余 260° 弧上均匀分布（每段 ~37°）
 *
 * 椭圆采样：x = 50% + RX*sin(θ)*100, y = 50% - RY*cos(θ)*100
 *
 * 真实座位号 absoluteIdx 通过 toViewIdx(abs, mySeat) 映射到 viewIdx：
 *   viewIdx = (absoluteIdx - mySeat + 9) % 9
 * 这样不管你坐在哪个座位，自己看到的都是同样的视角（自己在屏幕底部）
 */

const RX = 0.46;
const RY = 0.44;
const START_ANGLE = 230;
const SWEEP = 260;
const STEPS = 7;

const NON_HERO_ANGLES: number[] = [];
for (let i = 0; i < 8; i++) {
  NON_HERO_ANGLES.push((START_ANGLE + (SWEEP / STEPS) * i) % 360);
}

export interface SeatPos { x: number; y: number; }

/** absoluteIdx → viewIdx（hero 永远 viewIdx=0） */
export function toViewIdx(absoluteIdx: number, mySeat: number): number {
  return ((absoluteIdx - mySeat) + 9) % 9;
}

/**
 * 根据 viewIdx 返回屏幕百分比位置
 * @param viewIdx 0..8（0 = 我自己，在屏幕底部）
 */
export function getSeatPositionByView(viewIdx: number): SeatPos {
  if (viewIdx === 0) return { x: 43, y: 88 };
  const angleDeg = NON_HERO_ANGLES[viewIdx - 1];
  const r = (angleDeg * Math.PI) / 180;
  return {
    x: 50 + RX * Math.sin(r) * 100,
    y: 50 - RY * Math.cos(r) * 100,
  };
}

/**
 * 兼容旧调用：默认 mySeat=0（本地模式 hero 永远 0）
 * 推荐用 getSeatPositionByView 显式传 viewIdx
 */
export function getSeatPosition(absoluteIdx: number, mySeat: number = 0): SeatPos {
  return getSeatPositionByView(toViewIdx(absoluteIdx, mySeat));
}

/** Bet 筹码胶囊位置：从座位向桌中心方向 32% 处 */
export function getBetChipPosition(absoluteIdx: number, mySeat: number = 0): SeatPos {
  const viewIdx = toViewIdx(absoluteIdx, mySeat);
  if (viewIdx === 0) {
    return { x: 50, y: 65 };
  }
  const seat = getSeatPositionByView(viewIdx);
  const cx = 50, cy = 50;
  return {
    x: seat.x + (cx - seat.x) * 0.32,
    y: seat.y + (cy - seat.y) * 0.32,
  };
}

/** Dealer button 位置：座位偏内一点 */
export function getDealerPosition(absoluteIdx: number, mySeat: number = 0): SeatPos {
  const viewIdx = toViewIdx(absoluteIdx, mySeat);
  if (viewIdx === 0) {
    return { x: 60, y: 80 };
  }
  const angleDeg = NON_HERO_ANGLES[viewIdx - 1];
  const r = ((angleDeg - 18) * Math.PI) / 180;
  return {
    x: 50 + (RX - 0.08) * Math.sin(r) * 100,
    y: 50 - (RY - 0.08) * Math.cos(r) * 100,
  };
}
