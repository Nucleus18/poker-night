# Poker Night

私域德州扑克 · 9 人桌 · 朋友局

## 三种玩法

| 模式 | 说明 | 启动方式 |
|---|---|---|
| **本地** | 你 + AI，纯前端单机 | `npm run dev` |
| **创建朋友局** | 你 host，分享房间码给朋友 | `npm run dev:all` |
| **加入房间** | 输入朋友给的房间码加入 | `npm run dev:all` |

## 快速启动

### 本地单机（最快）

```bash
cd poker
npm install
npm run dev
```

浏览器打开 http://localhost:5173 → 登录任意账号 → 选 "本地" → 开局。

### 联机模式（朋友局）

需要同时跑前端 + PartyKit 服务端：

```bash
npm run dev:all   # 同时启动 vite (5173) + partykit (1999)
```

然后在两个浏览器标签页（或两台电脑/同一 wifi）：
- 标签 A：登录 player01 → 选"创建朋友局" → 创建房间 → 顶栏看到房间码（如 `K7M3PX`）
- 标签 B：登录 player02 → 选"加入房间" → 输入房间码 → 进入

> 默认连本地 PartyKit (`localhost:1999`)。要改连云端服务，设置 `VITE_PARTYKIT_HOST=poker-party.xxx.partykit.dev`。

## 部署到公网（朋友能访问）

### 1. 部署 PartyKit 服务端
```bash
npm run deploy:party
# 首次会让你 GitHub 登录授权（10 秒），之后输出一个 URL：
# Your party is now available at https://poker-party.<你的用户名>.partykit.dev
```

### 2. 部署前端到 Vercel
```bash
# 在 .env.production 写：
echo "VITE_PARTYKIT_HOST=poker-party.<你的用户名>.partykit.dev" > .env.production

# 然后用 vercel CLI 或直接连 GitHub repo 到 vercel.com
npx vercel --prod
```

发给朋友：`https://你的-vercel-app.vercel.app/`，让他们登录任意 player 账号即可。

## 内置账号

| 账号 | 密码 |
|---|---|
| player01 | poker01 |
| player02 | poker02 |
| ... 一直到 player10 / poker10 |

登录后可在「个人资料」改昵称、改头像。

## 技术栈

- **前端**：React 18 + TypeScript + Vite + Tailwind + Zustand
- **引擎**：纯函数 reducer + immer + pokersolver（牌型识别）
- **联机**：PartyKit (Cloudflare Workers + Durable Objects)
- **同构**：服务端和客户端跑同一份 `src/engine`

## 架构

```
朋友 A ┐
朋友 B ┼─→ Vercel (前端) ──WebSocket──→ PartyKit (服务端权威引擎)
朋友 C ┘                                       ↓
                                           per-player view（手牌防作弊）
```

服务端跑同一份 reducer，给每个玩家发"只能看到自己手牌"的 state，showdown 时才下发完整。

## 项目结构

```
poker/
├── party/poker.ts              # PartyKit 服务端（每个房间一个 Server）
├── src/
│   ├── auth/                   # 内置账号
│   ├── room/                   # 房间元信息（local/online 两种模式）
│   ├── engine/                 # 纯函数引擎（types/deck/engine）
│   ├── ai/                     # 简单 AI（8 性格 · 三阈值）
│   ├── adapter/
│   │   ├── types.ts            # IAdapter 接口
│   │   ├── local.ts            # 本地实现
│   │   └── socket.ts           # 联机实现（PartyKit 客户端）
│   ├── audio/                  # WebAudio 音效
│   ├── components/             # PlayingCard / Seat / BetPanel / BestHand / Leaderboard
│   ├── pages/                  # Login / Lobby / Profile / Room
│   └── main.tsx
├── partykit.json               # PartyKit 配置
└── README.md
```

## 已实现功能

- ✅ 本地 vs AI / 联机朋友局两种模式
- ✅ 9 人桌（hero 占下方空白，其余 8 座均匀分布）
- ✅ 标准 No-Limit Texas Hold'em + 边池（Side Pot）
- ✅ 服务端权威 + per-player view 防作弊
- ✅ 房间码生成 / 加入 / 复制链接分享
- ✅ 30s 真人计时器（超时自动 fold/check）
- ✅ 断线重连（保留座位 5 分钟）
- ✅ AI 补位空座 / 真人离开自动 fold
- ✅ 秀牌开关（弃牌后/一人收池可主动亮牌）
- ✅ 摊牌特效：辐射光 + WINNER 徽章 + 大字牌型 + 筹码炸开
- ✅ 限时倒计时 + 本手打完结算 + 积分榜
- ✅ 破产补码弹窗
- ✅ 基础音效

## 已知限制

- 联机模式：账号验证目前只看 ID，没有真实校验（朋友局够用，对外不要部署）
- AI 较简单（preflop 启发式 + postflop 用 pokersolver rank 粗估）
- 没有聊天 / 表情 / 手牌历史回放（二期可加）
- 音效是 WebAudio 合成的（二期换真实音频）

