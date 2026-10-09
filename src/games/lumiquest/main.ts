import '@fontsource/lilita-one/400.css';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import './styles.css';
import { Game } from './game';

const root = document.getElementById('lq-root');
if (root) {
  root.textContent = '';
  try {
    const game = new Game(root);
    if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { lq: game });
    void game.start();
  } catch (err) {
    console.error(err);
    root.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'lq-error';
    box.innerHTML = '<div class="lq-panel lq-error-card"><h2>LumiQuest could not start</h2><p>This browser could not create a WebGL 2 context. Try a recent version of Chrome, Edge, Firefox or Safari with hardware acceleration enabled.</p><p><a class="lq-btn" href="/games">Back to games</a></p></div>';
    root.append(box);
  }
}
