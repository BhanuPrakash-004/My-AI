export function serializeExchange(exchange) {
  const ex = typeof exchange.toObject === 'function' ? exchange.toObject() : exchange;
  return {
    _id: String(ex._id),
    prompt: ex.prompt,
    response: ex.response ?? '',
    tone: ex.tone,
    status: ex.status,
    model: ex.model ?? null,
    stopReason: ex.stopReason ?? null,
    error: ex.error ?? null,
    timestamp: ex.timestamp,
    completedAt: ex.completedAt ?? null,
  };
}

export function summarizeConversation(conversation) {
  const exchanges = conversation.exchanges ?? [];
  return {
    _id: String(conversation._id),
    title: conversation.title,
    tone: conversation.tone,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    exchangeCount: exchanges.length,
    lastTone: exchanges.at(-1)?.tone ?? conversation.tone,
  };
}

export function serializeConversation(conversation) {
  return {
    ...summarizeConversation(conversation),
    exchanges: (conversation.exchanges ?? []).map(serializeExchange),
  };
}
