import { useEffect, useState } from 'react';

export type ActionScenario = 'check' | 'call' | 'allin' | 'wait';

interface BetPanelProps {
  scenario: ActionScenario;
  toCall: number;
  myStack: number;
  pot: number;
  minBet: number;
  maxBet: number;
  step: number;
  bigBlind: number;
  onFold: () => void;
  onCheck: () => void;
  onCall: () => void;
  onBet: (amount: number) => void;
  onAllIn: () => void;
}

export default function BetPanel(props: BetPanelProps) {
  const { scenario, toCall, myStack, pot, minBet, maxBet, step, onFold, onCheck, onCall, onBet, onAllIn } = props;
  const [value, setValue] = useState(minBet);
  const [raiseOpen, setRaiseOpen] = useState(false);

  useEffect(() => {
    setValue((cur) => Math.max(minBet, Math.min(maxBet, cur)));
    setRaiseOpen(false);
  }, [scenario, minBet, maxBet]);

  const clamp = (v: number) => Math.max(minBet, Math.min(maxBet, v));
  const setVal = (v: number) => setValue(clamp(v));

  if (scenario === 'wait') {
    return null;
  }

  const panelDisabled = scenario === 'allin' || maxBet < minBet;
  const progress = maxBet > minBet ? ((value - minBet) / (maxBet - minBet)) * 100 : 0;
  const quickOpts: { label: string; value: number; key: string }[] = [
    { label: 'Min', value: minBet, key: 'min' },
    { label: 'Pot', value: clamp(pot), key: 'pot' },
    { label: '×2', value: clamp(toCall * 2 || pot * 2), key: 'x2' },
    { label: 'All-In', value: maxBet, key: 'allin' },
  ];

  const submitBet = () => {
    if (panelDisabled) return;
    if (value >= myStack) onAllIn();
    else onBet(value);
  };

  const onRaiseButton = () => {
    if (panelDisabled) return;
    if (!raiseOpen) {
      setRaiseOpen(true);
      return;
    }
    submitBet();
  };

  const middleBtn = scenario === 'check' ? (
    <button onClick={onCheck} className="btn-action btn-call-style">
      <span className="text-[13px] tracking-[1.5px]">CHECK</span>
    </button>
  ) : scenario === 'call' ? (
    <button onClick={onCall} className="btn-action btn-call-style">
      <span className="text-[13px] tracking-[1.5px]">CALL</span>
      <span className="text-[15px] font-bold">{toCall.toLocaleString()}</span>
    </button>
  ) : (
    <button onClick={onAllIn} className="btn-action btn-call-style">
      <span className="text-[13px] tracking-[1.5px]">CALL</span>
      <span className="text-[15px] font-bold">{myStack.toLocaleString()}</span>
      <span className="text-[9px] opacity-70 tracking-widest">ALL-IN</span>
    </button>
  );

  const rightLabel = scenario === 'check' ? 'BET' : 'RAISE TO';

  return (
    <div className="bet-panel fixed bottom-4 right-4 z-[56] pointer-events-none">
      <div className="relative inline-flex flex-col items-end gap-2 pointer-events-auto">
        {raiseOpen && !panelDisabled && (
          <div className="raise-popover w-[150px] rounded-2xl border border-emerald-400/30 bg-[rgba(3,10,8,0.82)] p-2 shadow-[0_14px_32px_rgba(0,0,0,0.66),0_0_18px_rgba(16,185,129,0.16)] backdrop-blur-md">
            <div className="mb-2 rounded-xl border border-emerald-300/25 bg-emerald-400/12 px-2 py-1.5 text-center text-sm font-extrabold text-emerald-100 shadow-[inset_0_0_12px_rgba(16,185,129,0.14)]">
              {value.toLocaleString()}
            </div>
            <div className="flex items-stretch gap-2">
              <div className="flex flex-col items-center gap-1.5">
                <button onClick={() => setVal(value + step)} className="bet-rail-step h-7 w-7 rounded-full border border-white/10 bg-white/[0.06] text-base font-bold text-emerald-100/90 hover:border-emerald-300/60 hover:bg-emerald-400/15">+</button>
                <div className="relative flex h-[126px] w-8 items-center justify-center">
                  <div className="absolute h-full w-1 rounded-full bg-white/10" />
                  <div className="absolute bottom-0 w-1 rounded-full bg-gradient-to-t from-emerald-700 to-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.55)]" style={{ height: `${progress}%` }} />
                  <input
                    type="range"
                    min={minBet}
                    max={maxBet}
                    step={step}
                    value={value}
                    onChange={(e) => setVal(+e.target.value)}
                    className="bet-rail-range relative z-10 h-[126px] w-8 cursor-grab"
                    style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                  />
                </div>
                <button onClick={() => setVal(value - step)} className="bet-rail-step h-7 w-7 rounded-full border border-white/10 bg-white/[0.06] text-base font-bold text-emerald-100/90 hover:border-emerald-300/60 hover:bg-emerald-400/15">−</button>
              </div>
              <div className="grid flex-1 grid-cols-1 gap-1.5">
                {quickOpts.map((q) => (
                  <button
                    key={q.key}
                    onClick={() => setVal(q.value)}
                    className={`rounded-lg border px-1.5 py-1.5 text-[10px] font-bold tracking-wide transition-all ${
                      value === q.value
                        ? 'border-emerald-300/75 bg-emerald-400/20 text-emerald-100 shadow-[inset_0_0_10px_rgba(16,185,129,0.22)]'
                        : 'border-white/10 bg-white/[0.055] text-emerald-100/70 hover:border-emerald-300/55 hover:bg-emerald-400/12'
                    }`}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="action-buttons flex gap-3">
          <button onClick={onFold} className="btn-action btn-fold-style">
            <span className="text-[13px] tracking-[1.5px]">FOLD</span>
          </button>
          {middleBtn}
          <button
            onClick={onRaiseButton}
            className={`btn-action btn-bet-style ${raiseOpen ? 'ring-2 ring-emerald-300/70' : ''}`}
            disabled={panelDisabled}
          >
            <span className="text-[13px] tracking-[1.5px]">{rightLabel}</span>
            <span className="text-[15px] font-bold">{value.toLocaleString()}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
