import { Check, CircleAlert, Copy, GitBranch, RefreshCw } from 'lucide-react';
import { memo, useState } from 'react';
import { useCopy } from '../hooks/useCopy';
import { useSmoothText } from '../hooks/useSmoothText';
import { formatTimestamp } from '../lib/format';
import { THINKING_BY_ID } from '../lib/thinking';
import { TONE_BY_ID } from '../lib/tones';
import { Markdown } from './Markdown';

const isTemp = (id) => String(id).startsWith('temp-');
const modelLabel = (modelsById, modelId, model) => modelsById?.[modelId]?.label ?? model ?? null;

function UserBubble({ exchange }) {
  return (
    <div className="flex flex-col items-end">
      <div className="max-w-[88%] whitespace-pre-wrap rounded-[20px] rounded-tr-md bg-user px-4 py-2.5 text-[15px] leading-relaxed text-user-ink [overflow-wrap:anywhere] sm:max-w-[78%]">
        {exchange.prompt}
      </div>
      <time dateTime={exchange.timestamp} className="mt-1 pr-1 text-xs text-faint">
        {formatTimestamp(exchange.timestamp)}
      </time>
    </div>
  );
}

function Thinking({ label = 'Thinking' }) {
  return (
    <div className="flex items-center gap-2.5 py-1 text-sm text-muted">
      <span className="flex items-center gap-1" aria-hidden="true">
        <span className="thinking-dot" />
        <span className="thinking-dot" />
        <span className="thinking-dot" />
      </span>
      {label}
    </div>
  );
}

function Note({ children }) {
  return <p className="mt-3 border-t border-line pt-2.5 text-[13px] text-muted">{children}</p>;
}

function ActionButton({ children, className = 'hover:text-ink', ...props }) {
  return (
    <button
      type="button"
      className={`flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-sunken disabled:opacity-40 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function ToneTag({ tone }) {
  const meta = TONE_BY_ID[tone] ?? TONE_BY_ID.professional;
  const Icon = meta.icon;
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-tone-strong">
      <Icon className="size-3.5" strokeWidth={2.25} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

/** Small details under a reply: thinking level and (when several are configured) the model. */
function ReplyDetails({ exchange, modelsById, showModel }) {
  const level = THINKING_BY_ID[exchange.thinking];
  const LevelIcon = level?.icon;
  const label = showModel ? modelLabel(modelsById, exchange.modelId, exchange.model) : null;
  return (
    <>
      {level && (
        <span className="flex items-center gap-1 px-1.5" title={`Thinking level: ${level.label}`}>
          <LevelIcon className="size-3.5" aria-hidden="true" />
          {level.label}
        </span>
      )}
      {label && <span className="px-1.5">{label}</span>}
    </>
  );
}

function StatusNotes({ status, stopReason, response }) {
  return (
    <>
      {status === 'stopped' && <Note>{response ? 'Stopped before the reply finished.' : 'Stopped before a reply started.'}</Note>}
      {stopReason === 'refusal' && <Note>The model declined to answer this request. Try rephrasing it.</Note>}
      {stopReason === 'max_tokens' && <Note>This reply reached the length limit and was cut off.</Note>}
    </>
  );
}

function ErrorNote({ message, onRetry }) {
  return (
    <div className="mt-1 flex flex-col items-start gap-2 text-[14px] text-danger" role="alert">
      <p className="flex items-start gap-2">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{message || 'The reply could not be generated.'}</span>
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-6 flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[13px] text-ink transition-colors hover:bg-sunken"
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Try again
        </button>
      )}
    </div>
  );
}

function BranchLinks({ branches, onOpenConversation }) {
  if (!branches.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-1 text-xs text-muted">
      <GitBranch className="size-3.5" aria-hidden="true" />
      <span>Branched into</span>
      {branches.map((b) => (
        <button
          key={b._id}
          type="button"
          onClick={() => onOpenConversation(b._id)}
          className="max-w-[16rem] truncate rounded-md border border-line bg-surface px-2 py-0.5 text-ink transition-colors hover:bg-sunken"
        >
          {b.title}
        </button>
      ))}
    </div>
  );
}

/** The losing side of a finished comparison, shown on demand. */
function OtherAnswer({ exchange, modelsById }) {
  const [open, setOpen] = useState(false);
  const otherIndex = exchange.selectedCandidate === 0 ? 1 : 0;
  const other = exchange.candidates?.[otherIndex];
  const chosen = exchange.candidates?.[exchange.selectedCandidate];
  if (!other || !chosen) return null;

  return (
    <div className="mt-3 border-t border-line pt-2.5 text-[13px] text-muted">
      <p>
        Kept answer {chosen.label} from a side-by-side comparison.{' '}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="font-medium text-ink underline underline-offset-2"
        >
          {open ? 'Hide' : 'Show'} answer {other.label}
        </button>
      </p>
      {open && (
        <div data-tone={other.tone} className="mt-2.5 rounded-xl border border-dashed border-line px-3.5 py-3 text-ink">
          <div className="mb-1 flex items-center gap-2">
            <ToneTag tone={other.tone} />
            <span className="text-xs text-faint">{modelLabel(modelsById, other.modelId, other.model)}</span>
          </div>
          {other.response ? <Markdown content={other.response} /> : <p className="text-muted">No answer.</p>}
        </div>
      )}
    </div>
  );
}

function AssistantBubble({
  exchange,
  isLast,
  canAct,
  currentTone,
  onRewrite,
  onBranch,
  modelsById,
  showModel,
  branches,
  onOpenConversation,
}) {
  const streaming = exchange.status === 'streaming';
  const { text, caughtUp } = useSmoothText(exchange.response, { animate: Boolean(exchange.live), streaming });
  const { copied, copy } = useCopy();

  const settled = !streaming && caughtUp;
  const isError = exchange.status === 'error';
  const canRewrite = canAct && isLast;
  const canBranch = canAct && !isTemp(exchange._id) && !isError;
  const nextTone = TONE_BY_ID[currentTone];
  const rewriteLabel = currentTone === exchange.tone ? 'Regenerate' : `Rewrite as ${nextTone.label}`;

  return (
    <div data-tone={exchange.tone} className="flex flex-col items-start">
      <article
        aria-label={`${TONE_BY_ID[exchange.tone]?.label ?? ''} reply`}
        aria-busy={streaming}
        className="w-full rounded-[20px] rounded-tl-md border border-l-[3px] border-line border-l-tone bg-surface px-4 py-3.5 sm:px-5"
      >
        <div className="mb-1.5">
          <ToneTag tone={exchange.tone} />
        </div>

        {text ? <Markdown content={text} streaming={streaming || !caughtUp} /> : streaming && <Thinking />}

        {settled && <StatusNotes status={exchange.status} stopReason={exchange.stopReason} response={exchange.response} />}
        {settled && exchange.mode === 'compare' && exchange.selectedCandidate !== null && (
          <OtherAnswer exchange={exchange} modelsById={modelsById} />
        )}
        {isError && <ErrorNote message={exchange.error} onRetry={canRewrite ? () => onRewrite(exchange) : null} />}
      </article>

      {settled && !isError && (
        <div className="mt-1 flex flex-wrap items-center gap-0.5 text-xs text-faint">
          <ActionButton onClick={() => copy(exchange.response)} disabled={!exchange.response}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </ActionButton>
          {canRewrite && (
            <ActionButton data-tone={currentTone} onClick={() => onRewrite(exchange)} className="text-tone-strong hover:bg-tone/10">
              <RefreshCw className="size-3.5" aria-hidden="true" />
              {rewriteLabel}
            </ActionButton>
          )}
          {canBranch && (
            <ActionButton onClick={() => onBranch(exchange)} title="Start a new chat from this point. The original stays as it is.">
              <GitBranch className="size-3.5" aria-hidden="true" />
              Branch
            </ActionButton>
          )}
          <ReplyDetails exchange={exchange} modelsById={modelsById} showModel={showModel} />
          <time dateTime={exchange.completedAt ?? exchange.timestamp} className="px-1.5">
            {formatTimestamp(exchange.completedAt ?? exchange.timestamp)}
          </time>
        </div>
      )}
      <BranchLinks branches={branches} onOpenConversation={onOpenConversation} />
    </div>
  );
}

function CandidateCard({ exchange, candidate, index, modelsById, onSelect }) {
  const streaming = candidate.status === 'streaming';
  const { text, caughtUp } = useSmoothText(candidate.response, { animate: Boolean(exchange.live), streaming });
  const canChoose = exchange.status === 'choosing' && caughtUp && !streaming && Boolean(candidate.response.trim());
  const label = modelLabel(modelsById, candidate.modelId, candidate.model);

  return (
    <article
      data-tone={candidate.tone}
      aria-label={`Answer ${candidate.label}`}
      aria-busy={streaming}
      className="flex min-w-0 flex-col rounded-[20px] border border-t-[3px] border-line border-t-tone bg-surface"
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-sunken text-xs font-semibold text-ink">
          {candidate.label}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{label}</span>
        <ToneTag tone={candidate.tone} />
      </header>

      <div className="min-h-24 flex-1 px-4 py-3">
        {text ? <Markdown content={text} streaming={streaming || !caughtUp} /> : streaming && <Thinking label="Writing" />}
        {candidate.status === 'error' && <ErrorNote message={candidate.error} />}
        {candidate.status === 'stopped' && caughtUp && (
          <Note>{candidate.response ? 'Stopped before this answer finished.' : 'Stopped before this answer started.'}</Note>
        )}
      </div>

      <footer className="px-3 pb-3">
        <button
          type="button"
          disabled={!canChoose}
          onClick={() => onSelect(exchange, index)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-tone px-3 py-2 text-sm font-medium text-on-tone transition-[opacity,transform] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-sunken disabled:text-faint"
        >
          <Check className="size-4" aria-hidden="true" />
          Keep answer {candidate.label}
        </button>
      </footer>
    </article>
  );
}

function CompareAnswers({ exchange, isLast, canAct, onRewrite, onSelect, modelsById }) {
  const heading =
    exchange.status === 'streaming'
      ? 'Writing two answers side by side.'
      : exchange.status === 'choosing'
        ? 'Two answers are ready. Keep the one you prefer.'
        : null;

  return (
    <div className="flex flex-col gap-2.5">
      {heading && (
        <p className="text-[13px] font-medium text-muted" aria-live="polite">
          {heading}
        </p>
      )}
      {/* Breaks out of the reading column so the two answers get room. */}
      <div className="relative left-1/2 grid w-[min(68rem,calc(100cqw-2rem))] -translate-x-1/2 gap-3 md:grid-cols-2">
        {exchange.candidates.map((candidate, index) => (
          <CandidateCard
            key={candidate.label}
            exchange={exchange}
            candidate={candidate}
            index={index}
            modelsById={modelsById}
            onSelect={onSelect}
          />
        ))}
      </div>
      {exchange.status === 'error' && (
        <ErrorNote message={exchange.error} onRetry={canAct && isLast ? () => onRewrite(exchange) : null} />
      )}
    </div>
  );
}

export const Exchange = memo(function Exchange(props) {
  const { exchange } = props;
  const undecidedCompare = exchange.mode === 'compare' && exchange.candidates?.length && exchange.selectedCandidate === null;
  return (
    <div className="space-y-4">
      <UserBubble exchange={exchange} />
      {undecidedCompare ? <CompareAnswers {...props} /> : <AssistantBubble {...props} />}
    </div>
  );
});
