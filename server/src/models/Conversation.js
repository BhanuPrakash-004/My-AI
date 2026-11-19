import mongoose from 'mongoose';
import { DEFAULT_TONE, TONE_IDS } from '../services/tones.js';

const { Schema } = mongoose;

// One exchange = one user prompt and the AI response it produced.
const exchangeSchema = new Schema(
  {
    prompt: { type: String, required: true, trim: true },
    response: { type: String, default: '' },
    tone: { type: String, enum: TONE_IDS, required: true },
    status: {
      type: String,
      enum: ['streaming', 'complete', 'stopped', 'error'],
      default: 'streaming',
    },
    model: { type: String },
    stopReason: { type: String },
    error: { type: String },
    timestamp: { type: Date, default: Date.now },
    completedAt: { type: Date },
  },
  { _id: true },
);

const conversationSchema = new Schema(
  {
    title: { type: String, default: 'New conversation', trim: true },
    tone: { type: String, enum: TONE_IDS, default: DEFAULT_TONE },
    exchanges: { type: [exchangeSchema], default: [] },
  },
  { timestamps: true },
);

conversationSchema.index({ updatedAt: -1 });

export const Conversation = mongoose.model('Conversation', conversationSchema);
