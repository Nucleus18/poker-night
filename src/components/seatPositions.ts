/**
 * 9 个座位的位置算法（与 v4 预览一致）：
 * - hero（座位 0）独占底部 6 点钟方向，两侧各 50° 空白弧
 * - 其他 8 个座位在剩余 260° 弧上均匀分布
 *
 * 椭圆采样：x = 50% + RX*sin(θ)*100, y = 50% - RY*cos(θ)*100
 */

const RX = 0.46;
const RY = 0.44;
const START_ANGLE = 230;  // hero 右侧第一个非 hero 座位
const SWEEP = 260;
const STEPS = 7;          // 8 个座位之间 7 段间隔

const NON_HERO_ANGLES: number[] = [];
for (let i = 0; i < 8; i++) {
  NON_HERO_ANGLES.push((START_ANGLE + (SWEEP / STEPS) * i) % 360);
}

export interface SeatPos { x: number; y: number; }

/**
 * @param seatIdx 0..8（0 是 hero）
 */
export function getSeatPosition(seatIdx: number): SeatPos {
  if (seatIdx === 0) return { x: 50, y: 96 };
  const angleDeg = NON_HERO_ANGLES[seatIdx - 1];
  const r = (angleDeg * Math.PI) / 180;
  return {
    x: 50 + RX * Math.sin(r) * 100,
    y: 50 - RY * Math.cos(r) * 100,
  };
}

/** Bet 筹码胶囊位置：从座位向桌中心方向 32% 处。hero 用稍长的距离，避免被自己手牌挡住。 */
export function getBetChipPosition(seatIdx: number): SeatPos {
  if (seatIdx === 0) {
    // hero 在底部 y=96%，胶囊放在公共牌下方一点（手牌上方），不挡牌
    return { x: 50, y: 65 };
  }
  const seat = getSeatPosition(seatIdx);
  const cx = 50, cy = 50;
  return {
    x: seat.x + (cx - seat.x) * 0.32,
    y: seat.y + (cy - seat.y) * 0.32,
  };
}

/** Dealer button 位置：座位偏内一点 */
export function getDealerPosition(seatIdx: number): SeatPos {
  if (seatIdx === 0) {
    return { x: 60, y: 80 };
  }
  const angleDeg = NON_HERO_ANGLES[seatIdx - 1];
  const r = ((angleDeg - 18) * Math.PI) / 180;
  return {
    x: 50 + (RX - 0.08) * Math.sin(r) * 100,
    y: 50 - (RY - 0.08) * Math.cos(r) * 100,
  };
}
