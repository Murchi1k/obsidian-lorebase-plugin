import { setIcon } from 'obsidian';
import { i18n, t } from '../localization';
import { calendarText as ct, calendarCountdownText } from '../localization/releaseCalendar';
import { mt } from '../localization/music';
import { getMediaWorkTypeLabel, supportsWorkTypes } from '../utils/mediaWorkType';
import type { MediaType } from '../types';
import type { ReleaseCalendarEntry } from '../views/library/releaseCalendar';
import { formatReleaseDate } from '../utils/releaseDates';
import { releaseDateText } from '../localization/releaseDates';

const PAGE_SIZE = 36;

export function releaseMediaLabel(type: MediaType): string {
    const labels = {
        game: t('settingsGames'), anime: t('settingsAnime'), movie: t('settingsMovies'),
        series: t('settingsSeries'), book: t('settingsBooks'), manga: t('settingsManga'), music: mt('music'),
    };
    return labels[type];
}

export function renderReleaseCover(parent: HTMLElement, entry: ReleaseCalendarEntry): void {
    parent.addClass(`is-${entry.item.type}`);
    setIcon(parent.createSpan({ cls: 'lorebase-release-cover-initial', attr: { 'aria-hidden': 'true' } }), 'image');
    if (!entry.item.imageUrl) return;
    const image = parent.createEl('img', {
        attr: { src: entry.item.imageUrl, alt: '', loading: 'lazy', decoding: 'async' },
    });
    image.addEventListener('error', () => image.remove(), { once: true });
}

/** Append a bounded batch rather than thousands of poster nodes at once. */
export function renderReleaseGallery(
    parent: HTMLElement,
    entries: ReleaseCalendarEntry[],
    openItem: (entry: ReleaseCalendarEntry) => void
): void {
    const gallery = parent.createDiv({ cls: 'lorebase-release-gallery' });
    let shown = 0;
    const more = parent.createEl('button', { cls: 'lorebase-release-show-more', attr: { type: 'button' } });
    const appendPage = (): void => {
        const fragment = gallery.ownerDocument.createDocumentFragment();
        for (const entry of entries.slice(shown, shown + PAGE_SIZE)) {
            const card = gallery.ownerDocument.createElement('button');
            card.type = 'button';
            card.className = `lorebase-release-card is-${entry.item.type}`;
            card.title = entry.item.displayName;
            card.dataset.path = entry.item.filePath;
            const poster = card.createDiv({ cls: 'lorebase-release-card-cover' });
            renderReleaseCover(poster, entry);
            card.createSpan({
                cls: 'lorebase-release-card-type',
                text: supportsWorkTypes(entry.item.type)
                    ? getMediaWorkTypeLabel(entry.item.type, '', i18n.getLanguage())
                    : releaseMediaLabel(entry.item.type),
            });
            const info = card.createDiv({ cls: 'lorebase-release-card-info' });
            info.createEl('strong', { cls: 'lorebase-release-card-title', text: entry.item.displayName });
            const release = info.createDiv({ cls: 'lorebase-release-card-release' });
            release.createEl('time', {
                cls: 'lorebase-release-card-date',
                text: entry.precision ? `${releaseDateText('expected')} · ${formatReleaseDate(entry.releaseValue,i18n.getLanguage())}`
                    : new Intl.DateTimeFormat(i18n.getLocale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(entry.date),
                attr: entry.precision ? {} : { datetime: entry.dateKey },
            });
            const today = new Date();
            const days = Math.round((entry.date.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000);
            if (!entry.precision && days >= 0) {
                const countdown = info.createSpan({ cls: 'lorebase-release-card-countdown' });
                setIcon(countdown.createSpan({ cls: 'lorebase-release-countdown-icon', attr: { 'aria-hidden': 'true' } }), 'clock-3');
                countdown.createSpan({ cls: 'lorebase-release-countdown-text', text: calendarCountdownText(days) });
            }
            card.addEventListener('click', () => openItem(entry));
            fragment.appendChild(card);
        }
        gallery.appendChild(fragment);
        shown = Math.min(shown + PAGE_SIZE, entries.length);
        more.hidden = shown >= entries.length;
        more.textContent = `${ct('showMore')} · ${shown} / ${entries.length}`;
    };
    more.addEventListener('click', appendPage);
    appendPage();
}
