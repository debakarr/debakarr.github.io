// Formatting for cosmic and human timescales.

/** Universe age from Myr: "8.42 billion years", "640 million years", or exact years when slow. */
export function fmtAge(t: number, exact = false, short = false): string {
  const yrs = short ? ' yr' : ' years';
  if (exact) return `${Math.floor(t * 1e6).toLocaleString('en-US')}${yrs}`;
  if (t >= 1000) return short ? `${(t / 1000).toFixed(2)}B yr` : `${(t / 1000).toFixed(2)} billion years`;
  if (t >= 1) return short ? `${t.toFixed(0)}M yr` : `${t.toFixed(0)} million years`;
  return `${Math.round(t * 1e6).toLocaleString('en-US')}${yrs}`;
}

/** A span in years: "14,821 years", "3.2 million years". */
export function fmtYears(y: number): string {
  if (y >= 1e9) return `${(y / 1e9).toFixed(2)} billion years`;
  if (y >= 1e6) return `${(y / 1e6).toFixed(y >= 1e8 ? 0 : 1)} million years`;
  return `${Math.round(y).toLocaleString('en-US')} years`;
}

/** How long ago, from Myr timestamps. */
export function fmtAgo(then: number, now: number): string {
  const y = (now - then) * 1e6;
  if (y < 1) return 'Just now';
  return `${fmtYears(y)} ago`;
}

export function fmtPop(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} billion`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} million`;
  return Math.round(n).toLocaleString('en-US');
}

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export const SPEED_LABEL = ['Paused', '1k yr/s', '100k yr/s', '10M yr/s', '100M yr/s', '1B yr/s'];
