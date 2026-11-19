import { ArrowUp, Columns2, Square } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TONE_BY_ID } from '../lib/tones';
import { CompareBar } from './CompareBar';
import { ThinkingPicker } from './ThinkingPicker';
import { ToneToggle } from './ToneToggle';

export const MAX_CHARS = 8000;

export function Composer({
  tone,
  onToneChange,
  thinking,
  onThinkingChange,
  models = [],
  modelId,
  compare = { enabled: false },
  onToggleCompare,
  onCompareChange,
  onSend,
  onStop,
  isStreaming,
  disabled,
  blockedReason,
  focusKey,
}) {
  const [value, setValue] = useState('');
  const textareaRef = useRef(null);

  // Grow with the content up to a limit, then scroll.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  useEffect(() => {
    textareaRef.current?.focus({ preventScroll: true });
  }, [focusKey]);

  const blocked = Boolean(blockedReason);
  const canSend = value.trim().length > 0 && !isStreaming && !disabled && !blocked;

  const submit = () => {
    if (!canSend) return;
    onSend(value);
    setValue('');
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const nearLimit = value.length > MAX_CHARS - 1000;
  const hint = blockedReason ?? (compare.enabled ? 'Your next message will get two answers side by side.' : TONE_BY_ID[tone].hint);

  return (
    <div className="shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-6 sm:pb-5">
      <form
        data-tone={tone}
        aria-label="Message composer"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="mx-auto w-full max-w-3xl rounded-[22px] border-[1.5px] border-tone/45 bg-surface shadow-[0_10px_30px_-18px_rgba(0,0,0,0.35)] transition-[border-color,box-shadow] duration-300 focus-within:border-tone focus-within:ring-4 focus-within:ring-tone/15"
      >
        {compare.enabled && (
          <CompareBar
            models={models}
            modelId={modelId}
            tone={tone}
            compare={compare}
            onChange={onCompareChange}
            onClose={() => onToggleCompare(false)}
          />
        )}

        <label htmlFor="composer-input" className="sr-only">
          Message
        </label>
        <textarea
          id="composer-input"
          ref={textareaRef}
          rows={1}
          value={value}
          maxLength={MAX_CHARS}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={blocked ? 'Choose an answer above to continue' : 'Message MyAi'}
          aria-describedby="composer-hint"
          className="block max-h-[220px] w-full resize-none bg-transparent px-4 pb-2 pt-3.5 text-[15px] leading-relaxed text-ink placeholder:text-faint focus:outline-none focus-visible:outline-none sm:px-5"
        />

        <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 px-2 pb-2 sm:px-2.5">
          <ToneToggle value={tone} onChange={onToneChange} />

          <div className="ml-auto flex items-center gap-1">
            <ThinkingPicker value={thinking} onChange={onThinkingChange} />
            <button
              type="button"
              aria-pressed={compare.enabled}
              aria-label="Compare two answers"
              title="Compare two answers side by side"
              onClick={() => onToggleCompare()}
              className={`flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium transition-colors ${
                compare.enabled ? 'bg-ink text-canvas' : 'text-muted hover:bg-sunken hover:text-ink'
              }`}
            >
              <Columns2 className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Compare</span>
            </button>

            {nearLimit && (
              <span className="px-1 text-xs tabular-nums text-faint" aria-live="polite">
                {value.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
              </span>
            )}
            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop generating"
                title="Stop generating"
                className="ml-1 grid size-10 place-items-center rounded-full bg-ink text-canvas transition-transform active:scale-95"
              >
                <Square className="size-3.5" fill="currentColor" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                aria-label="Send message"
                title="Send message"
                className="ml-1 grid size-10 place-items-center rounded-full bg-tone text-on-tone transition-[background-color,color,transform] duration-200 active:scale-95 disabled:cursor-not-allowed disabled:bg-sunken disabled:text-faint"
              >
                <ArrowUp className="size-5" strokeWidth={2.25} />
              </button>
            )}
          </div>
        </div>
      </form>
      <p id="composer-hint" className="mx-auto mt-2 max-w-3xl px-2 text-center text-xs text-faint">
        {hint}
        {!blocked && <span className="hidden sm:inline"> Shift+Enter adds a new line.</span>}
      </p>
    </div>
  );
}
