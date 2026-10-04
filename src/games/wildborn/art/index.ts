import { iconSet, type IconCredit } from '../../shared/gameicons';
import { ICON_PATH, ICON_SOURCE, type IconKey } from './icons';

export type { IconKey, IconCredit };

// Wildborn's game-icons.net silhouettes; see scripts/game-icons.mjs.

export const icons = iconSet(ICON_SOURCE, ICON_PATH);
