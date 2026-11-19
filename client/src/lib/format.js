const DAY = 24 * 60 * 60 * 1000;

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Groups conversations by how recently they were updated. */
export function groupByRecency(conversations, now = new Date()) {
  const today = startOfDay(now);
  const buckets = new Map();

  for (const conversation of conversations) {
    const day = startOfDay(conversation.updatedAt);
    const age = Math.round((today - day) / DAY);
    let label;
    if (age <= 0) label = 'Today';
    else if (age === 1) label = 'Yesterday';
    else if (age < 7) label = 'Previous 7 days';
    else if (age < 30) label = 'Previous 30 days';
    else {
      label = new Date(conversation.updatedAt).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      });
    }
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label).push(conversation);
  }

  return [...buckets].map(([label, items]) => ({ label, items }));
}

/** "3:42 PM" for today, "Nov 18, 3:42 PM" otherwise. */
export function formatTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (startOfDay(date) === startOfDay(new Date())) return time;
  const day = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${day}, ${time}`;
}

/** "claude-opus-5-5" -> "Claude Opus 5.5" */
export function formatModelName(model) {
  if (!model) return '';
  if (model === 'demo') return 'Demo mode';
  if (!model.startsWith('claude-')) return model;
  const parts = model.replace(/^claude-/, '').split('-');
  const words = parts.filter((p) => Number.isNaN(Number(p)));
  const version = parts.filter((p) => !Number.isNaN(Number(p))).join('.');
  const name = words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  return `Claude ${name}${version ? ` ${version}` : ''}`;
}
