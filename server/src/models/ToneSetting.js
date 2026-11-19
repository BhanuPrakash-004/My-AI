import mongoose from 'mongoose';

// One document per customised tone; _id is the tone id ("professional", ...).
// Tones without a document use their built-in instruction.
const toneSettingSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    instruction: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

export const ToneSetting = mongoose.model('ToneSetting', toneSettingSchema);
