import './styles.css';
import './theme.css';
import { MapRenderer } from './render/renderer';
import { meet } from './sim/diplomacy';
import { createUnit } from './sim/units';
import { foundCity } from './sim/cities';
import { declareWar } from './sim/diplomacy';
import { BattleScene } from './render3d/battle';
import { App } from './ui/app';

const root = document.getElementById('yz-root');
if (root) {
  root.textContent = '';
  const app = new App(root);
  if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { yz: app, yzRenderer: MapRenderer, yzSim: { createUnit, meet, foundCity, declareWar, BattleScene } });
}
