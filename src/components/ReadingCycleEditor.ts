
import { setIcon } from 'obsidian';
import { t } from '../localization';
import { readingCycleText as text } from '../localization/readingCycle';
import type { RatingScaleSettings, ReadingItem } from '../types';
import { getReadingCycle, planReadingCycleSave, type ReadingCycleChange, type ReadingCycleUpdates } from '../services/media/readingCycle';
import { getStatusOptionsForMediaType } from '../views/library/viewOptions';
import { createLorebaseDropdown } from './LorebaseDropdown';
import { mountPartRating } from './PartRatingControl';
import { DEFAULT_COVER } from '../constants';
import { getStatusAppearance } from '../statusPresentation';

export interface ReadingCycleLibrary {
    items: ReadingItem[];
    save: (changes: ReadingCycleChange[]) => Promise<void>;
}

export class ReadingCycleEditor {
    private members: ReadingItem[];
    private originals = new Map<string, ReadingItem>();
    private drafts = new Map<string, ReadingCycleUpdates>();
    private active: string;
    private root!: HTMLElement;
    private tabs!: HTMLElement;
    private panel!: HTMLElement;
    private picker!: HTMLElement;

    constructor(
        private current: ReadingItem, private library: ReadingCycleLibrary, private scale: RatingScaleSettings,
        private readCurrent: () => ReadingItem, private changeCurrent: (updates: ReadingCycleUpdates) => void,
        private openNote: (path: string) => void,
    ) {
        this.members = getReadingCycle(library.items, current);
        this.members.forEach(item => this.originals.set(item.filePath, item));
        this.active = this.members.find(item => item.filePath !== current.filePath)?.filePath ?? '';
    }

    mount(host: HTMLElement): void {
        this.root = host.createEl('section', { cls: 'lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-reading-cycle', attr: { 'data-role': 'reading-cycle', 'data-mobile-pane': 'personal' } });
        const heading = this.root.createDiv({ cls: 'lorebase-editmode-panel-title-row' });
        heading.createEl('h3', { cls: 'lorebase-editmode-panel-title', text: text('title') });
        const add = heading.createEl('button', { cls: 'lorebase-reading-cycle-add', text: '+ ' + text('add'), attr: { type: 'button', 'aria-expanded': 'false' } });
        this.root.createEl('p', { cls: 'lorebase-reading-cycle-hint', text: text(this.current.type === 'book' ? 'otherBooks' : 'otherManga') });
        this.picker = this.root.createDiv({ cls: 'lorebase-reading-cycle-picker' });
        this.picker.hidden = true;
        add.addEventListener('click', () => {
            this.picker.hidden = !this.picker.hidden;
            add.setAttribute('aria-expanded', String(!this.picker.hidden));
            if (!this.picker.hidden) this.renderPicker();
        });
        this.tabs = this.root.createDiv({ cls: 'lorebase-reading-cycle-tabs', attr: { role: 'tablist', 'aria-label': text('title') } });
        this.panel = this.root.createDiv({ cls: 'lorebase-reading-cycle-entry', attr: { role: 'tabpanel' } });
        this.root.createDiv({ cls: 'lorebase-reading-cycle-hint', text: text('saved') });
        this.render();
    }

    getChanges(): ReadingCycleChange[] {
        return planReadingCycleSave([...this.originals.values()], this.members, this.drafts);
    }

    prepareSave(): boolean {
        const inputs = Array.from(this.root.querySelectorAll<HTMLInputElement>('input'));
        if (!inputs.every(input => input.reportValidity())) return false;
        const active = this.root.ownerDocument.activeElement;
        if (active instanceof HTMLInputElement && active.type === 'number' && this.root.contains(active)) active.dispatchEvent(new Event('change'));
        return true;
    }

    refreshCurrent(): void {
        if (this.active === this.current.filePath && this.panel && !this.panel.contains(this.panel.ownerDocument.activeElement)) this.render();
    }

    private read(item: ReadingItem): ReadingItem {
        return item.filePath === this.current.filePath ? this.readCurrent() : { ...item, ...this.drafts.get(item.filePath) } as ReadingItem;
    }

    private stage(item: ReadingItem, updates: ReadingCycleUpdates): void {
        const value = this.read(item);
        if (value.type === 'manga' && value.parts?.length && ('chapterCurrent' in updates || 'chapterTotal' in updates)) {
            const activeId = updates.activePartId ?? value.activePartId ?? value.parts[0].id;
            updates = { ...updates, parts: value.parts.map(part => part.id !== activeId ? { ...part } : {
                ...part, ...('chapterCurrent' in updates ? { chapterCurrent: updates.chapterCurrent } : {}),
                ...('chapterTotal' in updates ? { chapterTotal: updates.chapterTotal } : {}),
                ...('status' in updates ? { status: updates.status } : {}),
            }) } as ReadingCycleUpdates;
        }
        if (item.filePath === this.current.filePath) this.changeCurrent(updates);
        else this.drafts.set(item.filePath, { ...this.drafts.get(item.filePath), ...updates } as ReadingCycleUpdates);
    }

    private iconButton(host: HTMLElement, icon: string, label: string, action: () => void): HTMLButtonElement {
        const button = host.createEl('button', { cls: 'lorebase-reading-cycle-icon', attr: { type: 'button', 'aria-label': label, title: label } });
        setIcon(button, icon); button.addEventListener('click', action);
        return button;
    }

    private render(): void {
        this.tabs.empty();
        const others = this.members.filter(item => item.filePath !== this.current.filePath);
        this.tabs.hidden = others.length < 2;
        for (const item of others) {
            const tab = this.tabs.createEl('button', { text: item.displayName, attr: { type: 'button', role: 'tab', 'aria-selected': String(item.filePath === this.active), 'data-path': item.filePath } });
            tab.style.setProperty('--cycle-status-color', getStatusAppearance(item.type, this.read(item).status).color);
            tab.addEventListener('click', () => { this.active = item.filePath; this.render(); });
        }
        this.panel.empty();
        if (!others.length) {
            this.panel.createEl('p', { cls: 'lorebase-reading-cycle-hint', text: text('empty') });
            return;
        }
        const item = others.find(member => member.filePath === this.active) ?? others[0];
        this.active = item.filePath;
        const value = this.read(item);
        this.panel.createEl('img', { cls: 'lorebase-reading-cycle-cover', attr: { src: value.imageUrl || DEFAULT_COVER, alt: '', loading: 'lazy' } });
        const content = this.panel.createDiv({ cls: 'lorebase-reading-cycle-content' });
        const header = content.createDiv({ cls: 'lorebase-reading-cycle-header' });
        const identity = header.createDiv({ cls: 'lorebase-reading-cycle-identity' });
        identity.createEl('strong', { text: value.displayName });
        identity.createDiv({ cls: 'lorebase-reading-cycle-authors', text: value.authors.join(', ') });
        const rating = header.createDiv({ cls: 'lorebase-reading-cycle-rating' });
        rating.createSpan({ text: text('rating') });
        mountPartRating(rating, { ...this.scale, classicPreset: 'standard' }, value.userRating, text('rating'), score => this.stage(item, { userRating: score }));

        const menu = this.panel.createEl('details', { cls: 'lorebase-reading-cycle-menu' });
        const summary = menu.createEl('summary', { attr: { 'aria-label': text('actions'), title: text('actions') } });
        setIcon(summary, 'ellipsis');
        const tools = menu.createDiv({ cls: 'lorebase-reading-cycle-tools' });
        const action = (icon: string, label: string, run: () => void): HTMLButtonElement => {
            const button = this.iconButton(tools, icon, label, () => { menu.open = false; run(); });
            button.createSpan({ text: label });
            return button;
        };
        const index = others.indexOf(item);
        action('arrow-left', text('earlier'), () => this.move(index, -1)).disabled = index <= 0;
        action('arrow-right', text('later'), () => this.move(index, 1)).disabled = index >= others.length - 1;
        action('file-text', text('open'), () => this.openNote(item.filePath));
        action('unlink', text('remove'), () => {
            this.members = this.members.filter(member => member.filePath !== item.filePath);
            this.drafts.delete(item.filePath);
            this.active = this.members.find(member => member.filePath !== this.current.filePath)?.filePath ?? '';
            this.render();
        });
        menu.addEventListener('focusout', event => {
            if (!menu.contains(event.relatedTarget as Node | null)) menu.open = false;
        });
        menu.addEventListener('keydown', event => {
            if (event.key === 'Escape') { menu.open = false; summary.focus(); }
        });
        const status = content.createDiv({ cls: 'lorebase-reading-cycle-status' });
        createLorebaseDropdown(status, getStatusOptionsForMediaType(value.type).map(option => ({ value: option.status, label: option.label })), value.status, next => {
            const patch: ReadingCycleUpdates = { status: next as ReadingItem['status'] };
            if (next === 'completed') {
                if (value.type === 'book' && value.pageTotal) patch.pageCurrent = value.pageTotal;
                if (value.chapterTotal) patch.chapterCurrent = value.chapterTotal;
            }
            this.stage(item, patch); this.render();
        }, { floating: true, minPanelWidth: 170 });
        const statusButton = status.querySelector('button')!;
        statusButton.setAttribute('aria-label', t('editStatus'));
        const appearance = getStatusAppearance(value.type, value.status);
        statusButton.style.setProperty('--cycle-status-color', appearance.color);
        const statusIcon = statusButton.createSpan({ cls: 'lorebase-reading-cycle-status-icon', attr: { 'aria-hidden': 'true' } });
        setIcon(statusIcon, appearance.icon);
        statusButton.prepend(statusIcon);
        const fields = content.createDiv({ cls: 'lorebase-reading-cycle-fields' });
        const field = (host: HTMLElement, key: string, label: string, number: number | null, caption: string): void => {
            const holder = host.createEl('label');
            holder.createSpan({ text: caption });
            const fractional=value.type === 'manga' && key === 'chapterCurrent';
            const input = holder.createEl('input', { attr: { type: 'number', min: '0', step: fractional ? 'any' : '1', 'data-field': key, 'aria-label': label, placeholder: '—' } });
            input.value = number === null ? '' : String(number);
            input.addEventListener('change', () => {
                if (!input.reportValidity()) return;
                const parsed = input.value === '' ? null : Number(input.value);
                if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || !fractional && !Number.isInteger(parsed))) return;
                const patch: ReadingCycleUpdates = { [key]: parsed };
                const next = { ...this.read(item), ...patch } as ReadingItem;
                if (next.type === 'manga' && key === 'volumeCurrent') {
                    const part = next.parts?.find(part => part.volumeNumber === parsed);
                    if (part) Object.assign(patch, { activePartId: part.id, chapterCurrent: part.chapterCurrent, chapterTotal: part.chapterTotal, status: part.status });
                }
                Object.assign(next, patch);
                const total = next.type === 'book' ? next.pageTotal : next.chapterTotal;
                const current = next.type === 'book' ? next.pageCurrent : next.chapterCurrent;
                if (total && current !== null && current >= total) {
                    patch[next.type === 'book' ? 'pageCurrent' : 'chapterCurrent'] = total;
                    patch.status = 'completed';
                }
                this.stage(item, patch); this.render();
            });
        };
        const progress = (kind: 'pages' | 'chapters' | 'volumes', currentKey: string, totalKey: string,
            current: number | null, total: number | null, currentLabel: string, totalLabel: string): void => {
            const known = total !== null && Number.isFinite(total) && total > 0;
            const percent = known ? Math.round(Math.min(1, Math.max(0, (current ?? 0) / total)) * 100) : null;
            const tile = fields.createDiv({ cls: 'lorebase-reading-cycle-progress', attr: { 'data-progress-kind': kind } });
            const ring = tile.createDiv({ cls: 'lorebase-reading-cycle-ring', attr: {
                role: 'progressbar', 'aria-label': text(kind), 'aria-valuemin': '0', 'aria-valuemax': '100',
            } });
            ring.style.setProperty('--cycle-progress', String(percent ?? 0) + '%');
            if (percent !== null) ring.setAttribute('aria-valuenow', String(percent));
            else ring.setAttribute('aria-valuetext', text('unknown'));
            ring.createSpan({ text: percent === null ? '—' : String(percent) + '%', attr: { 'aria-hidden': 'true' } });
            const body = tile.createDiv({ cls: 'lorebase-reading-cycle-progress-body' });
            body.createSpan({ cls: 'lorebase-reading-cycle-progress-title', text: text(kind) });
            const inputs = body.createDiv({ cls: 'lorebase-reading-cycle-progress-inputs' });
            field(inputs, currentKey, currentLabel, current, text('current'));
            field(inputs, totalKey, totalLabel, total, text('total'));
        };
        if (value.type === 'book') {
            progress('pages', 'pageCurrent', 'pageTotal', value.pageCurrent, value.pageTotal, t('editPageCurrent'), t('editPageTotal'));
            progress('chapters', 'chapterCurrent', 'chapterTotal', value.chapterCurrent, value.chapterTotal, t('editChapterCurrent'), t('editChapterTotal'));
        } else {
            progress('chapters', 'chapterCurrent', 'chapterTotal', value.chapterCurrent, value.chapterTotal, t('editChapterCurrent'), t('editChapterTotal'));
            progress('volumes', 'volumeCurrent', 'volumeTotal', value.volumeCurrent, value.volumeTotal, t('editVolumeCurrent'), t('editVolumeTotal'));
        }
    }

    private move(index: number, offset: number): void {
        const others = this.members.filter(item => item.filePath !== this.current.filePath);
        const from = this.members.indexOf(others[index]), to = this.members.indexOf(others[index + offset]);
        if (from < 0 || to < 0) return;
        [this.members[from], this.members[to]] = [this.members[to], this.members[from]];
        this.render();
    }

    private renderPicker(): void {
        this.picker.empty();
        const search = this.picker.createEl('input', { attr: { type: 'search', placeholder: text('search'), 'aria-label': text('search') } });
        const list = this.picker.createDiv({ cls: 'lorebase-reading-cycle-candidates' });
        const draw = (): void => {
            list.empty();
            const existing = new Set(this.members.map(item => item.filePath));
            const query = search.value.trim().toLocaleLowerCase();
            const options = this.library.items.filter(item => item.type === this.current.type && !existing.has(item.filePath)
                && (item.displayName + ' ' + item.authors.join(' ')).toLocaleLowerCase().includes(query));
            if (!options.length) list.createDiv({ text: text('none') });
            for (const item of options) {
                const button = list.createEl('button', { attr: { type: 'button', 'data-path': item.filePath } });
                button.createEl('img', { attr: { src: item.imageUrl || DEFAULT_COVER, alt: '', loading: 'lazy' } });
                const caption = button.createSpan({ cls: 'lorebase-reading-cycle-candidate-text' });
                caption.createEl('strong', { text: item.displayName });
                caption.createSpan({ text: item.authors.join(', ') });
                const plus = button.createSpan({ cls: 'lorebase-reading-cycle-candidate-add', attr: { 'aria-hidden': 'true' } });
                setIcon(plus, 'plus');
                button.addEventListener('click', () => {
                    for (const member of getReadingCycle(this.library.items, item)) {
                        if (!this.originals.has(member.filePath)) this.originals.set(member.filePath, member);
                        if (!this.members.some(entry => entry.filePath === member.filePath)) this.members.push(member);
                    }
                    this.active = item.filePath;
                    this.picker.hidden = true;
                    this.root.querySelector('button[aria-expanded]')?.setAttribute('aria-expanded', 'false');
                    this.render();
                });
            }
        };
        search.addEventListener('input', draw); draw(); search.focus();
    }
}
