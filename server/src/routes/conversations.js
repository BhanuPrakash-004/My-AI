import { Router } from 'express';
import { config } from '../config.js';
import { Conversation } from '../models/Conversation.js';
import { isTone, TONE_IDS } from '../services/tones.js';
import { assertObjectId, escapeRegex, HttpError } from '../utils/http.js';
import { serializeConversation, summarizeConversation } from './serializers.js';

export const conversationsRouter = Router();

// List conversation threads for the history sidebar (newest first).
// Optional ?q= searches titles, prompts, and responses.
conversationsRouter.get('/', async (req, res) => {
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
      },
    },
  ]);

  res.json({ conversations });
});

conversationsRouter.get('/:id', async (req, res) => {
  assertObjectId(req.params.id);
  const conversation = await Conversation.findById(req.params.id).lean();
  if (!conversation) throw new HttpError(404, 'Conversation not found.');
  res.json({ conversation: serializeConversation(conversation) });
});

// Rename a thread or change its saved tone. Does not move it to the top of the list.
conversationsRouter.patch('/:id', async (req, res) => {
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
    { new: true, runValidators: true, timestamps: false },
  ).lean();
  if (!conversation) throw new HttpError(404, 'Conversation not found.');

  res.json({ conversation: summarizeConversation(conversation) });
});

conversationsRouter.delete('/:id', async (req, res) => {
  assertObjectId(req.params.id);
  const result = await Conversation.deleteOne({ _id: req.params.id });
  if (!result.deletedCount) throw new HttpError(404, 'Conversation not found.');
  res.status(204).end();
});
