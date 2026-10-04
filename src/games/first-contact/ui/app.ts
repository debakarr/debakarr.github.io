import { h } from '../../shared/dom';
import { SaveStore } from '../../shared/savefile';
import { icons, type IconKey } from '../art';
import { Game, SAVE_VERSION, type State } from '../sim/game';
import { DAYS, randomSeed } from '../sim/world';
import { alienText, gi } from './glyph';
import * as S from './screens';

type ScreenId = 'observatory' | 'translate' | 'dictionary' | 'civilization' | 'archive' | 'message' | 'journal';

const NAV: { id: ScreenId; label: string; icon: IconKey }[] = [
  { id: 'observatory', label: 'Observatory', icon: 'n-observatory' },
  { id: 'translate', label: 'Translate', icon: 'n-translate' },
  { id: 'dictionary', label: 'Dictionary', icon: 'n-dictionary' },
  { id: 'civilization', label: 'Aliens', icon: 'n-civilization' },
  { id: 'archive', label: 'Archive', icon: 'n-archive' },
  { id: 'message', label: 'Message', icon: 'n-message' },
  { id: 'journal', label: 'Journal', icon: 'n-journal' },
];

const store = new SaveStore('fc');

export class App {
  root: HTMLElement;
  game!: Game;
  screen: ScreenId = 'observatory';
  evidenceId: string | null = null;
  draft: string[] = [];
  private main!: HTMLElement;
  private shell!: HTMLElement;
  private sheet: { el: HTMLElement; body: HTMLElement; concept: string } | null = null;
  private saveTimer = 0;
  /** The day the report was last forced open. */
  private prompted = -1;

  constructor(root: HTMLElement) {
    this.root = root;
    root.classList.add('fc');
    window.addEventListener('pagehide', () => this.saveNow());
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && this.saveNow());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeModal();
    });
    this.title();
  }

  // --- Title ---------------------------------------------------------------------------

  title(): void {
    this.saveNow();
    this.root.textContent = '';
    const auto = store.list().find((m) => m.key === 'auto');
    const sample = Game.create('title');
    const first = sample.world.first.tokens;
    this.root.append(h('div', { class: 'fc-title' },
      h('div', { class: 'fc-titlesig' }, alienText(sample, first, { size: 'xl', animate: true })),
      h('h1', null, 'FIRST CONTACT'),
      h('p', { class: 'fc-tagline' }, 'You are not trying to defeat the aliens.', h('br'), 'You are trying to understand them.'),
      h('div', { class: 'fc-titlebtns' },
        auto ? h('button', { class: 'fc-btn primary', onclick: () => void this.continue() }, `Continue: ${auto.subtitle}`) : null,
        h('button', { class: `fc-btn ${auto ? '' : 'primary'}`, onclick: () => this.newContactDialog() }, 'New first contact'),
        h('button', { class: 'fc-btn', onclick: () => this.help() }, 'How to play'),
      ),
      h('footer', { class: 'fc-titlefoot' },
        h('a', { href: '/games', 'data-astro-reload': true }, '← All games'),
        h('span', null, 'Icons from ', h('a', { href: 'https://game-icons.net', target: '_blank', rel: 'noopener' }, 'game-icons.net'), ' (CC BY 3.0)'),
        h('button', { class: 'fc-linkbtn', onclick: () => this.credits() }, 'Credits'),
      ),
    ));
  }

  private async continue(): Promise<void> {
    try {
      const state = JSON.parse(await store.load('auto')) as State;
      if (!state?.seed || state.version > SAVE_VERSION) throw new Error('bad save');
      this.start(new Game(state));
    } catch {
      this.toast('That save could not be loaded.');
    }
  }

  newContact(): void {
    this.newContactDialog();
  }

  private newContactDialog(): void {
    let seed = randomSeed();
    const input = h('input', { type: 'text', value: seed, maxlength: '60', 'aria-label': 'Contact seed', oninput: (e: Event) => (seed = (e.target as HTMLInputElement).value.trim() || 'contact') });
    const body = h('div', { class: 'fc-new' },
      h('p', null, 'Every contact is generated from a seed: their glyphs, grammar, numbers, history and the reason they came. Share a seed to give a friend the same aliens.'),
      h('label', { class: 'fc-field' }, h('span', null, 'Seed'), h('div', { class: 'fc-inline' }, input, h('button', { class: 'fc-btn', onclick: () => { seed = randomSeed(); input.value = seed; } }, 'Random'))),
      h('div', { class: 'fc-actions' }, h('button', { class: 'fc-btn primary', onclick: () => { this.closeModal(); this.start(Game.create(seed)); } }, 'Receive the signal')),
    );
    this.modal('New first contact', body);
  }

  // --- Game shell ------------------------------------------------------------------------

  start(game: Game): void {
    this.game = game;
    this.screen = 'observatory';
    this.evidenceId = null;
    this.draft = [];
    this.root.textContent = '';
    game.on(() => this.scheduleSave());
    const nav = h('nav', { class: 'fc-nav', 'aria-label': 'Screens' }, ...NAV.map((n) => h('button', { 'data-nav': n.id, onclick: () => this.go(n.id) }, gi(n.icon), h('small', null, n.label), h('i', { class: 'fc-badge', 'data-badge': n.id }))));
    this.main = h('main', { class: 'fc-main' });
    this.shell = h('div', { class: 'fc-shell' },
      h('header', { class: 'fc-top' },
        h('button', { class: 'fc-brand', onclick: () => this.menu() }, h('b', null, 'FIRST CONTACT'), h('span', { 'data-k': 'day' })),
        h('div', { class: 'fc-topbtns' },
          h('button', { class: 'fc-btn ghost', 'data-k': 'report', 'aria-label': 'Write your report', onclick: () => this.report() }, gi('u-report'), h('span', { class: 'lbl' }, 'Report')),
          h('button', { class: 'fc-btn primary', 'data-k': 'next', onclick: () => this.nextDay() }, gi('u-next'), h('span', { class: 'lbl', 'data-k': 'nextlabel' }, 'Next day')),
          h('button', { class: 'fc-iconbtn', 'aria-label': 'Menu', onclick: () => this.menu() }, gi('n-menu')),
        ),
      ),
      nav,
      this.main,
    );
    this.root.append(this.shell);
    if (game.s.ended) this.screen = 'journal';
    this.render();
    if (game.s.day === 1 && !game.s.sent.length && !Object.keys(game.s.hyp).length) setTimeout(() => this.help(), 400);
  }

  go(id: ScreenId): void {
    this.screen = id;
    this.render();
    this.main.scrollTop = 0;
  }

  openEvidence(id: string): void {
    this.evidenceId = id;
    this.closeModal();
    this.screen = 'translate';
    this.render();
    this.main.scrollTop = 0;
  }

  render(): void {
    const g = this.game;
    if (!g || !this.shell?.isConnected) return;
    if (g.s.ended) {
      this.main.replaceChildren(S.finale(this));
      this.shell.classList.add('ended');
    } else {
      this.shell.classList.remove('ended');
      const fn: Record<ScreenId, (a: App) => HTMLElement> = {
        observatory: S.observatory, translate: S.translate, dictionary: S.dictionary, civilization: S.civilization,
        archive: S.archive, message: S.message, journal: S.journal,
      };
      this.main.replaceChildren(fn[this.screen](this));
    }
    const q = (k: string) => this.shell.querySelector(`[data-k="${k}"]`) as HTMLElement;
    q('day').replaceChildren(...(g.s.ended ? ['Report delivered'] : [`Day ${g.s.day}`, h('i', { class: 'of' }, ` / ${DAYS}`)]));
    const dec = g.pendingDecision();
    const next = q('next') as HTMLButtonElement;
    next.disabled = !!g.s.ended || !!dec || g.mustReport;
    next.hidden = !!g.s.ended;
    q('nextlabel').textContent = dec ? 'Council first' : g.mustReport ? 'Report due' : 'Next day';
    const rep = q('report') as HTMLButtonElement;
    rep.hidden = !g.canReport || !!g.s.ended;
    rep.classList.toggle('pulse', g.mustReport);
    for (const b of this.shell.querySelectorAll<HTMLElement>('[data-nav]')) b.classList.toggle('on', b.dataset.nav === this.screen);
    const unread = g.unread().filter((e) => e.tokens.length || e.kind === 'signal').length;
    const badge = this.shell.querySelector('[data-badge="translate"]') as HTMLElement;
    badge.textContent = unread ? String(unread) : '';
    const obs = this.shell.querySelector('[data-badge="observatory"]') as HTMLElement;
    obs.textContent = dec || g.s.contradictions.some((c) => c.open) ? '!' : '';
    if (g.mustReport && !g.s.ended && this.prompted !== g.s.day && !document.querySelector('.fc-modal')) {
      this.prompted = g.s.day;
      setTimeout(() => this.report(), 300);
    }
  }

  nextDay(): void {
    const g = this.game;
    const before = g.evidence.length;
    g.nextDay();
    const n = g.evidence.length - before;
    this.screen = 'observatory';
    this.render();
    this.main.scrollTop = 0;
    this.dayFlash(g.s.day, n);
  }

  private dayFlash(day: number, n: number): void {
    this.root.querySelector('.fc-dayflash')?.remove();
    const el = h('div', { class: 'fc-dayflash', 'aria-live': 'polite' }, h('b', null, `Day ${day}`), h('span', null, n ? `${n} new item${n > 1 ? 's' : ''}` : 'Quiet skies'));
    this.root.append(el);
    setTimeout(() => el.remove(), 1600);
  }

  send(): void {
    if (!this.draft.length) return;
    this.game.send(this.draft);
    this.draft = [];
    this.render();
    this.toast('Message transmitted. Expect a reply tomorrow.');
  }

  // --- Glyph sheet and modals ------------------------------------------------------------

  glyph(concept: string): void {
    this.closeModal();
    const body = S.glyphSheet(this, concept);
    const el = this.modal('Glyph', body, 'sheet');
    this.sheet = { el, body, concept };
  }

  refreshSheet(concept: string): void {
    if (!this.sheet) return;
    const fresh = S.glyphSheet(this, concept);
    this.sheet.body.replaceWith(fresh);
    this.sheet.body = fresh;
    // Without the draw-in animation the second time.
    for (const s of fresh.querySelectorAll('.fc-glyph.draw')) s.classList.remove('draw');
    this.render();
  }

  modal(title: string, body: HTMLElement, cls = ''): HTMLElement {
    this.closeModal();
    const el = h('div', { class: `fc-modal ${cls}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title, onclick: (e: Event) => e.target === el && this.closeModal() },
      h('div', { class: 'fc-card fc-dialog' },
        h('div', { class: 'fc-dialoghead' }, h('h2', null, title), h('button', { class: 'fc-iconbtn', 'aria-label': 'Close', onclick: () => this.closeModal() }, gi('u-close'))),
        body,
      ),
    );
    this.root.append(el);
    return el;
  }

  closeModal(): void {
    this.root.querySelector('.fc-modal')?.remove();
    this.sheet = null;
  }

  toast(text: string): void {
    const el = h('div', { class: 'fc-toast', role: 'status' }, text);
    this.root.append(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3000);
  }

  report(): void {
    if (!this.game.canReport || this.game.s.ended) return;
    this.modal('Your report to the Council', S.reportForm(this, () => {
      this.closeModal();
      this.saveNow();
      this.render();
      this.main.scrollTop = 0;
    }));
  }

  private menu(): void {
    if (!this.game) return;
    const g = this.game;
    const item = (label: string, icon: IconKey, fn: () => void) => h('button', { class: 'fc-menuitem', onclick: () => { this.closeModal(); fn(); } }, gi(icon), label);
    this.modal('Menu', h('div', { class: 'fc-menu' },
      h('p', { class: 'fc-hint' }, `Seed “${g.s.seed}” · ${g.world.species} · day ${g.s.day}`),
      item('Journal', 'n-journal', () => this.go('journal')),
      g.canReport && !g.s.ended ? item('Write your report', 'u-report', () => this.report()) : null,
      item('How to play', 'n-translate', () => this.help()),
      item('Credits', 'n-archive', () => this.credits()),
      item('New first contact', 'n-message', () => this.newContactDialog()),
      item('Title screen', 'u-back', () => this.title()),
    ));
  }

  help(): void {
    const step = (icon: IconKey, title: string, text: string) => h('div', { class: 'fc-helpstep' }, gi(icon), h('div', null, h('b', null, title), h('p', null, text)));
    this.modal('How to play', h('div', { class: 'fc-help' },
      h('p', null, 'Three ships are coming to Earth. Nobody understands a word they say. You are humanity\'s linguist.'),
      step('n-translate', 'Translate', 'Open a transmission or artifact and tap a glyph. Choose what you think it means. Context matters: where was it seen, and with what?'),
      step('n-dictionary', 'Build a dictionary', 'Your readings are hypotheses. Confidence grows when new evidence fits and falls when it does not. Glyphs that share a shape share a theme.'),
      step('n-message', 'Talk back', 'Compose replies from glyphs you have seen. They read what the glyphs really mean, so a wrong reading can say something you never intended.'),
      step('n-archive', 'Dig into the past', 'Artifacts carry dates in their numerals. Work out how they count from the counting signal.'),
      step('u-council', 'Advise the Council', 'Some days the Council needs a decision. The aliens notice what Earth does.'),
      step('u-report', 'Report', 'From day 12 you can deliver your report: why they came, and what their first message meant. On day 30 it is due.'),
      h('p', { class: 'fc-hint' }, 'There is no game over. The ending is the history you wrote.'),
    ));
  }

  credits(): void {
    this.modal('Credits', h('div', { class: 'fc-credits' },
      h('h4', null, 'Game'),
      h('p', null, 'First Contact, a language game for this site. The alien glyphs, language and history are generated in your browser from a seed.'),
      h('h4', null, 'Icons'),
      h('p', null, 'From ', h('a', { href: 'https://game-icons.net', target: '_blank', rel: 'noopener' }, 'game-icons.net'), ', licensed ', h('a', { href: 'https://creativecommons.org/licenses/by/3.0/', target: '_blank', rel: 'noopener' }, 'CC BY 3.0'), '. By:'),
      ...icons.credits().map((c) => h('details', { class: 'fc-credit' },
        h('summary', null, c.url ? h('a', { href: c.url, target: '_blank', rel: 'noopener' }, c.author) : c.author, ` — ${c.icons.length} icon${c.icons.length > 1 ? 's' : ''}`),
        h('p', null, ...c.icons.flatMap((ic, k) => [k ? ', ' : '', h('a', { href: ic.href, target: '_blank', rel: 'noopener' }, ic.name)])),
      )),
      h('h4', null, 'Inspiration'),
      h('p', null, 'The idea of translation as play owes a debt to inkle\'s Heaven\'s Vault. No language, art or story is borrowed from it.'),
      h('h4', null, 'Typefaces'),
      h('p', null, 'Inter and JetBrains Mono, SIL Open Font License.'),
    ));
  }

  // --- Saving --------------------------------------------------------------------------------

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveNow(), 800);
  }

  saveNow(): void {
    if (!this.game) return;
    const g = this.game;
    try {
      store.saveSync({ key: 'auto', label: 'Autosave', title: g.world.species, subtitle: `the ${g.world.species}, day ${g.s.day}${g.s.ended ? ' (ended)' : ''}` }, JSON.stringify(g.s));
    } catch {
      /* storage unavailable */
    }
  }
}
