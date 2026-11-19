import { useLayoutEffect, useRef, useState } from 'react';
import { TONES } from '../lib/tones';

/**
 * Segmented radio group for the reply tone. A pill in the tone's colour
 * slides behind the selected option.
 */
export function ToneToggle({ value, onChange, disabled = false }) {
  const groupRef = useRef(null);
  const optionRefs = useRef({});
  const [indicator, setIndicator] = useState(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = optionRefs.current[value];
      if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    document.fonts?.ready.then(measure);
    const observer = new ResizeObserver(measure);
    if (groupRef.current) observer.observe(groupRef.current);
    return () => observer.disconnect();
  }, [value]);

  const handleKeyDown = (event) => {
    const index = TONES.findIndex((t) => t.id === value);
    const last = TONES.length - 1;
    const keys = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowDown: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      ArrowUp: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    const next = TONES[keys[event.key]];
    onChange(next.id);
    optionRefs.current[next.id]?.focus();
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label="Reply tone"
      data-tone={value}
      onKeyDown={handleKeyDown}
      className="relative flex items-center rounded-full bg-sunken p-1"
    >
      {indicator && (
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-0 rounded-full bg-tone shadow-[0_1px_3px_rgba(0,0,0,0.18)] transition-[transform,width,background-color] duration-300 ease-[cubic-bezier(0.3,0.7,0.2,1)]"
          style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }}
        />
      )}
      {TONES.map((tone) => {
        const checked = tone.id === value;
        const Icon = tone.icon;
        return (
          <button
            key={tone.id}
            ref={(el) => {
              optionRefs.current[tone.id] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={disabled}
            title={tone.hint}
            onClick={() => onChange(tone.id)}
            className={`relative z-10 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-200 sm:px-3 ${
              checked ? 'text-on-tone' : 'text-muted hover:text-ink'
            }`}
          >
            <Icon className="hidden size-3.5 sm:block" strokeWidth={2.25} aria-hidden="true" />
            {tone.label}
          </button>
        );
      })}
    </div>
  );
}
