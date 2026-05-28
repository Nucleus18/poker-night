# Poker Night

私域德州扑克 · 9 人桌 · 朋友局

## 快速启动

```bash
cd poker
./start.sh
```

或者：

```bash
cd poker
npm install   # 首次需要
npm run dev
```

启动后浏览器访问 **http://localhost:5173/**

## 内置账号

| 账号 | 密码 |
|---|---|
| player01 | poker01 |
| player02 | poker02 |
| player03 | poker03 |
| player04 | poker04 |
| player05 | poker05 |
| player06 | poker06 |
| player07 | poker07 |
| player08 | poker08 |
| player09 | poker09 |
| player10 | poker10 |

登录后可在「个人资料」页改昵称、改头像。

## 当前进度（一期 P1）

✅ 项目骨架（Vite + React + TS + Tailwind + Zustand）
✅ 10 个内置账号 + 登录页
✅ 个人资料页（改名/改头像/上传/预设配色）
✅ 大厅 + 创建房间表单（盲注/起始筹码/限时/AI数/补码）
✅ 9 人桌 React 组件化（与 v4 预览视觉一致）
✅ 下注控制面板（FOLD / CHECK·CALL / BET·RAISE 三槽 + 滑条 + 步进器 + 快捷）
✅ 标准 No-Limit Hold'em 引擎（含边池）
✅ 简单 AI（8 种性格 · 三阈值决策）
✅ 限时倒计时 + 本手打完结算
✅ 积分榜
✅ 破产补码弹窗
✅ 基础音效（WebAudio 合成版）

## 二期（联机版）路径

UI 不动，只换 Adapter：
- `src/adapter/local.ts` → `src/adapter/socket.ts`
- 加一个 Node + ws 服务，引擎跑在服务器
- 房间码 / 邀请链接 / 重连 / 真人计时器

## 项目结构

```
poker/
├── src/
│   ├── auth/           # 内置账号 + Zustand store
│   ├── room/           # 房间 store
│   ├── engine/         # 纯函数游戏引擎（types/deck/engine）
│   ├── ai/             # 简单 AI 决策
│   ├── adapter/        # LocalAdapter（一期）
│   ├── audio/          # 音效总线
│   ├── components/     # PlayingCard / Seat / BetPanel / Leaderboard / 座位定位
│   ├── pages/          # Login / Lobby / Profile / Room
│   ├── App.tsx         # 路由
│   └── main.tsx
├── preview-table.html  # v4 桌面纯静态预览（无需启动）
└── start.sh
```

## 已知限制（一期）

- AI 较简单（无蒙特卡洛、无 GTO），仅用于占位
- 无聊天（联机才有意义）
- 无手牌历史回放
- 音效是 WebAudio 合成的简单提示音（二期换真实音频）
- 账号密码写死前端（朋友局够用，对外不要部署）

## 测试场景建议

1. 登录 player01 → 创建房间（5 个 AI）→ 开打
2. 切到极小起始筹码（如 200）测试破产补码
3. 切到 0 个 AI（自己一个人）会卡住——一期不允许，已自动给 5 个 AI
4. 改名后再开局，看名字是否正确显示
