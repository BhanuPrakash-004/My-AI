import { FlaskConical, Menu, Moon, SquarePen, Sun, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChatSkeleton, ChatView } from './components/ChatView';
import { Composer } from './components/Composer';
import { EmptyState } from './components/EmptyState';
import { ModelPicker } from './components/ModelPicker';
import { Sidebar } from './components/Sidebar';
import { ToneEditor } from './components/ToneEditor';
import { Banner, Code, IconButton } from './components/ui';
import { useChat } from './hooks/useChat';
import { useTheme } from './hooks/useTheme';

export default function App() {
  const chat = useChat();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toneEditorOpen, setToneEditorOpen] = useState(false);

  const { active, activeLoading, health, models } = chat;
  const hasMessages = Boolean(active?.exchanges?.length);
  const modelsById = useMemo(() => Object.fromEntries(models.map((m) => [m.id, m])), [models]);

  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const onKey = (event) => event.key === 'Escape' && setSidebarOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  useEffect(() => {
    document.title = active?.title && active._id ? `${active.title} – MyAi` : 'MyAi';
  }, [active?.title, active?._id]);

  const { openConversation, newConversation, send } = chat;

  const selectConversation = useCallback(
    (id) => {
      setSidebarOpen(false);
      openConversation(id);
    },
    [openConversation],
  );

  const startNew = useCallback(() => {
    setSidebarOpen(false);
    newConversation();
  }, [newConversation]);

  const openToneEditor = useCallback(() => {
    setSidebarOpen(false);
    setToneEditorOpen(true);
  }, []);
  const closeToneEditor = useCallback(() => setToneEditorOpen(false), []);

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-ink">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={chat.conversations}
        listState={chat.listState}
        query={chat.query}
        onQueryChange={chat.setQuery}
        activeId={active?._id}
        onSelect={selectConversation}
        onNew={startNew}
        onRename={chat.rename}
        onDelete={chat.remove}
        health={health}
        onRetry={chat.retryConnection}
        onOpenToneEditor={openToneEditor}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-line px-2 sm:px-4">
          <IconButton label="Open history" onClick={() => setSidebarOpen(true)} className="md:hidden">
            <Menu className="size-5" />
          </IconButton>
          <h1 className="min-w-0 flex-1 truncate px-1 font-display text-[17px] font-semibold tracking-[-0.015em]">
            {active?.title ?? 'New conversation'}
          </h1>
          <ModelPicker models={models} value={chat.modelId} onChange={chat.setModelId} />
          <IconButton label="New chat" onClick={startNew} className="md:hidden">
            <SquarePen className="size-[18px]" />
          </IconButton>
          <IconButton label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleTheme}>
            {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
          </IconButton>
        </header>

        {health.status === 'offline' && (
          <Banner icon={WifiOff} variant="danger">
            Can’t reach the server. Start it with <Code>npm run dev</Code> in the project folder, then{' '}
            <button type="button" onClick={chat.retryConnection} className="font-medium underline underline-offset-2">
              try again
            </button>
            .
          </Banner>
        )}
        {health.status === 'ok' && health.demo && (
          <Banner icon={FlaskConical}>
            Demo mode: replies are samples. Set <Code>AI_PROVIDER</Code> and <Code>AI_API_KEY</Code> in{' '}
            <Code>server/.env</Code> and restart the server for live answers.
          </Banner>
        )}

        {activeLoading ? (
          <ChatSkeleton />
        ) : hasMessages ? (
          <ChatView
            conversation={active}
            isStreaming={chat.isStreaming}
            tone={chat.tone}
            onRewrite={chat.rewrite}
            onBranch={chat.branch}
            onSelect={chat.selectCandidate}
            onOpenConversation={selectConversation}
            modelsById={modelsById}
            showModel={models.length > 1}
          />
        ) : (
          <EmptyState
            tone={chat.tone}
            onPick={send}
            disabled={chat.isStreaming}
            showIntro={chat.showIntro}
            compareEnabled={chat.compare.enabled}
            onToggleCompare={chat.toggleCompare}
            onOpenToneEditor={openToneEditor}
          />
        )}

        <Composer
          tone={chat.tone}
          onToneChange={chat.setTone}
          thinking={chat.thinking}
          onThinkingChange={chat.setThinking}
          models={models}
          modelId={chat.modelId}
          compare={chat.compare}
          onToggleCompare={chat.toggleCompare}
          onCompareChange={chat.updateCompare}
          onSend={send}
          onStop={chat.stop}
          isStreaming={chat.isStreaming}
          disabled={activeLoading}
          blockedReason={chat.awaitingChoice ? 'Keep one of the two answers above to continue the chat.' : null}
          focusKey={active?._id ?? 'new'}
        />
      </main>

      <ToneEditor open={toneEditorOpen} onClose={closeToneEditor} initialTone={chat.tone} />

      <div aria-live="polite" className="sr-only">
        {chat.announcement}
      </div>

      {chat.toast && (
        <div
          key={chat.toast.id}
          role="status"
          className="fixed bottom-28 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm text-canvas shadow-lg"
        >
          {chat.toast.message}
        </div>
      )}
    </div>
  );
}
