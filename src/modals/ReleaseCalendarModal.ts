import { App, Modal, setIcon } from 'obsidian';
import { addWorkspaceModalClose } from '../components/WorkspaceModalChrome';
import { createLorebaseDropdown } from '../components/LorebaseDropdown';
import type { MediaItem, MediaType } from '../types';
import { i18n, t } from '../localization';
import { calendarText as ct } from '../localization/releaseCalendar';
import { MEDIA_ICONS } from '../mediaPresentation';
import {
    buildReleaseCalendarEntries, dateKey, queryReleaseEntries,
    normalizeReleaseCalendarMediaTypes, normalizeReleaseCalendarScope, normalizeReleaseCalendarViewMode,
    RELEASE_CALENDAR_MEDIA_TYPES,
    type ReleaseCalendarScope, type ReleaseCalendarEntry, type ReleaseCalendarViewMode, type ReleaseDateOrder,
} from '../views/library/releaseCalendar';
import { releaseMediaLabel, renderReleaseGallery } from './releaseCalendarGallery';
import { renderReleaseTimeline } from './releaseCalendarTimeline';
import { releaseDateText } from '../localization/releaseDates';

export class ReleaseCalendarModal extends Modal {
    private entries: ReleaseCalendarEntry[] = [];
    private selectedTypes: Set<MediaType>;
    private mode: ReleaseCalendarViewMode;
    private releaseScope: ReleaseCalendarScope;
    private dateOrder: ReleaseDateOrder = 'asc';
    private cursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    private selectedDay: string | null = null;
    private query = '';
    private collapsedMonths = new Set<string>();
    private bodyEl: HTMLElement | null = null;
    private countEl: HTMLElement | null = null;
    private loading = true;
    private loadGeneration = 0;
    private searchTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(
        app: App,
        private readonly loadItems: () => Promise<MediaItem[]>,
        private readonly openItem: (item: MediaItem) => Promise<void>,
        initialSelectedTypes: unknown,
        private readonly saveSelectedTypes: (types: MediaType[]) => void,
        initialViewMode: unknown,
        initialScope: unknown,
        private readonly saveViewPreferences: (mode: ReleaseCalendarViewMode, scope: ReleaseCalendarScope) => void
    ) {
        super(app);
        this.selectedTypes = new Set(normalizeReleaseCalendarMediaTypes(initialSelectedTypes));
        this.mode = normalizeReleaseCalendarViewMode(initialViewMode);
        this.releaseScope = normalizeReleaseCalendarScope(initialScope);
    }

    onOpen(): void {
        this.modalEl.addClass('lorebase-release-calendar-container');
        this.contentEl.empty();
        this.contentEl.addClass('lorebase-release-calendar');
        this.renderShell();
        void this.load();
    }

    onClose(): void {
        this.loadGeneration++;
        if (this.searchTimer !== null) clearTimeout(this.searchTimer);
        this.searchTimer = null;
        this.contentEl.empty();
        this.bodyEl = null;
        this.countEl = null;
    }

    private renderShell(): void {
        const header = this.contentEl.createDiv({ cls: 'lorebase-release-header' });
        const heading = header.createDiv({ cls: 'lorebase-release-heading' });
        setIcon(heading.createSpan({ cls: 'lorebase-release-heading-icon' }), 'calendar-days');
        const copy = heading.createDiv();
        copy.createEl('h2', { text: t('releaseCalendar') });
        this.countEl = copy.createDiv({ cls: 'lorebase-release-subtitle', text: t('releaseCalendarLoading') });
        const modes = header.createDiv({ cls: 'lorebase-release-view-switch', attr: { role: 'group', 'aria-label': t('view') } });
        this.choice(modes, 'calendar-days', t('releaseCalendarView'), this.mode === 'calendar', () => this.setMode('calendar'));
        this.choice(modes, 'panels-top-left', t('releaseAgendaView'), this.mode === 'agenda', () => this.setMode('agenda'));
        addWorkspaceModalClose(this.modalEl, header, () => this.close());

        const filters = this.contentEl.createDiv({ cls: 'lorebase-release-filters' });
        const scopes = filters.createDiv({ cls: 'lorebase-release-scope', attr: { role: 'group', 'aria-label': t('filter') } });
        this.choice(scopes, 'clock-3', t('releaseUpcoming'), this.releaseScope === 'upcoming', () => this.setScope('upcoming'));
        this.choice(scopes, 'calendar-range', t('releaseAll'), this.releaseScope === 'all', () => this.setScope('all'));
        const order = this.iconButton(filters, this.dateOrder === 'asc' ? 'arrow-up-narrow-wide' : 'arrow-down-wide-narrow',
            this.dateOrder === 'asc' ? t('releaseOldestFirst') : t('releaseNewestFirst'));
        order.addClass('lorebase-release-order-btn');
        order.addEventListener('click', () => {
            this.dateOrder = this.dateOrder === 'asc' ? 'desc' : 'asc';
            this.refreshShell();
        });
        const media = filters.createDiv({ cls: 'lorebase-release-media-filters', attr: { role: 'group', 'aria-label': ct('allMedia') } });
        const updateMediaButtons = (): void => {
            media.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
                const active = this.selectedTypes.has(button.dataset.type as MediaType);
                button.toggleClass('is-active', active);
                button.setAttribute('aria-pressed', String(active));
                button.title = `${releaseMediaLabel(button.dataset.type as MediaType)} · ${active ? ct('hideMedia') : ct('showMedia')}`;
            });
        };
        for (const type of RELEASE_CALENDAR_MEDIA_TYPES) {
            const button = this.choice(media, MEDIA_ICONS[type], releaseMediaLabel(type), this.selectedTypes.has(type), () => {
                if (this.selectedTypes.has(type) && this.selectedTypes.size > 1) this.selectedTypes.delete(type);
                else this.selectedTypes.add(type);
                this.selectedDay = null;
                this.saveSelectedTypes(RELEASE_CALENDAR_MEDIA_TYPES.filter(entry => this.selectedTypes.has(entry)));
                updateMediaButtons();
                this.renderBody(true);
            });
            button.className = 'lorebase-release-filter';
            button.addClass(`is-${type}`);
            button.dataset.type = type;
        }
        updateMediaButtons();

        const search = filters.createDiv({ cls: 'lorebase-release-search' });
        setIcon(search.createSpan(), 'search');
        const input = search.createEl('input', { attr: { type: 'search', placeholder: ct('search'), 'aria-label': ct('search') } });
        input.value = this.query;
        input.addEventListener('input', () => {
            this.query = input.value;
            if (this.searchTimer !== null) clearTimeout(this.searchTimer);
            this.searchTimer = setTimeout(() => {
                this.searchTimer = null;
                this.selectedDay = null;
                this.renderBody(true);
            }, 150);
        });
        this.bodyEl = this.contentEl.createDiv({ cls: 'lorebase-release-body' });
    }

    private setMode(mode: ReleaseCalendarViewMode): void {
        this.mode = mode;
        this.saveViewPreferences(this.mode, this.releaseScope);
        this.refreshShell();
    }

    private setScope(scope: ReleaseCalendarScope): void {
        this.releaseScope = scope;
        this.selectedDay = null;
        this.saveViewPreferences(this.mode, this.releaseScope);
        this.refreshShell(true);
    }

    private refreshShell(followResults = false): void {
        this.contentEl.empty();
        this.renderShell();
        this.renderBody(followResults);
    }

    private async load(): Promise<void> {
        const generation = ++this.loadGeneration;
        this.loading = true;
        this.renderBody();
        try {
            const items = await this.loadItems();
            if (generation !== this.loadGeneration || !this.bodyEl) return;
            this.entries = buildReleaseCalendarEntries(items);
            this.loading = false;
            const filtered = this.filteredEntries();
            const today = dateKey(new Date());
            const chronological = [...filtered].sort((a, b) => a.date.getTime() - b.date.getTime());
            const start = chronological.find(entry => entry.precision ? entry.endDate && dateKey(entry.endDate) > today : entry.dateKey >= today) ?? chronological[chronological.length - 1];
            if (start && start.precision !== 'unknown') this.setCursor(start.precision && dateKey(start.date) < today ? new Date() : start.date);
            this.renderBody();
        } catch (error) {
            if (generation !== this.loadGeneration || !this.bodyEl) return;
            this.loading = false;
            console.error('[Release calendar] Failed to load media:', error);
            if (this.countEl) this.countEl.textContent = t('releaseCalendarError');
            this.bodyEl.empty();
            const empty = this.empty(this.bodyEl, t('releaseCalendarError'), '');
            empty.createEl('button', { text: ct('retry'), attr: { type: 'button' } }).addEventListener('click', () => void this.load());
        }
    }

    private filteredEntries(): ReleaseCalendarEntry[] {
        return queryReleaseEntries(this.entries, this.selectedTypes, this.releaseScope, this.dateOrder, this.query);
    }

    private renderBody(followResults = false): void {
        if (!this.bodyEl) return;
        this.bodyEl.empty();
        if (this.loading) {
            this.empty(this.bodyEl, t('releaseCalendarLoading'), '', 'loader-circle');
            return;
        }
        const entries = this.filteredEntries();
        if (this.countEl) this.countEl.textContent = `${entries.length} ${t('releaseCalendarItems')}`;
        if (followResults && entries.length && entries[0].precision !== 'unknown' && !entries.some(entry => this.inCursorMonth(entry))) this.setCursor(entries[0].date);
        this.bodyEl.className = `lorebase-release-body is-${this.mode}`;
        if (!entries.length) {
            this.empty(this.bodyEl, this.query.trim() ? ct('noSearch') : t('releaseCalendarEmpty'),
                this.query.trim() ? ct('trySearch') : this.releaseScope === 'upcoming' ? t('releaseCalendarNoUpcoming') : t('releaseCalendarEmptyHint'));
            return;
        }
        if (this.mode === 'calendar') this.renderCalendar(entries);
        else this.renderMonths(entries);
    }

    private renderCalendar(entries: ReleaseCalendarEntry[]): void {
        if (!this.bodyEl) return;
        const monthEntries = entries.filter(entry => entry.precision !== 'unknown' && this.inCursorMonth(entry));
        const sidebar = this.bodyEl.createEl('section', { cls: 'lorebase-release-sidebar', attr: { 'aria-label': t('releaseCalendarView') } });
        const heading = sidebar.createDiv({ cls: 'lorebase-release-sidebar-heading' });
        const copy = heading.createDiv();
        copy.createSpan({ cls: 'lorebase-release-eyebrow', text: `${t('releaseCalendarView')} · ${this.cursor.getFullYear()}` });
        copy.createEl('h3', { text: this.formatMonth(this.cursor) });
        heading.createSpan({ cls: 'lorebase-release-month-total', text: `${monthEntries.length} ${t('releaseCalendarItems')}` });
        const controls = sidebar.createDiv({ cls: 'lorebase-release-calendar-controls' });
        this.iconButton(controls, 'chevron-left', t('releasePreviousMonth')).addEventListener('click', () => this.changeMonth(-1));
        const picker = controls.createDiv({ cls: 'lorebase-release-date-picker' });
        const month = picker.createDiv({ cls: 'lorebase-release-month-dropdown' });
        createLorebaseDropdown(month,
            Array.from({ length: 12 }, (_, index) => ({ value: String(index), label: this.formatMonthName(index) })),
            String(this.cursor.getMonth()), value => {
                this.setCursor(new Date(this.cursor.getFullYear(), Number(value), 1));
                this.renderBody();
            }, { floating: true });
        month.querySelector('button')?.setAttribute('aria-label', ct('months'));
        const year = picker.createDiv({ cls: 'lorebase-release-year-dropdown' });
        let min = Math.min(new Date().getFullYear() - 10, this.cursor.getFullYear());
        let max = Math.max(new Date().getFullYear() + 10, this.cursor.getFullYear());
        for (const entry of entries) {
            if (entry.precision === 'unknown') continue;
            min = Math.min(min, entry.date.getFullYear());
            max = Math.max(max, entry.date.getFullYear());
        }
        createLorebaseDropdown(year,
            Array.from({ length: max - min + 1 }, (_, index) => ({ value: String(min + index), label: String(min + index) })),
            String(this.cursor.getFullYear()), value => {
                this.setCursor(new Date(Number(value), this.cursor.getMonth(), 1));
                this.renderBody();
            }, { floating: true });
        year.querySelector('button')?.setAttribute('aria-label', ct('years'));
        const today = picker.createEl('button', { cls: 'lorebase-release-today', text: t('releaseToday'), attr: { type: 'button' } });
        today.addEventListener('click', () => {
            this.setCursor(new Date());
            this.selectedDay = dateKey(new Date());
            this.renderBody();
        });
        this.iconButton(controls, 'chevron-right', t('releaseNextMonth')).addEventListener('click', () => this.changeMonth(1));

        const days = new Map<string, ReleaseCalendarEntry[]>();
        for (const entry of entries) {
            if (entry.precision) continue;
            const group = days.get(entry.dateKey);
            if (group) group.push(entry);
            else days.set(entry.dateKey, [entry]);
        }
        const grid = sidebar.createDiv({ cls: 'lorebase-release-grid', attr: { 'aria-label': this.formatMonth(this.cursor) } });
        for (const label of this.weekdayLabels()) grid.createSpan({ cls: 'lorebase-release-weekday', text: label });
        const start = new Date(this.cursor.getFullYear(), this.cursor.getMonth(), 1 - (this.cursor.getDay() + 6) % 7);
        const todayKey = dateKey(new Date());
        for (let index = 0; index < 42; index++) {
            const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
            const key = dateKey(date);
            const releases = days.get(key) ?? [];
            const cell = grid.createEl('button', {
                cls: 'lorebase-release-day',
                attr: { type: 'button', 'data-date': key, 'aria-pressed': String(key === this.selectedDay),
                    'aria-label': `${this.formatDate(date)} · ${releases.length} ${t('releaseCalendarItems')}`,
                    title: [this.formatDate(date), ...releases.slice(0, 5).map(entry => entry.item.displayName)].join('\n') },
            });
            cell.toggleClass('is-outside', date.getMonth() !== this.cursor.getMonth());
            cell.toggleClass('is-today', key === todayKey);
            cell.toggleClass('is-selected', key === this.selectedDay);
            cell.toggleClass('has-releases', releases.length > 0);
            if (key === todayKey) cell.setAttribute('aria-current', 'date');
            cell.createSpan({ cls: 'lorebase-release-day-number', text: String(date.getDate()) });
            if (releases.length > 1) cell.createSpan({ cls: 'lorebase-release-day-total', text: String(releases.length), attr: { 'aria-hidden': 'true' } });
            if (releases.length) {
                const visibleCount = releases.length > 2 ? 1 : releases.length;
                const events = cell.createSpan({ cls: 'lorebase-release-day-events', attr: { 'aria-hidden': 'true' } });
                for (const entry of releases.slice(0, visibleCount)) events.createSpan({
                    cls: `lorebase-release-day-event is-${entry.item.type}`, text: entry.item.displayName,
                    attr: { title: entry.item.displayName },
                });
                if (releases.length > visibleCount) events.createSpan({ cls: 'lorebase-release-day-count', text: `+${releases.length - visibleCount} ${t('releaseMoreItems')}` });
                const dots = cell.createSpan({ cls: 'lorebase-release-day-dots', attr: { 'aria-hidden': 'true' } });
                for (const type of [...new Set(releases.map(entry => entry.item.type))].slice(0, 3)) dots.createSpan({ cls: `is-${type}` });
            }
            cell.addEventListener('click', () => {
                const selected = this.selectedDay === key;
                if (date.getMonth() !== this.cursor.getMonth() || date.getFullYear() !== this.cursor.getFullYear()) this.setCursor(date);
                this.selectedDay = selected ? null : key;
                this.renderBody();
                this.bodyEl?.querySelector<HTMLButtonElement>(`[data-date="${key}"]`)?.focus({ preventScroll: true });
            });
        }
        const foot = sidebar.createDiv({ cls: 'lorebase-release-sidebar-foot' });
        const legend = foot.createDiv({ cls: 'lorebase-release-legend' });
        legend.createSpan({ cls: 'is-today', text: t('releaseToday') });
        legend.createSpan({ cls: 'is-selected', text: ct('selected') });
        const action = foot.createDiv({ cls: 'lorebase-release-date-action' });
        const hint = action.createSpan({ cls: 'lorebase-release-sidebar-hint', text: ct('chooseDay'), attr: { title: ct('chooseDay') } });
        hint.hidden = Boolean(this.selectedDay);
        const reset = action.createEl('button', { cls: 'lorebase-release-all-dates', text: ct('nearest'), attr: { type: 'button' } });
        reset.hidden = !this.selectedDay;
        reset.addEventListener('click', () => { this.selectedDay = null; this.renderBody(); });

        const panel = this.bodyEl.createDiv({ cls: 'lorebase-release-gallery-panel' });
        const selected = entries.filter(entry => !entry.precision && (this.selectedDay ? entry.dateKey === this.selectedDay : entry.dateKey >= todayKey));
        // The nearest-release gallery spans every future month. Keep release
        // windows in that same list even when their year is beyond the grid.
        const approximateToday = new Date(); approximateToday.setHours(0,0,0,0);
        const approximate = entries.filter(entry => entry.precision && (this.selectedDay
            ? this.inCursorMonth(entry)
            : entry.precision === 'unknown' || (entry.endDate?.getTime() ?? 0) > approximateToday.getTime()));
        const title = this.selectedDay ? this.formatDate(new Date(`${this.selectedDay}T12:00:00`)) : ct('nearest');
        this.galleryHeading(panel, title, selected.length + approximate.length, this.selectedDay ? ct('dayHint') : ct('nearestHint'));
        const scroll = panel.createDiv({ cls: 'lorebase-release-gallery-scroll' });
        if (selected.length) renderReleaseGallery(scroll, selected, entry => void this.openEntry(entry.item));
        else if (!approximate.length) this.empty(scroll, this.selectedDay ? ct('noDay') : ct('noUpcoming'), ct('noUpcomingHint'));
        if (approximate.length) {
            scroll.createEl('h3',{text:releaseDateText('approximate')});
            renderReleaseGallery(scroll,approximate,entry=>void this.openEntry(entry.item));
        }
    }

    private renderMonths(entries: ReleaseCalendarEntry[]): void {
        if (!this.bodyEl) return;
        const panel = this.bodyEl.createDiv({ cls: 'lorebase-release-gallery-panel' });
        const scroll = panel.createDiv({ cls: 'lorebase-release-gallery-scroll lorebase-release-timeline-scroll' });
        renderReleaseTimeline(scroll, entries, this.collapsedMonths, entry => void this.openEntry(entry.item));
    }

    private galleryHeading(parent: HTMLElement, title: string, count: number, hint: string): void {
        const header = parent.createDiv({ cls: 'lorebase-release-gallery-heading' });
        const copy = header.createDiv();
        const heading = copy.createDiv({ cls: 'lorebase-release-gallery-title' });
        heading.createEl('h3', { text: title });
        heading.createSpan({ cls: 'lorebase-release-total', text: String(count) });
        copy.createDiv({ cls: 'lorebase-release-subtitle', text: hint });
    }

    private choice(parent: HTMLElement, icon: string, label: string, active: boolean, onClick: () => void): HTMLButtonElement {
        const button = parent.createEl('button', {
            cls: 'lorebase-release-choice', attr: { type: 'button', 'aria-pressed': String(active) },
        });
        button.toggleClass('is-active', active);
        if (icon) setIcon(button.createSpan(), icon);
        button.createSpan({ text: label });
        button.addEventListener('click', onClick);
        return button;
    }

    private iconButton(parent: HTMLElement, icon: string, label: string): HTMLButtonElement {
        const button = parent.createEl('button', { cls: 'lorebase-release-icon-btn', attr: { type: 'button', 'aria-label': label, title: label } });
        setIcon(button, icon);
        return button;
    }

    private empty(parent: HTMLElement, title: string, hint: string, icon = 'calendar-search'): HTMLElement {
        const empty = parent.createDiv({ cls: 'lorebase-release-empty', attr: { role: 'status' } });
        setIcon(empty.createSpan(), icon);
        empty.createEl('strong', { text: title });
        if (hint) empty.createSpan({ text: hint });
        return empty;
    }

    private changeMonth(delta: number): void {
        this.setCursor(new Date(this.cursor.getFullYear(), this.cursor.getMonth() + delta, 1));
        this.renderBody();
    }

    private setCursor(date: Date): void {
        this.cursor = new Date(date.getFullYear(), date.getMonth(), 1);
        this.selectedDay = null;
    }

    private monthKey(): string { return dateKey(this.cursor).slice(0, 7); }

    private inCursorMonth(entry:ReleaseCalendarEntry):boolean {
        if(!entry.precision) return entry.monthKey === this.monthKey();
        if(entry.precision === 'unknown') return true;
        const start=new Date(this.cursor.getFullYear(),this.cursor.getMonth(),1).getTime();
        const end=new Date(this.cursor.getFullYear(),this.cursor.getMonth()+1,1).getTime();
        return entry.date.getTime() < end && (entry.endDate?.getTime() ?? 0) > start;
    }

    private async openEntry(item: MediaItem): Promise<void> {
        this.close();
        await this.openItem(item);
    }

    private formatMonth(date: Date): string {
        return this.capitalize(new Intl.DateTimeFormat(i18n.getLocale(), { month: 'long', year: 'numeric' }).format(date));
    }

    private formatMonthName(month: number): string {
        return this.capitalize(new Intl.DateTimeFormat(i18n.getLocale(), { month: 'long' }).format(new Date(2024, month, 1)));
    }

    private formatDate(date: Date): string {
        return new Intl.DateTimeFormat(i18n.getLocale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    }

    private capitalize(value: string): string { return value.charAt(0).toLocaleUpperCase(i18n.getLocale()) + value.slice(1); }

    private weekdayLabels(): string[] {
        return Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(i18n.getLocale(), { weekday: 'short' })
            .format(new Date(2024, 0, 1 + index)).replace('.', ''));
    }
}
