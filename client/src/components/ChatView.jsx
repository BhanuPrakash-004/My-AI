import { ArrowDown, GitBranch } from 'lucide-react';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Exchange } from './Message';

const PIN_THRESHOLD = 96;
const NO_BRANCHES = [];

function BranchOrigin({ branchedFrom, onOpenConversation }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] leading-relaxed text-muted">
      <GitBranch className="mt-0.5 size-4 shrink-0 text-ink" aria-hidden="true" />
      <p>
        Branched from{' '}
        {branchedFrom.exists ? (
          <button
            type="button"
            onClick={() => onOpenConversation(branchedFrom.conversationId)}
            className="font-medium text-ink underline underline-offset-2"
          >
            {branchedFrom.title ?? 'the original chat'}
          </button>
        ) : (
          <span className="font-medium text-ink">{branchedFrom.title ?? 'a chat'} (deleted)</span>
        )}
        . Changes here don’t affect the original.
      </p>
    </div>
  );
}

function BranchDivider() {
  return (
    <div className="flex items-center gap-3 text-xs font-medium text-faint" role="separator" aria-label="New branch starts here">
      <span className="h-px flex-1 bg-line" />
      <GitBranch className="size-3.5" aria-hidden="true" />
      New branch starts here
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/** Scrollable conversation. Follows the stream unless the user scrolls up. */
export function ChatView({
  conversation,
  isStreaming,
  tone,
  onRewrite,
  onBranch,
  onSelect,
  onOpenConversation,
  modelsById,
  showModel,
}) {
  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  const pinnedRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const exchanges = conversation.exchanges;
  const lastIndex = exchanges.length - 1;
  const branchPoint = conversation.branchedFrom?.copiedCount ?? null;

  const branchesByExchange = useMemo(() => {
    const map = new Map();
    for (const branch of conversation.branches ?? []) {
      if (!map.has(branch.exchangeId)) map.set(branch.exchangeId, []);
      map.get(branch.exchangeId).push(branch);
    }
    return map;
  }, [conversation.branches]);

  const scrollToBottom = useCallback((behavior = 'auto') => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedRef.current = distance < PIN_THRESHOLD;
    setShowJump(distance > 320);
  };

  // Jump to the end when a different conversation opens or a message is added.
  useLayoutEffect(() => {
    pinnedRef.current = true;
    scrollToBottom();
  }, [conversation._id, exchanges.length, scrollToBottom]);

  // Keep following while the reply grows, if the user is at the bottom.
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return undefined;
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) scrollToBottom();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [scrollToBottom]);

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={handleScroll} className="@container h-full overflow-y-auto overflow-x-hidden overscroll-contain">
        <div ref={contentRef} className="mx-auto w-full max-w-3xl space-y-9 px-4 pb-8 pt-6 sm:px-6">
          {conversation.branchedFrom && (
            <BranchOrigin branchedFrom={conversation.branchedFrom} onOpenConversation={onOpenConversation} />
          )}
          {exchanges.map((exchange, index) => (
            <Fragment key={exchange._id}>
              {branchPoint !== null && index === branchPoint && <BranchDivider />}
              <Exchange
                exchange={exchange}
                isLast={index === lastIndex}
                canAct={!isStreaming}
                currentTone={tone}
                onRewrite={onRewrite}
                onBranch={onBranch}
                onSelect={onSelect}
                onOpenConversation={onOpenConversation}
                modelsById={modelsById}
                showModel={showModel}
                branches={branchesByExchange.get(exchange._id) ?? NO_BRANCHES}
              />
            </Fragment>
          ))}
        </div>
      </div>

      {showJump && (
        <button
          type="button"
          onClick={() => {
            pinnedRef.current = true;
            scrollToBottom('smooth');
          }}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] font-medium text-ink shadow-[0_6px_20px_-8px_rgba(0,0,0,0.35)] transition-colors hover:bg-sunken"
        >
          <ArrowDown className="size-3.5" aria-hidden="true" />
          Jump to latest
        </button>
      )}
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="min-h-0 flex-1 overflow-hidden" aria-busy="true" aria-label="Loading conversation">
      <div className="mx-auto w-full max-w-3xl animate-pulse space-y-9 px-4 pt-6 sm:px-6">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-4">
            <div className="ml-auto h-11 w-2/5 rounded-[20px] bg-sunken" />
            <div className="h-28 w-full rounded-[20px] bg-sunken" />
          </div>
        ))}
      </div>
    </div>
  );
}
