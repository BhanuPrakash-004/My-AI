import mongoose from 'mongoose';
import { DEFAULT_THINKING, THINKING_IDS } from '../services/thinking.js';
import { DEFAULT_TONE, TONE_IDS } from '../services/tones.js';

const { Schema } = mongoose;

const STATUSES = ['streaming', 'complete', 'stopped', 'error', 'choosing'];

// One side of a side-by-side comparison.
const candidateSchema = new Schema(
  {
    label: { type: String, required: true }, // "A" or "B"
    modelId: { type: String },
    provider: { type: String },
    model: { type: String },
    tone: { type: String, enum: TONE_IDS, required: true },
    response: { type: String, default: '' },
    status: { type: String, enum: STATUSES, default: 'streaming' },
    stopReason: { type: String },
    error: { type: String },
  },
  { _id: false },
);

// One exchange = one user prompt and the AI response it produced.
const exchangeSchema = new Schema(
  {
    prompt: { type: String, required: true, trim: true },
    response: { type: String, default: '' },
    tone: { type: String, enum: TONE_IDS, required: true },
    thinking: { type: String, enum: THINKING_IDS, default: DEFAULT_THINKING },
    status: { type: String, enum: STATUSES, default: 'streaming' },
    mode: { type: String, enum: ['single', 'compare'], default: 'single' },
    candidates: { type: [candidateSchema], default: undefined },
    selectedCandidate: { type: Number, default: null },
    modelId: { type: String },
    provider: { type: String },
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
    // Set when this conversation was branched from an exchange of another one.
    branchedFrom: {
      type: new Schema(
        {
          conversationId: { type: Schema.Types.ObjectId, required: true },
          exchangeId: { type: Schema.Types.ObjectId, required: true },
          title: { type: String },
          copiedCount: { type: Number }, // exchanges copied from the source
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { timestamps: true },
);

conversationSchema.index({ updatedAt: -1 });
conversationSchema.index({ 'branchedFrom.conversationId': 1 });

export const Conversation = mongoose.model('Conversation', conversationSchema);
