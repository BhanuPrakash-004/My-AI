import { GitBranch, Pencil, Plus, Search, SlidersHorizontal, Trash, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { groupByRecency } from '../lib/format';
import { TONE_BY_ID } from '../lib/tones';
import { IconButton, LogoMark } from './ui';

function ConversationItem({ conversation, active, onSelect, onRename, onDelete }) {
  const [mode, setMode] = useState('idle'); // idle | rename | confirm
  const [draft, setDraft] = useState(conversation.title);
  const inputRef = useRef(null);

  useEffect(() => {
    if (mode === 'rename') inputRef.current?.select();
  }, [mode]);

  const commitRename = () => {
    const title = draft.trim();
    setMode('idle');
    if (title && title !== conversation.title) onRename(conversation._id, title);
    else setDraft(conversation.title);
  };

  if (mode === 'rename') {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          commitRename();
        }}
        className="px-1 py-0.5"
      >
        <label htmlFor={`rename-${conversation._id}`} className="sr-only">
          Conversation name
        </label>
        <input
          id={`rename-${conversation._id}`}
          ref={inputRef}
          value={draft}
          maxLength={120}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setDraft(conversation.title);
              setMode('idle');
            }
          }}
          className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-ink/40 focus:outline-none"
        />
      </form>
    );
  }

  if (mode === 'confirm') {
    return (
      <div className="rounded-lg border border-line bg-surface p-2.5" role="group" aria-label="Confirm delete">
        <p className="text-[13px] leading-snug text-ink">
          Delete <span className="font-medium">“{conversation.title}”</span>? This can’t be undone.
        </p>
        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            autoFocus
            onClick={() => onDelete(conversation._id)}
            className="rounded-md bg-danger px-2.5 py-1 text-xs font-medium text-white dark:text-sunken"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setMode('idle')}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-muted hover:bg-sunken hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const toneLabel = TONE_BY_ID[conversation.lastTone]?.label;

  return (
    <div
      className={`group relative flex items-center rounded-lg transition-colors ${
        active
          ? 'bg-surface text-ink shadow-[inset_3px_0_0_var(--accent),0_1px_2px_rgba(0,0,0,0.08)]'
          : 'text-muted hover:bg-surface hover:text-ink'
      }`}
    >
      <button
        type="button"
        onClick={() => onSelect(conversation._id)}
        aria-current={active ? 'page' : undefined}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-2 pl-3 pr-2 text-left text-sm"
      >
        <span
          data-tone={conversation.lastTone}
          className="size-2 shrink-0 rounded-full bg-tone"
          title={toneLabel ? `Last reply: ${toneLabel}` : undefined}
          aria-hidden="true"
        />
        {conversation.isBranch && (
          <GitBranch className="size-3.5 shrink-0 text-faint" aria-label="Branch" role="img" />
        )}
        <span className={`truncate ${active ? 'font-medium' : ''}`}>{conversation.title}</span>
      </button>
      <div
        className={`items-center pr-1 ${active ? 'flex' : 'hidden group-hover:flex group-focus-within:flex'}`}
      >
        <button
          type="button"
          onClick={() => {
            setDraft(conversation.title);
            setMode('rename');
          }}
          aria-label={`Rename “${conversation.title}”`}
          title="Rename"
          className="grid size-7 place-items-center rounded-md text-faint hover:bg-sunken hover:text-ink"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setMode('confirm')}
          aria-label={`Delete “${conversation.title}”`}
          title="Delete"
          className="grid size-7 place-items-center rounded-md text-faint hover:bg-sunken hover:text-danger"
        >
          <Trash className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function StatusLine({ health, onRetry, onOpenToneEditor }) {
  let dot = 'bg-faint';
  let label = 'Connecting to server…';
  if (health.status === 'offline') {
    dot = 'bg-danger';
    label = 'Server offline';
  } else if (health.status === 'ok' && health.demo) {
    dot = 'bg-casual';
    label = 'Demo mode, sample replies';
  } else if (health.status === 'ok') {
    const models = health.models ?? [];
    dot = 'bg-accent';
    label = models.length > 1 ? `${models.length} models connected` : models[0]?.label ?? 'Connected';
  }

  return (
    <div className="border-t border-line px-2 py-2">
      <button
        type="button"
        onClick={onOpenToneEditor}
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-ink"
      >
        <SlidersHorizontal className="size-4" aria-hidden="true" />
        Tone settings
      </button>
      <div className="flex items-center gap-2 px-2.5 pb-1 pt-1.5 text-xs text-muted">
        <span className={`size-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {health.status === 'offline' && (
          <button type="button" onClick={onRetry} className="font-medium text-ink underline underline-offset-2">
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

export function Sidebar({
  open,
  onClose,
  conversations,
  listState,
  query,
  onQueryChange,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  health,
  onRetry,
  onOpenToneEditor,
}) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const groups = useMemo(() => groupByRecency(conversations), [conversations]);
  const hidden = !isDesktop && !open;

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/55 transition-opacity duration-200 md:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        aria-label="Conversation history"
        inert={hidden}
        className={`fixed inset-y-0 left-0 z-40 flex w-[min(18rem,86vw)] flex-col border-r border-line bg-sidebar transition-transform duration-200 ease-out md:static md:z-auto md:w-72 md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
          <LogoMark className="size-6" />
          <span className="flex-1 font-display text-[19px] font-semibold tracking-[-0.02em]">MyAi</span>
          <IconButton label="Close history" onClick={onClose} className="md:hidden">
            <X className="size-4.5" />
          </IconButton>
        </div>

        <div className="space-y-2 px-3 pb-3">
          <button
            type="button"
            onClick={onNew}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-on-accent shadow-[0_6px_18px_-8px_var(--accent)] transition-[filter,transform] hover:brightness-105 active:scale-[0.99]"
          >
            <Plus className="size-4" strokeWidth={2.25} />
            New chat
          </button>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <label htmlFor="conversation-search" className="sr-only">
              Search conversations
            </label>
            <input
              id="conversation-search"
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search chats"
              className="w-full rounded-xl border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-faint focus:border-ink/30 focus:outline-none"
            />
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="Past conversations">
          {listState === 'loading' && (
            <div className="space-y-2 px-1 pt-2" aria-label="Loading conversations">
              {[72, 56, 64, 48].map((w) => (
                <div key={w} className="h-8 animate-pulse rounded-lg bg-line/60" style={{ width: `${w}%` }} />
              ))}
            </div>
          )}

          {listState === 'error' && (
            <p className="px-3 pt-2 text-[13px] leading-relaxed text-muted">
              Couldn’t load your conversations.{' '}
              <button type="button" onClick={onRetry} className="font-medium text-ink underline underline-offset-2">
                Try again
              </button>
            </p>
          )}

          {listState === 'ready' && conversations.length === 0 && (
            <p className="px-3 pt-2 text-[13px] leading-relaxed text-muted">
              {query.trim()
                ? `No chats match “${query.trim()}”.`
                : 'No conversations yet. Your chats will be saved here.'}
            </p>
          )}

          {listState === 'ready' &&
            groups.map((group) => (
              <section key={group.label} className="mt-3 first:mt-1">
                <h2 className="px-3 pb-1 text-xs font-medium text-faint">{group.label}</h2>
                <ul className="space-y-px">
                  {group.items.map((conversation) => (
                    <li key={conversation._id}>
                      <ConversationItem
                        conversation={conversation}
                        active={conversation._id === activeId}
                        onSelect={onSelect}
                        onRename={onRename}
                        onDelete={onDelete}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </nav>

        <StatusLine health={health} onRetry={onRetry} onOpenToneEditor={onOpenToneEditor} />
      </aside>
    </>
  );
}
