import mongoose from 'mongoose';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function assertObjectId(id, label = 'Conversation') {
  if (!mongoose.isValidObjectId(id)) {
    throw new HttpError(404, `${label} not found.`);
  }
}

export const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function makeTitle(prompt, maxChars = 60) {
  const singleLine = prompt.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxChars) return singleLine;
  const cut = singleLine.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 30 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}
