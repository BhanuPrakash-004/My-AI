import { Cpu } from 'lucide-react';
import { Select } from './ui';

export const modelOptions = (models) =>
  models.map((m) => ({ value: m.id, label: m.label + (m.connection === 'compare' ? ` (${m.providerLabel})` : '') }));

/** Header model switcher. Shows a plain label when only one model is configured. */
export function ModelPicker({ models, value, onChange }) {
  if (!models.length) return null;
  if (models.length === 1) {
    return (
      <span className="hidden items-center gap-1.5 px-2 text-[13px] text-muted sm:flex" title={`${models[0].providerLabel} model`}>
        <Cpu className="size-3.5" aria-hidden="true" />
        {models[0].label}
      </span>
    );
  }
  return (
    <Select
      label="Model"
      value={value}
      onChange={onChange}
      options={modelOptions(models)}
      className="max-w-[9.5rem] sm:max-w-[13rem]"
    />
  );
}
