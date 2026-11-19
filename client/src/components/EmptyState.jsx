import { Brain, Columns2, CornerDownLeft, GitBranch, SlidersHorizontal } from 'lucide-react';
import { SAMPLE_QUESTION, TONE_BY_ID } from '../lib/tones';

const STARTERS = [
  'Write a friendly reminder to a client about an overdue invoice',
  'Explain how HTTPS keeps my data private',
  'Plan a three-day trip to Lisbon on a small budget',
  "What's the difference between a process and a thread?",
];

function Feature({ icon: Icon, title, children, action }) {
  return (
    <div className="flex gap-3 p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent">
        <Icon className="size-[18px]" strokeWidth={2.1} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h4 className="text-[14px] font-semibold text-ink">{title}</h4>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{children}</p>
        {action}
      </div>
    </div>
  );
}

function FeatureAction({ onClick, children, pressed }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className="mt-2 rounded-lg border border-line px-2.5 py-1 text-[12.5px] font-medium text-ink transition-colors hover:border-accent hover:text-ink aria-pressed:border-accent aria-pressed:bg-accent/10"
    >
      {children}
    </button>
  );
}

/** First-visit welcome: headline plus a live preview of the selected tone. */
function Intro({ tone }) {
  const meta = TONE_BY_ID[tone];
  const Icon = meta.icon;
  return (
    <>
      <h2 className="font-display text-[clamp(2.1rem,5.5vw,3.25rem)] font-semibold leading-[1.04] tracking-[-0.028em] text-balance">
        Ask anything.
        <br />
        Choose how it sounds.
      </h2>
      <p className="mt-4 max-w-[34rem] text-[15px] leading-relaxed text-muted">
        The tone switch under the message box changes the voice of the next reply. Here is the same
        question answered in the {meta.label.toLowerCase()} tone.
      </p>

      <figure data-tone={tone} className="mt-7" aria-label="Tone preview">
        <div className="flex justify-end">
          <p className="max-w-[85%] rounded-[18px] rounded-tr-md bg-user px-3.5 py-2 text-[14px] text-user-ink">
            {SAMPLE_QUESTION}
          </p>
        </div>
        <div
          key={tone}
          className="tone-swap mt-3 max-w-[92%] rounded-[18px] rounded-tl-md border border-l-[3px] border-line border-l-tone bg-surface px-4 py-3"
        >
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-tone-strong">
            <Icon className="size-3.5" strokeWidth={2.25} aria-hidden="true" />
            {meta.label}
          </div>
          <p className="text-[14.5px] leading-relaxed">{meta.sample}</p>
        </div>
      </figure>
    </>
  );
}

export function EmptyState({
  tone,
  onPick,
  disabled,
  showIntro = true,
  compareEnabled,
  onToggleCompare,
  onOpenToneEditor,
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center px-5 py-10 sm:px-6">
        {showIntro ? (
          <Intro tone={tone} />
        ) : (
          <h2 className="font-display text-[clamp(1.6rem,4vw,2.1rem)] font-semibold tracking-[-0.02em]">
            What would you like to ask?
          </h2>
        )}

        <div className={showIntro ? 'mt-10' : 'mt-6'}>
          <h3 className="text-sm font-medium text-muted">Start with one of these</h3>
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {STARTERS.map((starter) => (
              <li key={starter}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onPick(starter)}
                  className="group flex w-full items-center justify-between gap-4 py-3 text-left text-[15px] text-ink transition-colors hover:text-tone-strong disabled:opacity-50"
                  data-tone={tone}
                >
                  <span>{starter}</span>
                  <CornerDownLeft
                    className="size-4 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <section className="mt-10" aria-labelledby="more-ways">
          <h3 id="more-ways" className="text-sm font-medium text-muted">
            More ways to chat
          </h3>
          <div className="mt-2 grid overflow-hidden rounded-2xl border border-line bg-surface sm:grid-cols-2 [&>*]:border-line max-sm:[&>*+*]:border-t sm:[&>*:nth-child(n+3)]:border-t sm:[&>*:nth-child(even)]:border-l">
            <Feature
              icon={Columns2}
              title="Compare answers"
              action={
                onToggleCompare && (
                  <FeatureAction onClick={() => onToggleCompare(!compareEnabled)} pressed={Boolean(compareEnabled)}>
                    {compareEnabled ? 'Compare is on' : 'Turn on compare'}
                  </FeatureAction>
                )
              }
            >
              Get two replies side by side from different models or tones, then keep the better one.
            </Feature>
            <Feature icon={Brain} title="Thinking level">
              Pick Fast, Balanced or Deep for each message, next to the tone switch.
            </Feature>
            <Feature
              icon={SlidersHorizontal}
              title="Tone instructions"
              action={onOpenToneEditor && <FeatureAction onClick={onOpenToneEditor}>Edit tones</FeatureAction>}
            >
              Rewrite what Professional, Casual and Concise tell the model.
            </Feature>
            <Feature icon={GitBranch} title="Branch a chat">
              Use Branch under any reply to try a different direction. The original stays as it is.
            </Feature>
          </div>
        </section>
      </div>
    </div>
  );
}
