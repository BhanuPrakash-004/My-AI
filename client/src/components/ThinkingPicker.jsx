import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { THINKING_BY_ID, THINKING_LEVELS } from '../lib/thinking';

/** Per-message reasoning depth: Fast, Balanced or Deep. */
export function ThinkingPicker({ value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const current = THINKING_BY_ID[value] ?? THINKING_LEVELS[1];
  const Icon = current.icon;

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Thinking level: ${current.label}`}
        title="Thinking level"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-sunken hover:text-ink disabled:opacity-40"
      >
        <Icon className="size-4" strokeWidth={2} aria-hidden="true" />
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown className="hidden size-3.5 sm:block" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="radiogroup"
          aria-label="Thinking level"
          className="absolute bottom-full right-0 z-30 mb-2 w-[16.5rem] rounded-2xl border border-line bg-surface p-1.5 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.45)]"
        >
          <p className="px-3 pb-1 pt-1.5 text-xs text-faint">How much should the model think?</p>
          {THINKING_LEVELS.map((level) => {
            const checked = level.id === value;
            const LevelIcon = level.icon;
            return (
              <button
                key={level.id}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => {
                  onChange(level.id);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-sunken ${
                  checked ? 'bg-sunken/70' : ''
                }`}
              >
                <LevelIcon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{level.label}</span>
                  <span className="block text-xs leading-snug text-muted">{level.description}</span>
                </span>
                {checked && <Check className="mt-0.5 size-4 shrink-0 text-ink" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
