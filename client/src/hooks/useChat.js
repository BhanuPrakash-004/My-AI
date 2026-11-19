import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, streamChat } from '../lib/api';
import { readStorage, writeStorage } from '../lib/storage';
import { DEFAULT_THINKING, isThinkingLevel } from '../lib/thinking';
import { DEFAULT_TONE, isTone, TONES } from '../lib/tones';

const TONE_KEY = 'myai-tone';
const THINKING_KEY = 'myai-thinking';
const MODEL_KEY = 'myai-model';
const INTRO_KEY = 'myai-intro-done';

const readHashId = () => window.location.hash.match(/^#\/c\/([a-f0-9]{24})$/i)?.[1] ?? null;

const writeHashId = (id) => {
  const url = id ? `#/c/${id}` : window.location.pathname + window.location.search;
  window.history.replaceState(null, '', url);
};

const isTempId = (id) => String(id).startsWith('temp-');

const summaryOf = (conversation) => ({
  _id: conversation._id,
  title: conversation.title,
  tone: conversation.tone,
  createdAt: conversation.createdAt,
  updatedAt: conversation.updatedAt,
  exchangeCount: conversation.exchanges?.length ?? conversation.exchangeCount ?? 0,
  lastTone: conversation.exchanges?.at(-1)?.tone ?? conversation.lastTone ?? conversation.tone,
  isBranch: Boolean(conversation.branchedFrom ?? conversation.isBranch),
});

/** A tone that differs from `tone`, used as the default for the B side of a comparison. */
const otherTone = (tone) => {
  const index = TONES.findIndex((t) => t.id === tone);
  return TONES[(index + 1) % TONES.length].id;
};

/**
 * All chat state: server health and models, the history list, the open
 * conversation, per-message settings (tone, thinking, model, compare) and the
 * streaming lifecycle.
 */
export function useChat() {
  const [health, setHealth] = useState({ status: 'loading' });
  const [conversations, setConversations] = useState([]);
  const [listState, setListState] = useState('loading'); // loading | ready | error
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(null);
  const [activeLoading, setActiveLoading] = useState(false);
  const [tone, setToneState] = useState(() => {
    const saved = readStorage(TONE_KEY);
    return isTone(saved) ? saved : DEFAULT_TONE;
  });
  const [thinking, setThinkingState] = useState(() => {
    const saved = readStorage(THINKING_KEY);
    return isThinkingLevel(saved) ? saved : DEFAULT_THINKING;
  });
  const [preferredModelId, setPreferredModelId] = useState(() => readStorage(MODEL_KEY));
  const [introDone, setIntroDone] = useState(() => readStorage(INTRO_KEY) === '1');
  const [compare, setCompare] = useState({ enabled: false, modelId: null, tone: null });
  const [isStreaming, setIsStreaming] = useState(false);
  const [toast, setToast] = useState(null);
  const [announcement, setAnnouncement] = useState('');

  const models = useMemo(() => health.models ?? [], [health.models]);
  const modelId = models.some((m) => m.id === preferredModelId)
    ? preferredModelId
    : health.defaultModelId ?? models[0]?.id ?? null;

  const activeRef = useRef(active);
  const settingsRef = useRef({});
  const abortRef = useRef(null);
  const streamingRef = useRef(false);
  const loadSeq = useRef(0);

  useLayoutEffect(() => {
    activeRef.current = active;
    settingsRef.current = { tone, thinking, modelId, compare };
  });

  const showToast = useCallback((message) => setToast({ id: Date.now(), message }), []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const setTone = useCallback((next) => {
    if (!isTone(next)) return;
    setToneState(next);
    writeStorage(TONE_KEY, next);
  }, []);

  const setThinking = useCallback((next) => {
    if (!isThinkingLevel(next)) return;
    setThinkingState(next);
    writeStorage(THINKING_KEY, next);
  }, []);

  const setModelId = useCallback((next) => {
    setPreferredModelId(next);
    writeStorage(MODEL_KEY, next);
  }, []);

  /** Turns compare mode on or off; picks sensible defaults for side B. */
  const toggleCompare = useCallback(
    (enabled) => {
      setCompare((prev) => {
        const on = enabled ?? !prev.enabled;
        if (!on) return { ...prev, enabled: false };
        const { modelId: currentModel, tone: currentTone } = settingsRef.current;
        const otherModel = models.find((m) => m.id !== currentModel)?.id ?? currentModel;
        const bModel = prev.modelId && models.some((m) => m.id === prev.modelId) ? prev.modelId : otherModel;
        const bTone = prev.tone ?? (bModel === currentModel ? otherTone(currentTone) : currentTone);
        return { enabled: true, modelId: bModel, tone: bTone };
      });
    },
    [models],
  );

  const updateCompare = useCallback((patch) => setCompare((prev) => ({ ...prev, ...patch })), []);

  const checkHealth = useCallback(async () => {
    setHealth((prev) => (prev.status === 'ok' ? prev : { status: 'loading' }));
    try {
      const data = await api.health();
      setHealth({ status: 'ok', ...data });
      return true;
    } catch {
      setHealth({ status: 'offline' });
      return false;
    }
  }, []);

  const loadConversations = useCallback(async (q = '') => {
    try {
      const { conversations: list } = await api.listConversations(q);
      setConversations(list);
      setListState('ready');
    } catch {
      setListState('error');
    }
  }, []);

  const upsertSummary = useCallback((summary) => {
    setConversations((prev) => [summary, ...prev.filter((c) => c._id !== summary._id)]);
  }, []);

  // Search (debounced) and initial load of the history list.
  useEffect(() => {
    const timer = setTimeout(() => loadConversations(query.trim()), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [query, loadConversations]);

  const showConversation = useCallback(
    (conversation) => {
      setActive(conversation);
      writeHashId(conversation._id);
      if (isTone(conversation.tone)) setTone(conversation.tone);
    },
    [setTone],
  );

  const openConversation = useCallback(
    async (id, { force = false } = {}) => {
      if (!id || (!force && activeRef.current?._id === id)) return;
      abortRef.current?.abort();
      const seq = ++loadSeq.current;
      setActiveLoading(true);
      writeHashId(id);
      try {
        const { conversation } = await api.getConversation(id);
        if (seq !== loadSeq.current) return;
        showConversation(conversation);
      } catch (error) {
        if (seq !== loadSeq.current) return;
        showToast(error.message);
        setActive(null);
        writeHashId(null);
      } finally {
        if (seq === loadSeq.current) setActiveLoading(false);
      }
    },
    [showConversation, showToast],
  );

  // On first load: check the server and reopen the conversation in the URL.
  useEffect(() => {
    checkHealth();
    const id = readHashId();
    if (id) openConversation(id);
  }, [checkHealth, openConversation]);

  const newConversation = useCallback(() => {
    abortRef.current?.abort();
    loadSeq.current += 1;
    setActive(null);
    setActiveLoading(false);
    writeHashId(null);
  }, []);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  /**
   * Sends a prompt and streams the reply (or two replies, in compare mode)
   * into the open conversation. `replaceExchangeId` rewrites that exchange.
   */
  const send = useCallback(
    async (text, { replaceExchangeId } = {}) => {
      const prompt = text.trim();
      if (!prompt || streamingRef.current) return;

      // The welcome intro is only for first-time visitors.
      setIntroDone(true);
      writeStorage(INTRO_KEY, '1');

      const controller = new AbortController();
      abortRef.current = controller;
      streamingRef.current = true;
      setIsStreaming(true);
      setAnnouncement('');

      const settings = settingsRef.current;
      const comparing = settings.compare.enabled && !replaceExchangeId;
      const conversationId = activeRef.current?._id ?? null;
      const tempId = `temp-${Date.now()}`;
      let exchangeId = tempId;

      const optimistic = {
        _id: tempId,
        prompt,
        response: '',
        tone: settings.tone,
        thinking: settings.thinking,
        modelId: settings.modelId,
        mode: comparing ? 'compare' : 'single',
        candidates: comparing
          ? [
              { label: 'A', modelId: settings.modelId, tone: settings.tone, response: '', status: 'streaming' },
              { label: 'B', modelId: settings.compare.modelId, tone: settings.compare.tone, response: '', status: 'streaming' },
            ]
          : null,
        selectedCandidate: null,
        status: 'streaming',
        timestamp: new Date().toISOString(),
        live: true,
      };

      setActive((prev) => {
        const base = prev ?? { _id: null, title: 'New conversation', tone: settings.tone, exchanges: [], branches: [] };
        const kept = replaceExchangeId ? base.exchanges.filter((e) => e._id !== replaceExchangeId) : base.exchanges;
        return { ...base, tone: settings.tone, exchanges: [...kept, optimistic] };
      });

      const patchExchange = (patch) =>
        setActive((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            exchanges: prev.exchanges.map((e) =>
              e._id === exchangeId || e._id === tempId ? { ...e, ...(typeof patch === 'function' ? patch(e) : patch) } : e,
            ),
          };
        });

      const patchCandidate = (index, patch) =>
        patchExchange((e) => ({
          candidates: e.candidates?.map((c, i) => (i === index ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c)),
        }));

      try {
        await streamChat(
          {
            conversationId,
            message: prompt,
            tone: settings.tone,
            thinking: settings.thinking,
            modelId: settings.modelId ?? undefined,
            compare: comparing ? { modelId: settings.compare.modelId, tone: settings.compare.tone } : undefined,
            regenerateExchangeId: replaceExchangeId && !isTempId(replaceExchangeId) ? replaceExchangeId : undefined,
          },
          {
            signal: controller.signal,
            onEvent: (event, data) => {
              if (event === 'meta') {
                const realId = data.exchange._id;
                setActive((prev) =>
                  prev
                    ? {
                        ...prev,
                        _id: data.conversation._id,
                        title: data.conversation.title,
                        exchanges: prev.exchanges.map((e) =>
                          e._id === tempId ? { ...e, _id: realId, timestamp: data.exchange.timestamp } : e,
                        ),
                      }
                    : prev,
                );
                exchangeId = realId;
                upsertSummary(data.conversation);
                writeHashId(data.conversation._id);
              } else if (event === 'delta') {
                if (typeof data.candidate === 'number') {
                  patchCandidate(data.candidate, (c) => ({ response: c.response + data.text }));
                } else {
                  patchExchange((e) => ({ response: e.response + data.text }));
                }
              } else if (event === 'candidate') {
                patchCandidate(data.index, data.candidate);
              } else if (event === 'done') {
                patchExchange({ ...data.exchange, live: true });
                upsertSummary(data.conversation);
                setAnnouncement(
                  data.exchange.status === 'choosing' ? 'Both answers are ready. Choose one to keep.' : 'Reply complete.',
                );
              } else if (event === 'error') {
                patchExchange({ ...data.exchange, live: true });
                setAnnouncement(data.message);
              }
            },
          },
        );
      } catch (error) {
        if (error.name === 'AbortError') {
          patchExchange((e) => {
            const candidates = e.candidates?.map((c) => (c.status === 'streaming' ? { ...c, status: 'stopped' } : c));
            const hasText = candidates?.some((c) => c.response.trim());
            return { status: candidates ? (hasText ? 'choosing' : 'stopped') : 'stopped', candidates };
          });
        } else {
          patchExchange({ status: 'error', error: error.message });
          setAnnouncement(error.message);
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        streamingRef.current = false;
        setIsStreaming(false);
      }
    },
    [upsertSummary],
  );

  const rewrite = useCallback((exchange) => send(exchange.prompt, { replaceExchangeId: exchange._id }), [send]);

  /** Compare: keep one of the two answers. */
  const selectCandidate = useCallback(
    async (exchange, index) => {
      const conversationId = activeRef.current?._id;
      if (!conversationId || isTempId(exchange._id)) return;
      try {
        const result = await api.selectCandidate(conversationId, exchange._id, index);
        // live: false shows the kept answer in full instead of typing it out again.
        setActive((prev) =>
          prev?._id === conversationId
            ? {
                ...prev,
                exchanges: prev.exchanges.map((e) =>
                  e._id === exchange._id ? { ...e, ...result.exchange, live: false } : e,
                ),
              }
            : prev,
        );
        upsertSummary(result.conversation);
        setAnnouncement(`Kept answer ${exchange.candidates?.[index]?.label ?? ''}.`);
      } catch (error) {
        showToast(error.message);
      }
    },
    [upsertSummary, showToast],
  );

  /** Branch: copy the thread up to this exchange into a new conversation and open it. */
  const branch = useCallback(
    async (exchange) => {
      const source = activeRef.current;
      if (!source?._id || streamingRef.current) return;
      try {
        const { conversation } = await api.branchConversation(source._id, exchange._id);
        upsertSummary(summaryOf(conversation));
        loadSeq.current += 1;
        setActiveLoading(false);
        showConversation(conversation);
        showToast('Branched into a new chat. The original is unchanged.');
      } catch (error) {
        showToast(error.message);
      }
    },
    [upsertSummary, showConversation, showToast],
  );

  const rename = useCallback(
    async (id, title) => {
      try {
        const { conversation } = await api.updateConversation(id, { title });
        setConversations((prev) => prev.map((c) => (c._id === id ? { ...c, title: conversation.title } : c)));
        setActive((prev) => (prev?._id === id ? { ...prev, title: conversation.title } : prev));
      } catch (error) {
        showToast(error.message);
      }
    },
    [showToast],
  );

  const remove = useCallback(
    async (id) => {
      try {
        if (activeRef.current?._id === id) newConversation();
        await api.deleteConversation(id);
        setConversations((prev) => prev.filter((c) => c._id !== id));
      } catch (error) {
        showToast(error.message);
        loadConversations(query.trim());
      }
    },
    [newConversation, showToast, loadConversations, query],
  );

  const retryConnection = useCallback(async () => {
    if (await checkHealth()) loadConversations(query.trim());
  }, [checkHealth, loadConversations, query]);

  const awaitingChoice = active?.exchanges?.at(-1)?.status === 'choosing';
  // Show the welcome intro until the first message is sent (or if history already exists).
  const showIntro = !introDone && (listState === 'loading' || (conversations.length === 0 && !query.trim()));

  return {
    health,
    models,
    modelId,
    setModelId,
    conversations,
    listState,
    query,
    setQuery,
    active,
    activeLoading,
    tone,
    setTone,
    thinking,
    setThinking,
    compare,
    toggleCompare,
    updateCompare,
    isStreaming,
    awaitingChoice,
    showIntro,
    toast,
    showToast,
    announcement,
    openConversation,
    newConversation,
    send,
    stop,
    rewrite,
    selectCandidate,
    branch,
    rename,
    remove,
    retryConnection,
  };
}
