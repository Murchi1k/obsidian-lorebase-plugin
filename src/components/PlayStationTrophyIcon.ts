import type { TrophyGrade } from '../services/playstation/types';

/** Original PNG artwork is bundled into CSS; no external files or network requests. */
export function renderPlayStationTrophyIcon(host: HTMLElement, grade: TrophyGrade): void {
    host.createSpan({ cls: `lorebase-psn-trophy-art is-${grade}`, attr: { 'aria-hidden': 'true', 'data-custom-trophy': grade } });
}
