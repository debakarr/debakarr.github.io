// Helpers for game-icons.net silhouettes (512x512 SVG path data), shared by
// the games. Each game generates its own icon module with
// scripts/game-icons.mjs and wraps it with iconSet().

export const ICON_AUTHORS: Record<string, { name: string; url?: string }> = {
  lorc: { name: 'Lorc', url: 'https://lorcblog.blogspot.com' },
  delapouite: { name: 'Delapouite', url: 'https://delapouite.com' },
  skoll: { name: 'Skoll' },
  sbed: { name: 'Sbed', url: 'https://opengameart.org/content/95-game-icons' },
  'carl-olsen': { name: 'Carl Olsen' },
  'heavenly-dog': { name: 'HeavenlyDog', url: 'http://www.gnomosygoblins.blogspot.com' },
  quoting: { name: 'Quoting' },
  'pierre-leducq': { name: 'Pierre Leducq' },
  cathelineau: { name: 'Cathelineau' },
  faithtoken: { name: 'Faithtoken', url: 'http://fungustoken.deviantart.com' },
  'caro-asercion': { name: 'Caro Asercion' },
  darkzaitzev: { name: 'DarkZaitzev', url: 'http://darkzaitzev.deviantart.com' },
  guard13007: { name: 'Guard13007', url: 'https://guard13007.com' },
  andymeneely: { name: 'Andy Meneely', url: 'http://www.se.rit.edu/~andy/' },
  'lord-berandas': { name: 'Lord Berandas', url: 'http://berandas.deviantart.com' },
};

export interface IconCredit {
  author: string;
  url?: string;
  icons: { name: string; href: string }[];
}

export interface IconSet<K extends string> {
  has(key: string): key is K;
  path2D(key: K): Path2D;
  /** Inline SVG markup, tinted with currentColor. */
  svg(key: K): string;
  /** Draw an icon centered on (x, y) at the given size, in current canvas units. */
  draw(ctx: CanvasRenderingContext2D, key: K, x: number, y: number, size: number, color: string): void;
  /** Every icon used, grouped by author, with a link to its page on game-icons.net. */
  credits(): IconCredit[];
}

export function iconSet<K extends string>(source: Record<K, string>, paths: Record<string, string>): IconSet<K> {
  const cache = new Map<string, Path2D>();
  const path2D = (key: K): Path2D => {
    const src = source[key];
    let p = cache.get(src);
    if (!p) cache.set(src, (p = new Path2D(paths[src])));
    return p;
  };
  return {
    has: (key: string): key is K => key in source,
    path2D,
    svg: (key) => `<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="${paths[source[key]]}"/></svg>`,
    draw(ctx, key, x, y, size, color) {
      ctx.save();
      ctx.translate(x - size / 2, y - size / 2);
      ctx.scale(size / 512, size / 512);
      ctx.fillStyle = color;
      ctx.fill(path2D(key));
      ctx.restore();
    },
    credits() {
      const byAuthor = new Map<string, Set<string>>();
      for (const src of Object.values(source) as string[]) {
        const [author, name] = src.split('/');
        let set = byAuthor.get(author);
        if (!set) byAuthor.set(author, (set = new Set()));
        set.add(name);
      }
      return [...byAuthor.entries()]
        .sort((a, b) => b[1].size - a[1].size)
        .map(([author, names]) => ({
          author: ICON_AUTHORS[author]?.name ?? author,
          url: ICON_AUTHORS[author]?.url,
          icons: [...names].sort().map((n) => ({
            name: n.replace(/-/g, ' '),
            href: `https://game-icons.net/1x1/${author}/${n}.html`,
          })),
        }));
    },
  };
}
