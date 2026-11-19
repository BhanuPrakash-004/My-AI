import { Columns2, X } from 'lucide-react';
import { TONE_BY_ID, TONES } from '../lib/tones';
import { modelOptions } from './ModelPicker';
import { Select } from './ui';

const toneOptions = TONES.map((t) => ({ value: t.id, label: t.label }));

/**
 * Shown inside the composer while Compare is on. Side A is the regular
 * model and tone; side B is chosen here.
 */
export function CompareBar({ models, modelId, tone, compare, onChange, onClose }) {
  const modelA = models.find((m) => m.id === modelId);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2.5 text-[13px] sm:px-4">
      <span className="flex items-center gap-1.5 font-medium text-ink">
        <Columns2 className="size-4" aria-hidden="true" />
        Compare
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-muted" data-tone={tone}>
        <span className="grid size-5 place-items-center rounded-md bg-sunken text-[11px] font-semibold text-ink">A</span>
        <span className="truncate">
          {modelA?.label ?? 'Model'}, <span className="text-tone-strong">{TONE_BY_ID[tone].label}</span>
        </span>
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="grid size-5 shrink-0 place-items-center rounded-md bg-sunken text-[11px] font-semibold text-ink">B</span>
        {models.length > 1 && (
          <Select
            label="Model for answer B"
            value={compare.modelId}
            onChange={(value) => onChange({ modelId: value })}
            options={modelOptions(models)}
            className="min-w-0 max-w-[12rem]"
          />
        )}
        <Select
          label="Tone for answer B"
          value={compare.tone}
          onChange={(value) => onChange({ tone: value })}
          options={toneOptions}
          className="w-[7.5rem] shrink-0"
        />
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Turn off compare"
        title="Turn off compare"
        className="grid size-7 place-items-center rounded-md text-faint transition-colors hover:bg-sunken hover:text-ink"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
