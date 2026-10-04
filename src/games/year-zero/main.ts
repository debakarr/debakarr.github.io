import './styles.css';
import { App } from './ui/app';

const root = document.getElementById('yz-root');
if (root) {
  root.textContent = '';
  const app = new App(root);
  if (new URLSearchParams(location.search).has('debug')) (window as unknown as { yz: App }).yz = app;
}
