import { ChevronDown } from 'lucide-react';

export function IconButton({ label, className = '', children, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-sunken hover:text-ink disabled:opacity-40 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/** Three bars, one per tone: the MyAi mark. */
export function LogoMark({ className = 'size-6' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="3" y="9" width="4.5" height="12" rx="2.25" fill="var(--tone-professional)" />
      <rect x="9.75" y="3" width="4.5" height="18" rx="2.25" fill="var(--tone-casual)" />
      <rect x="16.5" y="12" width="4.5" height="9" rx="2.25" fill="var(--tone-concise)" />
    </svg>
  );
}

export function Banner({ icon: Icon, variant = 'info', children }) {
  const styles =
    variant === 'danger' ? 'border-danger/30 bg-danger/8 text-ink' : 'border-casual/35 bg-casual/10 text-ink';
  return (
    <div className="px-3 pt-1 sm:px-6">
      <div
        role={variant === 'danger' ? 'alert' : 'status'}
        className={`mx-auto flex max-w-3xl items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] leading-relaxed ${styles}`}
      >
        <Icon className={`mt-0.5 size-4 shrink-0 ${variant === 'danger' ? 'text-danger' : 'text-casual'}`} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

export function Code({ children }) {
  return <code className="rounded-md border border-line bg-surface px-1.5 py-px font-mono text-[12px]">{children}</code>;
}

/** A compact native select with a custom chevron. */
export function Select({ label, value, onChange, options, className = '', selectClassName = '' }) {
  return (
    <label className={`relative inline-flex min-w-0 items-center ${className}`}>
      <span className="sr-only">{label}</span>
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className={`h-8 w-full min-w-0 appearance-none truncate rounded-lg border border-line bg-surface pl-2.5 pr-7 text-[13px] text-ink transition-colors hover:border-ink/25 focus:border-ink/35 focus:outline-none ${selectClassName}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-faint" aria-hidden="true" />
    </label>
  );
}
