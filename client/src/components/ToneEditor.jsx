import { RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { TONE_BY_ID, TONES } from '../lib/tones';

export const MAX_INSTRUCTION_CHARS = 2000;

/**
 * Settings panel for the text behind each tone. Saved instructions live in
 * MongoDB and are added to the system prompt of every new reply.
 */
export function ToneEditor({ open, onClose, initialTone = 'professional' }) {
  const [tones, setTones] = useState(null);
  const [loadState, setLoadState] = useState('loading'); // loading | ready | error
  const [activeId, setActiveId] = useState(initialTone);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { kind: 'ok' | 'error', text }
  const textareaRef = useRef(null);
  const returnFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const { tones: list } = await api.listTones();
      setTones(list);
      setDrafts(Object.fromEntries(list.map((t) => [t.id, t.instruction])));
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    returnFocusRef.current = document.activeElement;
    setActiveId(initialTone);
    setMessage(null);
    load();
    const onKey = (event) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      returnFocusRef.current?.focus?.();
    };
  }, [open, initialTone, load]);

  useEffect(() => {
    if (open && loadState === 'ready') textareaRef.current?.focus();
  }, [open, loadState, activeId]);

  if (!open) return null;

  const current = tones?.find((t) => t.id === activeId);
  const draft = drafts[activeId] ?? '';
  const trimmed = draft.trim();
  const dirty = Boolean(current) && trimmed !== current.instruction;
  const tooLong = trimmed.length > MAX_INSTRUCTION_CHARS;
  const preview = current?.systemPrompt.replace(current.instruction, trimmed || current.defaultInstruction);

  const applyResult = (tone, text) => {
    setTones((prev) => prev.map((t) => (t.id === tone.id ? tone : t)));
    setDrafts((prev) => ({ ...prev, [tone.id]: tone.instruction }));
    setMessage({ kind: 'ok', text });
  };

  const save = async () => {
    if (!trimmed || tooLong || !dirty) return;
    setBusy(true);
    try {
      const { tone } = await api.saveTone(activeId, trimmed);
      applyResult(tone, `Saved. New ${tone.label.toLowerCase()} replies will follow this instruction.`);
    } catch (error) {
      setMessage({ kind: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      const { tone } = await api.resetTone(activeId);
      applyResult(tone, `${tone.label} is back to its default instruction.`);
    } catch (error) {
      setMessage({ kind: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tone-editor-title"
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-surface shadow-[0_30px_80px_-30px_rgba(0,0,0,0.5)] sm:rounded-3xl"
      >
        <div className="flex items-start gap-3 px-5 pb-3 pt-5 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 id="tone-editor-title" className="font-display text-xl font-semibold tracking-[-0.015em]">
              Tone instructions
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Each tone adds this text to the system prompt. Edit it to change how replies sound.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tone instructions"
            className="grid size-9 place-items-center rounded-full text-muted hover:bg-sunken hover:text-ink"
          >
            <X className="size-5" />
          </button>
        </div>

        <div role="tablist" aria-label="Tones" className="flex gap-1 border-b border-line px-4 sm:px-5">
          {TONES.map((tone) => {
            const selected = tone.id === activeId;
            const saved = tones?.find((t) => t.id === tone.id);
            const unsaved = saved && (drafts[tone.id] ?? '').trim() !== saved.instruction;
            return (
              <button
                key={tone.id}
                type="button"
                role="tab"
                id={`tone-tab-${tone.id}`}
                aria-selected={selected}
                aria-controls="tone-panel"
                data-tone={tone.id}
                onClick={() => {
                  setActiveId(tone.id);
                  setMessage(null);
                }}
                className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  selected ? 'border-tone text-ink' : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                <span className="size-2 rounded-full bg-tone" aria-hidden="true" />
                {tone.label}
                {saved?.customized && <span className="text-xs font-normal text-faint">edited</span>}
                {unsaved && <span className="sr-only">(unsaved changes)</span>}
                {unsaved && <span className="size-1.5 rounded-full bg-ink" aria-hidden="true" />}
              </button>
            );
          })}
        </div>

        <div id="tone-panel" role="tabpanel" aria-labelledby={`tone-tab-${activeId}`} className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {loadState === 'loading' && <div className="h-40 animate-pulse rounded-xl bg-sunken" aria-label="Loading" />}
          {loadState === 'error' && (
            <p className="text-[13px] text-muted">
              Couldn’t load the tone settings.{' '}
              <button type="button" onClick={load} className="font-medium text-ink underline underline-offset-2">
                Try again
              </button>
            </p>
          )}
          {loadState === 'ready' && current && (
            <div data-tone={activeId}>
              <label htmlFor="tone-instruction" className="text-sm font-medium text-ink">
                Instruction for {TONE_BY_ID[activeId].label}
              </label>
              <textarea
                id="tone-instruction"
                ref={textareaRef}
                rows={6}
                value={draft}
                onChange={(event) => {
                  setDrafts((prev) => ({ ...prev, [activeId]: event.target.value }));
                  setMessage(null);
                }}
                className="mt-2 block w-full resize-y rounded-xl border-[1.5px] border-line bg-canvas px-3.5 py-3 text-[14px] leading-relaxed text-ink focus:border-tone focus:outline-none"
              />
              <div className="mt-1.5 flex items-center justify-between text-xs text-faint">
                <span>{current.customized ? 'Custom instruction' : 'Default instruction'}</span>
                <span className={`tabular-nums ${tooLong ? 'text-danger' : ''}`}>
                  {trimmed.length.toLocaleString()} / {MAX_INSTRUCTION_CHARS.toLocaleString()}
                </span>
              </div>

              <details className="mt-4 rounded-xl border border-line">
                <summary className="cursor-pointer select-none px-3.5 py-2.5 text-[13px] font-medium text-muted hover:text-ink">
                  Preview the full system prompt
                </summary>
                <pre className="whitespace-pre-wrap border-t border-line px-3.5 py-3 font-mono text-[12px] leading-relaxed text-muted">
                  {preview}
                </pre>
              </details>

              {message && (
                <p role={message.kind === 'error' ? 'alert' : 'status'} className={`mt-3 text-[13px] ${message.kind === 'error' ? 'text-danger' : 'text-muted'}`}>
                  {message.text}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={reset}
            disabled={busy || loadState !== 'ready' || !current?.customized}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-sunken hover:text-ink disabled:opacity-40"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Reset to default
          </button>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl px-3.5 py-2 text-sm font-medium text-muted hover:bg-sunken hover:text-ink">
              Close
            </button>
            <button
              type="button"
              data-tone={activeId}
              onClick={save}
              disabled={busy || !dirty || !trimmed || tooLong}
              className="rounded-xl bg-tone px-4 py-2 text-sm font-medium text-on-tone transition-opacity disabled:cursor-not-allowed disabled:bg-sunken disabled:text-faint"
            >
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
