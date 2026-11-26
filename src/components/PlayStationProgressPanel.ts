import { i18n } from '../localization';
import { pt } from '../localization/playstation';
import { TROPHY_GRADES, type PlayStationTracking } from '../services/playstation/types';
import { renderPlayStationTrophyIcon } from './PlayStationTrophyIcon';

export type RefreshPlayStationTracking = (tracking: PlayStationTracking, signal: AbortSignal) => Promise<{ tracking: PlayStationTracking; partial: boolean }>;

export function renderPlayStationTrophies(host: HTMLElement, tracking: PlayStationTracking): void {
    const sets = tracking.trophySets;
    host.createDiv({ cls: 'lorebase-psn-trophy-heading', text: pt('trophies') + ' · ' + tracking.platform });
    if (!sets?.length) host.createDiv({ cls: 'setting-item-description', text: pt('noTrophies') });
    for (const set of sets ?? []) {
        const group = host.createDiv({ cls: 'lorebase-psn-trophy-set', attr: { 'data-trophy-set': set.id } });
        if (sets!.length > 1) group.createDiv({ cls: 'lorebase-psn-set-title', text: set.title + ' · ' + set.platform });
        const row = group.createDiv({ cls: 'lorebase-psn-trophy-row' });
        const trophies = row.createDiv({ cls: 'lorebase-psn-trophies' });
        for (const grade of TROPHY_GRADES) {
            const counts = new Intl.NumberFormat(i18n.getLocale()).format(set.earned[grade]) + ' / ' + set.total[grade];
            const card = trophies.createDiv({ cls: 'lorebase-psn-trophy is-' + grade, attr: { 'data-trophy-grade': grade, tabindex: '0', title: pt(grade) + ' · ' + counts } });
            card.createSpan({ cls: 'lorebase-psn-trophy-ambient', attr: { 'aria-hidden': 'true' } });
            if (grade === 'platinum') {
                card.addEventListener('pointermove', event => {
                    if (event.pointerType === 'touch') return;
                    const bounds = card.getBoundingClientRect();
                    card.style.setProperty('--psn-pointer-x', (event.clientX - bounds.left) + 'px');
                    card.style.setProperty('--psn-pointer-y', (event.clientY - bounds.top) + 'px');
                });
                card.addEventListener('pointerleave', () => {
                    card.style.removeProperty('--psn-pointer-x');
                    card.style.removeProperty('--psn-pointer-y');
                });
                const particles = card.createSpan({ cls: 'lorebase-psn-platinum-particles', attr: { 'aria-hidden': 'true' } });
                for (let index = 0; index < 6; index++) particles.createSpan();
            }
            renderPlayStationTrophyIcon(card.createSpan({ cls: 'lorebase-psn-trophy-icon' }), grade);
            const copy = card.createDiv(); copy.createSpan({ cls: 'lorebase-psn-trophy-label', text: pt(grade) }); copy.createEl('strong', { text: counts });
        }
    }
}
