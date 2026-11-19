const plain = (doc) => (typeof doc?.toObject === 'function' ? doc.toObject() : doc);

export function serializeCandidate(candidate) {
  const c = plain(candidate);
  return {
    label: c.label,
    modelId: c.modelId ?? null,
    provider: c.provider ?? null,
    model: c.model ?? null,
    tone: c.tone,
    response: c.response ?? '',
    status: c.status,
    stopReason: c.stopReason ?? null,
    error: c.error ?? null,
  };
}

export function serializeExchange(exchange) {
  const ex = plain(exchange);
  return {
    _id: String(ex._id),
    prompt: ex.prompt,
    response: ex.response ?? '',
    tone: ex.tone,
    thinking: ex.thinking ?? 'balanced',
    status: ex.status,
    mode: ex.mode ?? 'single',
    candidates: ex.candidates?.length ? ex.candidates.map(serializeCandidate) : null,
    selectedCandidate: ex.selectedCandidate ?? null,
    modelId: ex.modelId ?? null,
    provider: ex.provider ?? null,
    model: ex.model ?? null,
    stopReason: ex.stopReason ?? null,
    error: ex.error ?? null,
    timestamp: ex.timestamp,
    completedAt: ex.completedAt ?? null,
  };
}

export function summarizeConversation(conversation) {
  const c = plain(conversation);
  const exchanges = c.exchanges ?? [];
  return {
    _id: String(c._id),
    title: c.title,
    tone: c.tone,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    exchangeCount: exchanges.length,
    lastTone: exchanges.at(-1)?.tone ?? c.tone,
    isBranch: Boolean(c.branchedFrom),
  };
}

export function serializeConversation(conversation, { branches = [], sourceExists = true } = {}) {
  const c = plain(conversation);
  return {
    ...summarizeConversation(c),
    branchedFrom: c.branchedFrom
      ? {
          conversationId: String(c.branchedFrom.conversationId),
          exchangeId: String(c.branchedFrom.exchangeId),
          title: c.branchedFrom.title ?? null,
          copiedCount: c.branchedFrom.copiedCount ?? null,
          exists: sourceExists,
        }
      : null,
    branches: branches.map((b) => ({
      _id: String(b._id),
      title: b.title,
      exchangeId: String(b.branchedFrom.exchangeId),
      createdAt: b.createdAt,
    })),
    exchanges: (c.exchanges ?? []).map(serializeExchange),
  };
}
