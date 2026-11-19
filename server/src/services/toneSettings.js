import { ToneSetting } from '../models/ToneSetting.js';
import { buildSystemPrompt, TONE_IDS, TONES } from './tones.js';

function describe(id, doc) {
  const instruction = doc?.instruction ?? TONES[id].defaultInstruction;
  return {
    id,
    label: TONES[id].label,
    instruction,
    defaultInstruction: TONES[id].defaultInstruction,
    customized: Boolean(doc),
    updatedAt: doc?.updatedAt ?? null,
    systemPrompt: buildSystemPrompt(id, instruction),
  };
}

export async function listToneSettings() {
  const docs = await ToneSetting.find({ _id: { $in: TONE_IDS } }).lean();
  const byId = new Map(docs.map((doc) => [doc._id, doc]));
  return TONE_IDS.map((id) => describe(id, byId.get(id)));
}

/** Returns { toneId: instruction } for the given tones (custom text or default). */
export async function getInstructions(toneIds) {
  const ids = [...new Set(toneIds)];
  const docs = await ToneSetting.find({ _id: { $in: ids } }).lean();
  const byId = new Map(docs.map((doc) => [doc._id, doc.instruction]));
  return Object.fromEntries(ids.map((id) => [id, byId.get(id) ?? TONES[id].defaultInstruction]));
}

export async function saveToneInstruction(id, instruction) {
  const doc = await ToneSetting.findByIdAndUpdate(
    id,
    { $set: { instruction } },
    { returnDocument: 'after', upsert: true, runValidators: true },
  ).lean();
  return describe(id, doc);
}

export async function resetToneInstruction(id) {
  await ToneSetting.deleteOne({ _id: id });
  return describe(id, null);
}
