import type { TrophyGrade } from '../services/playstation/types';

/** Original PNG artwork is bundled into CSS; no external files or network requests. */
export function renderPlayStationTrophyIcon(host: HTMLElement, grade: TrophyGrade): void {
    const art = host.ownerDocument.createElement('span');
    art.className = 'lorebase-psn-trophy-art is-' + grade;
    art.setAttribute('aria-hidden', 'true');
    art.setAttribute('data-custom-trophy', grade);
    host.appendChild(art);
}
