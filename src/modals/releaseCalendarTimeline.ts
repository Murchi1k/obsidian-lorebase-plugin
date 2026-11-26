import { setIcon } from 'obsidian';
import { i18n, t } from '../localization';
import { calendarText as ct } from '../localization/releaseCalendar';
import { groupReleaseMonths, type ReleaseCalendarEntry } from '../views/library/releaseCalendar';
import { renderReleaseGallery } from './releaseCalendarGallery';
import { formatReleaseDate } from '../utils/releaseDates';

const MONTH_BATCH = 12;

/** Keep the chronological archive bounded even when the library spans decades. */
export function renderReleaseTimeline(
    parent: HTMLElement,
    entries: ReleaseCalendarEntry[],
    collapsed: Set<string>,
    openItem: (entry: ReleaseCalendarEntry) => void
): void {
    const timeline = parent.createDiv({ cls: 'lorebase-release-timeline' });
    const groups = [...groupReleaseMonths(entries)];
    const yearCounts = new Map<number, number>();
    for (const entry of entries) yearCounts.set(entry.date.getFullYear(), (yearCounts.get(entry.date.getFullYear()) ?? 0) + 1);
    const more = parent.createEl('button', { cls: 'lorebase-release-show-more lorebase-release-more-months', attr: { type: 'button' } });
    let shown = 0;
    let currentYear: number | undefined;
    let yearSection: HTMLElement | undefined;
    const append = (): void => {
        for (const [key, releases] of groups.slice(shown, shown + MONTH_BATCH)) {
            const date = releases[0].date;
            const year = date.getFullYear();
            if (year !== currentYear || !yearSection) {
                currentYear = year;
                yearSection = timeline.createEl('section', { cls: 'lorebase-release-timeline-year', attr: { 'data-year': String(year) } });
                const heading = yearSection.createDiv({ cls: 'lorebase-release-timeline-year-heading' });
                heading.createEl('h3', { text: releases[0].precision === 'unknown' ? formatReleaseDate('unknown',i18n.getLanguage()) : String(year) });
                heading.createSpan({ text: `${yearCounts.get(year)} ${t('releaseCalendarItems')}` });
                heading.createSpan({ cls: 'lorebase-release-timeline-rule', attr: { 'aria-hidden': 'true' } });
            }
            const section = yearSection.createEl('section', { cls: 'lorebase-release-month', attr: { 'data-month': key } });
            const toggle = section.createEl('button', { cls: 'lorebase-release-month-heading', attr: { type: 'button' } });
            const month = releases[0].precision && releases[0].precision !== 'month'
                ? formatReleaseDate(releases[0].releaseValue,i18n.getLanguage())
                : new Intl.DateTimeFormat(i18n.getLocale(), { month: 'long' }).format(date);
            toggle.createEl('strong', { text: month.charAt(0).toLocaleUpperCase(i18n.getLocale()) + month.slice(1) });
            toggle.createSpan({ cls: 'lorebase-release-month-year', text: releases[0].precision && releases[0].precision !== 'month' ? '' : String(year) });
            toggle.createSpan({ cls: 'lorebase-release-month-count', text: `${releases.length} ${t('releaseCalendarItems')}` });
            toggle.createSpan({ cls: 'lorebase-release-timeline-rule', attr: { 'aria-hidden': 'true' } });
            setIcon(toggle.createSpan({ cls: 'lorebase-release-month-caret' }), 'chevron-down');
            const contents = section.createDiv({ cls: 'lorebase-release-month-content' });
            let rendered = false;
            const update = (): void => {
                contents.hidden = collapsed.has(key);
                toggle.setAttribute('aria-expanded', String(!contents.hidden));
                if (!contents.hidden && !rendered) {
                    renderReleaseGallery(contents, releases, openItem);
                    rendered = true;
                }
            };
            toggle.addEventListener('click', () => {
                if (collapsed.has(key)) collapsed.delete(key);
                else collapsed.add(key);
                update();
            });
            update();
        }
        shown = Math.min(shown + MONTH_BATCH, groups.length);
        more.hidden = shown >= groups.length;
        more.textContent = `${ct('moreMonths')} · ${shown} / ${groups.length}`;
    };
    more.addEventListener('click', append);
    append();
}
