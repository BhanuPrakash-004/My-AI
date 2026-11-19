import { Briefcase, Coffee, Zap } from 'lucide-react';

export const TONES = [
  {
    id: 'professional',
    label: 'Professional',
    icon: Briefcase,
    hint: 'Replies will be polished and well structured.',
    sample:
      'If you are building anything beyond small scripts, TypeScript is worth adopting. Static types catch errors before runtime, improve editor tooling, and make large codebases easier to maintain. Because it compiles to JavaScript, you can migrate one file at a time.',
  },
  {
    id: 'casual',
    label: 'Casual',
    icon: Coffee,
    hint: 'Replies will be relaxed and friendly.',
    sample:
      "Honestly? Go TypeScript 🙌 It's basically JavaScript with a safety net, so your editor catches the silly stuff before your users do. And you don't have to switch everything at once, just ease in file by file.",
  },
  {
    id: 'concise',
    label: 'Concise',
    icon: Zap,
    hint: 'Replies will be short and to the point.',
    sample: 'Learn TypeScript. Same JavaScript, plus types: fewer bugs, better tooling, gradual adoption.',
  },
];

export const SAMPLE_QUESTION = 'Should I learn TypeScript or stick with JavaScript?';

export const TONE_BY_ID = Object.fromEntries(TONES.map((tone) => [tone.id, tone]));
export const DEFAULT_TONE = 'professional';
export const isTone = (value) => Boolean(TONE_BY_ID[value]);
