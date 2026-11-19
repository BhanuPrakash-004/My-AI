import { Router } from 'express';
import mongoose from 'mongoose';
import { config } from '../config.js';
import { Conversation } from '../models/Conversation.js';
import { isTone, TONE_IDS } from '../services/tones.js';
import { assertObjectId, escapeRegex, HttpError } from '../utils/http.js';
import { serializeConversation, serializeExchange, summarizeConversation } from './serializers.js';

const BRANCH_SUFFIX = / \(branch(?: \d+)?\)$/;

export function createConversationsRouter() {
  const router = Router();

  // List conversation threads for the history sidebar (newest first).
  // Optional ?q= searches titles, prompts, and responses.
  router.get('/', async (req, res) => {
    const q = String(req.query.q ?? '').trim().slice(0, 100);
    const match = {};
    if (q) {
      const pattern = { $regex: escapeRegex(q), $options: 'i' };
      match.$or = [{ title: pattern }, { 'exchanges.prompt': pattern }, { 'exchanges.response': pattern }];
    }

    const conversations = await Conversation.aggregate([
      { $match: match },
      { $sort: { updatedAt: -1 } },
      { $limit: 200 },
      {
        $project: {
          title: 1,
          tone: 1,
          createdAt: 1,
          updatedAt: 1,
          exchangeCount: { $size: '$exchanges' },
          lastTone: { $ifNull: [{ $arrayElemAt: ['$exchanges.tone', -1] }, '$tone'] },
          isBranch: { $gt: ['$branchedFrom', null] },
        },
      },
    ]);

    res.json({ conversations });
  });

  router.get('/:id', async (req, res) => {
    assertObjectId(req.params.id);
    const conversation = await Conversation.findById(req.params.id).lean();
    if (!conversation) throw new HttpError(404, 'Conversation not found.');

    const [branches, sourceExists] = await Promise.all([
      Conversation.find(
        { 'branchedFrom.conversationId': conversation._id },
        { title: 1, branchedFrom: 1, createdAt: 1 },
      )
        .sort({ createdAt: 1 })
        .lean(),
      conversation.branchedFrom
        ? Conversation.exists({ _id: conversation.branchedFrom.conversationId }).then(Boolean)
        : true,
    ]);

    res.json({ conversation: serializeConversation(conversation, { branches, sourceExists }) });
  });

  // Rename a thread or change its saved tone. Does not move it to the top of the list.
  router.patch('/:id', async (req, res) => {
    assertObjectId(req.params.id);
    const update = {};

    if (req.body?.title !== undefined) {
      const title = String(req.body.title).replace(/\s+/g, ' ').trim();
      if (!title) throw new HttpError(400, 'Title cannot be empty.');
      update.title = title.slice(0, config.limits.maxTitleChars);
    }
    if (req.body?.tone !== undefined) {
      if (!isTone(req.body.tone)) {
        throw new HttpError(400, `Tone must be one of: ${TONE_IDS.join(', ')}.`);
      }
      update.tone = req.body.tone;
    }
    if (!Object.keys(update).length) throw new HttpError(400, 'Nothing to update.');

    const conversation = await Conversation.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { returnDocument: 'after', runValidators: true, timestamps: false },
    ).lean();
    if (!conversation) throw new HttpError(404, 'Conversation not found.');

    res.json({ conversation: summarizeConversation(conversation) });
  });

  router.delete('/:id', async (req, res) => {
    assertObjectId(req.params.id);
    const result = await Conversation.deleteOne({ _id: req.params.id });
    if (!result.deletedCount) throw new HttpError(404, 'Conversation not found.');
    res.status(204).end();
  });

  /**
   * Branch: copy the conversation up to and including one exchange into a new
   * conversation. The original is left untouched.
   */
  router.post('/:id/branch', async (req, res) => {
    assertObjectId(req.params.id);
    const exchangeId = req.body?.exchangeId;
    assertObjectId(exchangeId, 'Message');

    const source = await Conversation.findById(req.params.id);
    if (!source) throw new HttpError(404, 'Conversation not found.');

    const index = source.exchanges.findIndex((ex) => String(ex._id) === String(exchangeId));
    if (index === -1) throw new HttpError(404, 'Message not found.');
    if (source.exchanges[index].status === 'streaming') {
      throw new HttpError(409, 'Wait for the reply to finish before branching from it.');
    }

    const siblingCount = await Conversation.countDocuments({ 'branchedFrom.conversationId': source._id });
    const baseTitle = source.title.replace(BRANCH_SUFFIX, '');
    const title = `${baseTitle} (branch${siblingCount ? ` ${siblingCount + 1}` : ''})`;

    const exchanges = source.exchanges.slice(0, index + 1).map((ex) => {
      const { _id, ...rest } = ex.toObject();
      return { ...rest, _id: new mongoose.Types.ObjectId() };
    });

    const branch = await Conversation.create({
      title: title.slice(0, config.limits.maxTitleChars),
      tone: source.exchanges[index].tone ?? source.tone,
      exchanges,
      branchedFrom: {
        conversationId: source._id,
        exchangeId: source.exchanges[index]._id,
        title: source.title,
        copiedCount: exchanges.length,
      },
    });

    res.status(201).json({ conversation: serializeConversation(branch) });
  });

  /**
   * Compare: keep one of the two candidate answers as the exchange's response.
   */
  router.post('/:id/exchanges/:exchangeId/select', async (req, res) => {
    assertObjectId(req.params.id);
    assertObjectId(req.params.exchangeId, 'Message');
    const index = Number(req.body?.candidate);

    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) throw new HttpError(404, 'Conversation not found.');
    const exchange = conversation.exchanges.id(req.params.exchangeId);
    if (!exchange) throw new HttpError(404, 'Message not found.');
    if (exchange.mode !== 'compare' || !exchange.candidates?.length) {
      throw new HttpError(400, 'This message has no answers to choose between.');
    }
    if (exchange.status === 'streaming') throw new HttpError(409, 'Wait for both answers to finish.');

    const candidate = Number.isInteger(index) ? exchange.candidates[index] : null;
    if (!candidate) throw new HttpError(400, 'Candidate must be 0 or 1.');
    if (!candidate.response.trim()) throw new HttpError(400, 'That answer is empty and cannot be chosen.');

    exchange.response = candidate.response;
    exchange.tone = candidate.tone;
    exchange.modelId = candidate.modelId;
    exchange.provider = candidate.provider;
    exchange.model = candidate.model;
    exchange.stopReason = candidate.stopReason;
    exchange.error = undefined;
    exchange.status = candidate.status === 'stopped' ? 'stopped' : 'complete';
    exchange.selectedCandidate = index;
    exchange.completedAt = new Date();
    await conversation.save();

    res.json({
      exchange: serializeExchange(exchange),
      conversation: summarizeConversation(conversation),
    });
  });

  return router;
}
