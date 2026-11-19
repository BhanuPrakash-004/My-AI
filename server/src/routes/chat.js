import { Router } from 'express';
import { config } from '../config.js';
import { Conversation } from '../models/Conversation.js';
import { DEFAULT_THINKING, isThinkingLevel, THINKING_IDS } from '../services/thinking.js';
import { getInstructions } from '../services/toneSettings.js';
import { buildSystemPrompt, isTone, TONE_IDS } from '../services/tones.js';
import { assertObjectId, HttpError, makeTitle } from '../utils/http.js';
import { openEventStream } from '../utils/sse.js';
import { serializeCandidate, serializeExchange, summarizeConversation } from './serializers.js';

const LANE_LABELS = ['A', 'B'];

/** Earlier turns sent to the model as context. Failed or undecided turns are skipped. */
export function buildHistory(exchanges) {
  return exchanges
    .filter((ex) => !['error', 'choosing', 'streaming'].includes(ex.status) && ex.response?.trim())
    .flatMap((ex) => [
      { role: 'user', content: ex.prompt },
      { role: 'assistant', content: ex.response.trimEnd() },
    ]);
}

function validateTone(tone, field = 'Tone') {
  if (!isTone(tone)) throw new HttpError(400, `${field} must be one of: ${TONE_IDS.join(', ')}.`);
}

/**
 * POST /api/chat
 * Body: { message, tone, thinking?, modelId?, compare?: { modelId?, tone? },
 *         conversationId?, regenerateExchangeId? }
 *
 * Streams Server-Sent Events:
 *   meta      -> { conversation, exchange }
 *   delta     -> { text } or, when comparing, { candidate: 0|1, text }
 *   candidate -> { index, candidate }        (compare only, when one side finishes)
 *   done      -> { conversation, exchange }
 *   error     -> { message, exchange }
 */
export function createChatRouter({ registry, log = console }) {
  const router = Router();

  router.post('/', async (req, res) => {
    const body = req.body ?? {};
    const prompt = typeof body.message === 'string' ? body.message.trim() : '';
    const tone = body.tone;
    const thinking = body.thinking ?? DEFAULT_THINKING;

    if (!prompt) throw new HttpError(400, 'Message cannot be empty.');
    if (prompt.length > config.limits.maxPromptChars) {
      throw new HttpError(400, `Messages can be up to ${config.limits.maxPromptChars} characters.`);
    }
    validateTone(tone);
    if (!isThinkingLevel(thinking)) {
      throw new HttpError(400, `Thinking level must be one of: ${THINKING_IDS.join(', ')}.`);
    }

    const primary = registry.resolve(body.modelId);
    if (!primary) throw new HttpError(400, `Unknown model "${body.modelId}".`);
    const lanes = [{ entry: primary, tone }];

    if (body.compare) {
      if (body.regenerateExchangeId) throw new HttpError(400, 'Rewriting a reply cannot be combined with compare.');
      const compareTone = body.compare.tone ?? tone;
      validateTone(compareTone, 'Compare tone');
      const other = registry.resolve(body.compare.modelId ?? body.modelId);
      if (!other) throw new HttpError(400, `Unknown model "${body.compare.modelId}".`);
      lanes.push({ entry: other, tone: compareTone });
    }
    const isCompare = lanes.length > 1;

    let conversation;
    if (body.conversationId) {
      assertObjectId(body.conversationId);
      conversation = await Conversation.findById(body.conversationId);
      if (!conversation) throw new HttpError(404, 'Conversation not found.');
    } else {
      conversation = new Conversation({ title: makeTitle(prompt), tone });
    }

    // "Rewrite" replaces the latest exchange instead of adding one.
    if (body.regenerateExchangeId) {
      const last = conversation.exchanges.at(-1);
      if (!last || String(last._id) !== String(body.regenerateExchangeId)) {
        throw new HttpError(409, 'Only the latest reply can be rewritten.');
      }
      conversation.exchanges.pop();
    }

    if (conversation.exchanges.at(-1)?.status === 'choosing') {
      throw new HttpError(409, 'Choose one of the compared answers before sending a new message.');
    }

    const messages = [...buildHistory(conversation.exchanges), { role: 'user', content: prompt }];
    const instructions = await getInstructions(lanes.map((lane) => lane.tone));

    const exchangeData = { prompt, tone, thinking, status: 'streaming', mode: isCompare ? 'compare' : 'single' };
    if (isCompare) {
      exchangeData.candidates = lanes.map((lane, index) => ({
        label: LANE_LABELS[index],
        modelId: lane.entry.id,
        provider: lane.entry.provider,
        model: lane.entry.model,
        tone: lane.tone,
        status: 'streaming',
      }));
    } else {
      Object.assign(exchangeData, { modelId: primary.id, provider: primary.provider, model: primary.model });
    }

    conversation.exchanges.push(exchangeData);
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

    const runLane = async (lane, index) => {
      const result = { text: '', status: 'complete', model: lane.entry.model, stopReason: null, error: null };
      try {
        const stream = lane.entry.adapter.streamReply({
          model: lane.entry.model,
          system: buildSystemPrompt(lane.tone, instructions[lane.tone]),
          messages,
          thinking,
          signal: controller.signal,
        });
        for await (const chunk of stream) {
          if (chunk.type === 'text') {
            result.text += chunk.text;
            sse.send('delta', isCompare ? { candidate: index, text: chunk.text } : { text: chunk.text });
          } else if (chunk.type === 'done') {
            result.model = chunk.model ?? result.model;
            result.stopReason = chunk.stopReason ?? null;
          }
        }
      } catch (error) {
        if (controller.signal.aborted) {
          result.status = 'stopped';
        } else {
          result.status = 'error';
          result.error = registry.describeError(error, lane.entry);
          log.error?.(`[chat] ${lane.entry.id} failed:`, error?.message ?? error);
        }
      }
      if (isCompare) {
        sse.send('candidate', {
          index,
          candidate: serializeCandidate({ ...exchangeData.candidates[index], ...laneFields(result) }),
        });
      }
      return result;
    };

    // Compare runs both requests in parallel.
    const results = await Promise.all(lanes.map(runLane));
    finished = true;

    const completedAt = new Date();
    let fields;
    let errorMessage = null;

    if (isCompare) {
      const candidates = exchangeData.candidates.map((candidate, index) => ({
        ...candidate,
        ...laneFields(results[index]),
      }));
      const anyContent = results.some((r) => r.text.trim());
      const status = anyContent ? 'choosing' : results.every((r) => r.status === 'stopped') ? 'stopped' : 'error';
      if (status === 'error') errorMessage = results.find((r) => r.error)?.error ?? 'Both answers failed.';
      fields = { candidates, status, completedAt, ...(errorMessage ? { error: errorMessage } : {}) };
    } else {
      const [r] = results;
      errorMessage = r.error;
      fields = { response: r.text, status: r.status, model: r.model, completedAt };
      if (r.stopReason) fields.stopReason = r.stopReason;
      if (r.error) fields.error = r.error;
    }

    const $set = Object.fromEntries(Object.entries(fields).map(([key, value]) => [`exchanges.$.${key}`, value]));
    const saved = serializeExchange({ ...exchange.toObject(), ...fields });

    try {
      await Conversation.updateOne({ _id: conversation._id, 'exchanges._id': exchange._id }, { $set });
    } catch (error) {
      log.error?.('[chat] Could not save the reply:', error.message);
      sse.send('error', {
        message: 'The reply was generated but could not be saved. Check the database connection.',
        exchange: { ...saved, status: 'error' },
      });
      return sse.close();
    }

    if (saved.status === 'error') {
      sse.send('error', { message: errorMessage, exchange: saved });
    } else {
      sse.send('done', {
        conversation: { ...summarizeConversation(conversation), updatedAt: completedAt },
        exchange: saved,
      });
    }
    sse.close();
  });

  return router;
}

function laneFields(result) {
  return {
    response: result.text,
    status: result.status,
    model: result.model,
    stopReason: result.stopReason,
    error: result.error,
  };
}
