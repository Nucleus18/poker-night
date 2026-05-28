import { useEffect, useState } from 'react';

export type ActionScenario = 'check' | 'call' | 'allin' | 'wait';

interface BetPanelProps {
  scenario: ActionScenario;
  toCall: number;        // 我需要跟的金额
  myStack: number;       // 我剩余筹码
  pot: number;           // 当前底池
  minBet: number;        // 最小下注/加注
  maxBet: number;        // 最大（= myStack）
  step: number;
  bigBlind: number;
  onFold: () => void;
  onCheck: () => void;
  onCall: () => void;
  onBet: (amount: number) => void;     // BET 或 RAISE TO
  onAllIn: () => void;
}

export default function BetPanel(props: BetPanelProps) {
  const { scenario, toCall, myStack, pot, minBet, maxBet, step, onFold, onCheck, onCall, onBet, onAllIn } = props;
  const [value, setValue] = useState(minBet);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    setValue(Math.max(minBet, Math.min(maxBet, value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minBet, maxBet]);

  const clamp = (v: number) => Math.max(minBet, Math.min(maxBet, v));
  const setVal = (v: number) => setValue(clamp(v));

  if (scenario === 'wait') {
    return (
      <div className="text-emerald-100/40 text-sm py-3">等待其他玩家行动...</div>
    );
  }

  // 主按钮
  let middleBtn: React.ReactNode;
  let rightBtn: React.ReactNode;

  if (scenario === 'check') {
    middleBtn = (
      <button onClick={onCheck} className="btn-action btn-call-style">
        <span className="text-[13px] tracking-[1.5px]">CHECK</span>
      </button>
    );
    rightBtn = (
      <button onClick={() => value >= myStack ? onAllIn() : onBet(value)} className="btn-action btn-bet-style">
        <span className="text-[13px] tracking-[1.5px]">BET</span>
        <span className="text-[15px] font-bold">${value.toLocaleString()}</span>
      </button>
    );
  } else if (scenario === 'call') {
    middleBtn = (
      <button onClick={onCall} className="btn-action btn-call-style">
        <span className="text-[13px] tracking-[1.5px]">CALL</span>
        <span className="text-[15px] font-bold">${toCall.toLocaleString()}</span>
      </button>
    );
    rightBtn = (
      <button
        onClick={() => value >= myStack ? onAllIn() : onBet(value)}
        className="btn-action btn-bet-style"
        disabled={maxBet < minBet}
      >
        <span className="text-[13px] tracking-[1.5px]">RAISE TO</span>
        <span className="text-[15px] font-bold">${value.toLocaleString()}</span>
      </button>
    );
  } else {
    // allin: 我筹码 < toCall
    middleBtn = (
      <button onClick={onAllIn} className="btn-action btn-call-style">
        <span className="text-[13px] tracking-[1.5px]">CALL</span>
        <span className="text-[15px] font-bold">${myStack.toLocaleString()}</span>
        <span className="text-[9px] opacity-70 tracking-widest">ALL-IN</span>
      </button>
    );
    rightBtn = (
      <button disabled className="btn-action btn-bet-style opacity-35 grayscale">
        <span className="text-[13px] tracking-[1.5px]">RAISE</span>
      </button>
    );
  }

  // 快捷下注：根据场景
  const quickOpts: { label: string; value: number; key: string }[] = [];
  quickOpts.push({ label: 'Min', value: minBet, key: 'min' });
  if (toCall === 0) {
    quickOpts.push({ label: '½ Pot', value: clamp(Math.round(pot * 0.5)), key: 'half' });
  }
  quickOpts.push({ label: 'Pot', value: clamp(pot), key: 'pot' });
  quickOpts.push({ label: '×2', value: clamp(toCall * 2 || pot * 2), key: 'x2' });
  quickOpts.push({ label: 'All-In', value: maxBet, key: 'allin' });

  const panelDisabled = scenario === 'allin' || maxBet < minBet;

  return (
    <div className="bet-panel flex flex-col items-center gap-3 w-full">
      <div
        className={`bet-amount-panel ${advancedOpen ? 'is-expanded' : ''} flex items-center gap-3.5 bg-[rgba(8,18,14,0.85)] border border-emerald-500/25 rounded-2xl px-4 py-2.5 backdrop-blur-md transition-opacity ${panelDisabled ? 'opacity-40 pointer-events-none' : ''}`}
      >
        {/* Stepper */}
        <div className="bet-stepper flex items-center bg-black/50 border border-white/10 rounded-lg overflow-hidden">
          <button onClick={() => setVal(value - step)} className="w-7 h-9 text-emerald-100/80 hover:bg-emerald-500/15 hover:text-emerald-400 text-base font-semibold">−</button>
          <span className="text-emerald-100/60 px-1 text-[13px]">$</span>
          <input
            type="text"
            value={value.toLocaleString()}
            onChange={(e) => {
              const v = parseInt(e.target.value.replace(/,/g, '')) || 0;
              setVal(v);
            }}
            className="w-[110px] bg-transparent border-none text-white text-center font-semibold text-base outline-none"
          />
          <button onClick={() => setVal(value + step)} className="w-7 h-9 text-emerald-100/80 hover:bg-emerald-500/15 hover:text-emerald-400 text-base font-semibold">+</button>
        </div>

        <button
          type="button"
          className="mobile-advanced-toggle hidden px-2.5 py-1.5 rounded-lg border border-emerald-500/30 text-[11px] text-emerald-200/90 bg-emerald-500/10"
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          {advancedOpen ? '收起' : '调整'}
        </button>

        {/* Slider */}
        <div className="advanced-bet-control bet-slider relative flex-1 min-w-[280px] max-w-[420px] h-9 flex items-center">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 bg-white/10 rounded"></div>
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-1 rounded shadow-[0_0_8px_rgba(16,185,129,0.5)]"
            style={{
              width: `${maxBet > minBet ? ((value - minBet) / (maxBet - minBet)) * 100 : 0}%`,
              background: 'linear-gradient(90deg, #0e8e6c, #10b981)',
            }}
          ></div>
          <input
            type="range"
            min={minBet}
            max={maxBet}
            step={step}
            value={value}
            onChange={(e) => setVal(+e.target.value)}
            className="range-input relative z-10"
          />
          <div
            className="absolute -top-7 -translate-x-1/2 bg-emerald-500 text-[#03100b] text-xs font-bold px-2.5 py-1 rounded whitespace-nowrap pointer-events-none shadow-[0_4px_10px_rgba(16,185,129,0.4)]"
            style={{ left: `${maxBet > minBet ? ((value - minBet) / (maxBet - minBet)) * 100 : 0}%` }}
          >
            ${value.toLocaleString()}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-emerald-500"></div>
          </div>
        </div>

        {/* Quick bets */}
        <div className="advanced-bet-control quick-bets flex gap-1.5">
          {quickOpts.map((q) => (
            <button
              key={q.key}
              onClick={() => setVal(q.value)}
              className={`min-w-[60px] px-2.5 py-1.5 text-[11px] font-semibold tracking-wider rounded-lg border transition-all ${
                value === q.value
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400 shadow-[inset_0_0_8px_rgba(16,185,129,0.2)]'
                  : 'border-white/10 bg-white/5 text-emerald-100/70 hover:border-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400'
              }`}
            >
              {q.label}
              <div className={`text-[9px] font-normal mt-0.5 ${value === q.value ? 'text-emerald-400/70' : 'text-emerald-100/40'}`}>
                ${q.value.toLocaleString()}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 主按钮 */}
      <div className="action-buttons flex gap-3">
        <button onClick={onFold} className="btn-action btn-fold-style">
          <span className="text-[13px] tracking-[1.5px]">FOLD</span>
        </button>
        {middleBtn}
        {rightBtn}
      </div>
    </div>
  );
}
