import { Brain, Rabbit, Scale } from 'lucide-react';

export const THINKING_LEVELS = [
  { id: 'fast', label: 'Fast', icon: Rabbit, description: 'Quick replies with light reasoning.' },
  { id: 'balanced', label: 'Balanced', icon: Scale, description: 'A good default for most questions.' },
  { id: 'deep', label: 'Deep', icon: Brain, description: 'Thinks longer before answering. Slower.' },
];

export const THINKING_BY_ID = Object.fromEntries(THINKING_LEVELS.map((level) => [level.id, level]));
export const DEFAULT_THINKING = 'balanced';
export const isThinkingLevel = (value) => Boolean(THINKING_BY_ID[value]);
