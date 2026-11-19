import { Router } from 'express';
import { config } from '../config.js';
import { Conversation } from '../models/Conversation.js';
import { aiProvider, describeAiError } from '../services/ai/index.js';
import { buildSystemPrompt, isTone, TONE_IDS } from '../services/tones.js';
import { assertObjectId, HttpError, makeTitle } from '../utils/http.js';
import { openEventStream } from '../utils/sse.js';
import { serializeExchange, summarizeConversation } from './serializers.js';

export const chatRouter = Router();

/**
 * POST /api/chat
 * Body: { message, tone, conversationId?, regenerateExchangeId? }
 *
 * Streams the reply as Server-Sent Events:
 *   meta  -> { conversation, exchange }   (ids are known; UI can switch threads)
 *   delta -> { text }                     (one per streamed chunk)
 *   done  -> { conversation, exchange }   (final, persisted exchange)
 *   error -> { message, exchange }
 */
chatRouter.post('/', async (req, res) => {
  const { conversationId, message, tone, regenerateExchangeId } = req.body ?? {};
  const prompt = typeof message === 'string' ? message.trim() : '';

  if (!prompt) throw new HttpError(400, 'Message cannot be empty.');
  if (prompt.length > config.limits.maxPromptChars) {
    throw new HttpError(400, `Messages can be up to ${config.limits.maxPromptChars} characters.`);
  }
  if (!isTone(tone)) throw new HttpError(400, `Tone must be one of: ${TONE_IDS.join(', ')}.`);

  let conversation;
  if (conversationId) {
    assertObjectId(conversationId);
    conversation = await Conversation.findById(conversationId);
    if (!conversation) throw new HttpError(404, 'Conversation not found.');
  } else {
    conversation = new Conversation({ title: makeTitle(prompt), tone });
  }

  // "Rewrite" replaces the latest exchange instead of adding a new one.
  if (regenerateExchangeId) {
    const last = conversation.exchanges.at(-1);
    if (!last || String(last._id) !== String(regenerateExchangeId)) {
      throw new HttpError(409, 'Only the latest reply can be rewritten.');
    }
    conversation.exchanges.pop();
  }

  // Earlier turns give the model context. Failed turns (no response) are skipped.
  const history = conversation.exchanges
    .filter((ex) => ex.status !== 'error' && ex.response.trim())
    .flatMap((ex) => [
      { role: 'user', content: ex.prompt },
      { role: 'assistant', content: ex.response.trimEnd() },
    ]);

  conversation.exchanges.push({ prompt, tone, status: 'streaming' });
  conversation.tone = tone;
  await conversation.save();
  const exchange = conversation.exchanges.at(-1);

  const sse = openEventStream(res);
  sse.send('meta', {
    conversation: summarizeConversation(conversation),
    exchange: serializeExchange(exchange),
  });

  // Stop generating when the browser disconnects (user pressed Stop or left).
  const controller = new AbortController();
  let finished = false;
  res.on('close', () => {
    if (!finished) controller.abort();
  });

  let text = '';
  let model = aiProvider.model;
  let stopReason = null;
  let status = 'complete';
  let errorMessage = null;

  try {
    const stream = aiProvider.streamReply({
      system: buildSystemPrompt(tone),
      messages: [...history, { role: 'user', content: prompt }],
      tone,
      signal: controller.signal,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'text') {
        text += chunk.text;
        sse.send('delta', { text: chunk.text });
      } else if (chunk.type === 'done') {
        model = chunk.model ?? model;
        stopReason = chunk.stopReason ?? null;
      }
    }
  } catch (error) {
    if (controller.signal.aborted) {
      status = 'stopped';
    } else {
      status = 'error';
      errorMessage = describeAiError(error);
      console.error('[chat] AI request failed:', error?.message ?? error);
    }
  } finally {
    finished = true;
  }

  const completedAt = new Date();
  const fields = { response: text, status, model, completedAt };
  if (stopReason) fields.stopReason = stopReason;
  if (errorMessage) fields.error = errorMessage;

  const $set = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [`exchanges.$.${key}`, value]),
  );

  try {
    await Conversation.updateOne(
      { _id: conversation._id, 'exchanges._id': exchange._id },
      { $set },
    );
  } catch (error) {
    console.error('[chat] Could not save the reply:', error.message);
    sse.send('error', {
      message: 'The reply was generated but could not be saved. Check the database connection.',
      exchange: serializeExchange({ ...exchange.toObject(), ...fields, status: 'error' }),
    });
    return sse.close();
  }

  const saved = serializeExchange({ ...exchange.toObject(), ...fields });
  if (status === 'error') {
    sse.send('error', { message: errorMessage, exchange: saved });
  } else {
    sse.send('done', {
      conversation: { ...summarizeConversation(conversation), updatedAt: completedAt },
      exchange: saved,
    });
  }
  sse.close();
});
