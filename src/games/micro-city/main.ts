import './styles.css';
import { App } from './ui/app';

const root = document.getElementById('mc-root');
if (root) {
  root.textContent = '';
  const app = new App(root);
  if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { mc: app });
}
