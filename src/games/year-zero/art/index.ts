import { iconSet, type IconCredit } from '../../shared/gameicons';
import { ICON_PATH, ICON_SOURCE, type IconKey } from './icons';

export type { IconKey, IconCredit };

// Year Zero's game-icons.net silhouettes; see scripts/game-icons.mjs.

const icons = iconSet(ICON_SOURCE, ICON_PATH);

export const iconPath2D = icons.path2D;
export const hasIcon = icons.has;
export const iconSvg = icons.svg;
export const drawIcon = icons.draw;
export const iconCredits = icons.credits;
