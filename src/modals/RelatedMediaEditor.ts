
import { App, Menu, Modal, setIcon } from 'obsidian';
import { DEFAULT_COVER } from '../constants';
import { t } from '../localization';
import { compactGameText } from '../localization/compactGameEditor';
import { MEDIA_ICONS } from '../mediaPresentation';
import { addWorkspaceModalClose } from '../components/WorkspaceModalChrome';
import type { RelatedMediaLink } from '../types';

export class RelatedMediaEditor {
    private values: RelatedMediaLink[];
    private candidates: RelatedMediaLink[];
    private incoming: RelatedMediaLink[];
    private draggedPath: string | null = null;

    constructor(
        private app: App,
        currentPath: string,
        values: RelatedMediaLink[] = [],
        candidates: RelatedMediaLink[] = [],
        incoming: RelatedMediaLink[] = [],
        private compact = false
    ) {
        this.values = normalizeRelatedMedia(values);
        this.candidates = normalizeRelatedMedia(candidates)
            .filter((candidate) => candidate.path !== currentPath);
        this.incoming = normalizeRelatedMedia(incoming)
            .filter((candidate) => candidate.path !== currentPath);
    }

    bind(root: HTMLElement): void {
        root.querySelector<HTMLButtonElement>('[data-action="add-related"]')
            ?.addEventListener('click', () => {
                const selected = new Set(this.values.map((item) => item.path));
                const candidates = this.candidates.filter((candidate) => !selected.has(candidate.path));
                new RelatedMediaPickerModal(this.app, candidates, (picked) => {
                    this.values = normalizeRelatedMedia([...this.values, ...picked]);
                    this.render(root);
                }, this.compact).open();
            });
        this.render(root);
    }

    getValue(): RelatedMediaLink[] {
        return this.values.map((item) => ({ ...item }));
    }

    private render(root: HTMLElement): void {
        const container = root.querySelector<HTMLElement>('[data-role="related-media"]');
        if (!container) return;
        container.empty();

        const outgoingPaths = new Set(this.values.map((item) => item.path));
        const incomingOnly = this.incoming.filter((item) => !outgoingPaths.has(item.path));
        const displayItems = [...this.values, ...incomingOnly];
        if (!displayItems.length) {
            container.createDiv({ cls: 'lorebase-editmode-related-empty', text: t('editRelatedEmpty') });
            return;
        }

        for (const item of displayItems) {
            const outgoingIndex = this.values.findIndex((entry) => entry.path === item.path);
            this.renderItem(container, item, outgoingIndex, root);
        }
    }

    private renderItem(
        container: HTMLElement,
        item: RelatedMediaLink,
        outgoingIndex: number,
        root: HTMLElement
    ): void {
        const readonly = outgoingIndex < 0;
        const candidate = this.candidates.find((entry) => entry.path === item.path);
        const imageUrl = item.imageUrl || candidate?.imageUrl || DEFAULT_COVER;
        const row = container.createDiv({
            cls: `lorebase-editmode-related-item${readonly ? ' is-readonly' : ''}`,
            attr: {
                title: item.title || item.path,
                draggable: String(!readonly),
                'data-path': item.path,
            },
        });
        if (!readonly) this.bindDrag(row, item.path, root);
        const image = row.createDiv({ cls: 'lorebase-editmode-related-image' });
        image.style.backgroundImage = `url("${imageUrl.replace(/"/g, '\\"')}")`;
        const typeLabel = getRelatedTypeLabel(item.type);
        if (this.compact) {
            const info = row.createDiv({ cls: 'lorebase-game-related-info' });
            info.createSpan({ cls: 'lorebase-editmode-related-title', text: item.title || item.path });
            info.createSpan({ cls: 'lorebase-game-related-meta', text: readonly ? `${typeLabel} · ${compactGameText('incoming')}` : typeLabel });
            if (!readonly) this.renderLinkActions(row, item, outgoingIndex, root);
            return;
        }
        image.createSpan({ cls: 'lorebase-editmode-related-type', text: typeLabel });
        image.style.height = '120px';
        image.style.minHeight = '120px';
        row.createSpan({ cls: 'lorebase-editmode-related-title', text: item.title || item.path });
        if (readonly) return;

        const order = row.createDiv({ cls: 'lorebase-editmode-related-order' });
        const up = order.createEl('button', {
            cls: 'lorebase-editmode-related-order-btn',
            text: '↑',
            attr: { type: 'button', 'aria-label': compactGameText('moveUp') },
        });
        up.disabled = outgoingIndex === 0;
        up.toggleClass('is-disabled', up.disabled);
        up.addEventListener('click', (event) => {
            event.stopPropagation();
            this.move(outgoingIndex, -1);
            this.render(root);
        });

        const down = order.createEl('button', {
            cls: 'lorebase-editmode-related-order-btn',
            text: '↓',
            attr: { type: 'button', 'aria-label': compactGameText('moveDown') },
        });
        down.disabled = outgoingIndex === this.values.length - 1;
        down.toggleClass('is-disabled', down.disabled);
        down.addEventListener('click', (event) => {
            event.stopPropagation();
            this.move(outgoingIndex, 1);
            this.render(root);
        });

        const remove = row.createEl('button', {
            cls: 'lorebase-editmode-related-remove',
            text: '×',
            attr: { type: 'button', 'aria-label': t('editRemoveHint') },
        });
        remove.addEventListener('click', (event) => {
            event.stopPropagation();
            this.values = this.values.filter((entry) => entry.path !== item.path);
            this.render(root);
        });
    }

    private renderLinkActions(row: HTMLElement, item: RelatedMediaLink, index: number, root: HTMLElement): void {
        const label = compactGameText('relatedActions');
        const button = row.createEl('button', {
            cls: 'lorebase-game-related-actions',
            attr: { type: 'button', 'aria-haspopup': 'menu', 'aria-label': `${label}: ${item.title}`, title: label },
        });
        setIcon(button, 'ellipsis');
        button.addEventListener('click', () => {
            const menu = new Menu();
            const move = (direction: -1 | 1): void => {
                this.move(index, direction);
                this.render(root);
                const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-role="related-media"] [data-path]'));
                rows.find(row => row.dataset.path === item.path)?.querySelector<HTMLButtonElement>('.lorebase-game-related-actions')?.focus({ preventScroll: true });
            };
            if (index > 0) menu.addItem(action => action.setTitle(compactGameText('moveUp')).setIcon('arrow-up').onClick(() => move(-1)));
            if (index < this.values.length - 1) menu.addItem(action => action.setTitle(compactGameText('moveDown')).setIcon('arrow-down').onClick(() => move(1)));
            menu.addItem(action => action.setTitle(compactGameText('removeLink')).setIcon('unlink').onClick(() => {
                this.values = this.values.filter(entry => entry.path !== item.path);
                this.render(root);
                root.querySelector<HTMLButtonElement>('[data-action="add-related"]')?.focus({ preventScroll: true });
            }));
            const rect = button.getBoundingClientRect();
            menu.showAtPosition({ x: rect.left, y: rect.bottom });
        });
    }

    private bindDrag(card: HTMLElement, targetPath: string, root: HTMLElement): void {
        card.addEventListener('dragstart', (event) => {
            if ((event.target as HTMLElement | null)?.closest('button')) {
                event.preventDefault();
                return;
            }
            this.draggedPath = targetPath;
            card.addClass('is-dragging');
            event.dataTransfer?.setData('text/plain', targetPath);
            if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        });
        card.addEventListener('dragover', (event) => {
            if (!this.draggedPath || this.draggedPath === targetPath) return;
            event.preventDefault();
            card.addClass('is-drop-target');
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        });
        card.addEventListener('dragleave', () => {
            card.removeClass('is-drop-target');
        });
        card.addEventListener('drop', (event) => {
            event.preventDefault();
            card.removeClass('is-drop-target');
            const draggedPath = this.draggedPath;
            this.draggedPath = null;
            if (!draggedPath || draggedPath === targetPath) return;
            this.reorder(draggedPath, targetPath);
            this.render(root);
        });
        card.addEventListener('dragend', () => {
            this.draggedPath = null;
            root.querySelectorAll<HTMLElement>('.lorebase-editmode-related-item').forEach((item) => {
                item.removeClass('is-dragging');
                item.removeClass('is-drop-target');
            });
        });
    }

    private reorder(draggedPath: string, targetPath: string): void {
        const next = [...this.values];
        const from = next.findIndex((item) => item.path === draggedPath);
        const to = next.findIndex((item) => item.path === targetPath);
        if (from < 0 || to < 0 || from === to) return;
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        this.values = next;
    }

    private move(index: number, direction: -1 | 1): void {
        const target = index + direction;
        if (index < 0 || target < 0 || target >= this.values.length) return;
        const next = [...this.values];
        [next[index], next[target]] = [next[target], next[index]];
        this.values = next;
    }
}

class RelatedMediaPickerModal extends Modal {
    private query = '';
    private mediaFilter: RelatedMediaLink['type'] | 'all';
    private listEl: HTMLElement | null = null;
    private footerEl: HTMLElement | null = null;
    private addButton: HTMLButtonElement | null = null;
    private selectedPaths = new Set<string>();
    private selectedOrder: string[] = [];

    constructor(
        app: App,
        private candidates: RelatedMediaLink[],
        private onPick: (candidates: RelatedMediaLink[]) => void,
        private compact: boolean,
    ) {
        super(app);
        this.mediaFilter = compact ? 'all' : 'anime';
    }

    onOpen(): void {
        this.contentEl.empty();
        this.contentEl.addClass('lorebase-related-picker', 'lorebase-modal-panel', 'lorebase-select-modal', 'lorebase-add-workspace');
        this.modalEl.addClass('lorebase-related-picker-container');
        this.modalEl.toggleClass('lorebase-compact-related-picker', this.compact);

        const header = this.contentEl.createDiv({ cls: 'lorebase-related-picker-header lorebase-select-header' });
        const titleRow = header.createDiv({ cls: 'lorebase-select-title-row' });
        setIcon(titleRow.createSpan({ cls: 'lorebase-select-title-icon', attr: { 'aria-hidden': 'true' } }), 'link');
        titleRow.createEl('h2', { cls: 'lorebase-select-title', text: t('editRelatedPickerTitle') });
        addWorkspaceModalClose(this.modalEl, titleRow, () => this.close());

        const searchShell = this.contentEl.createDiv({ cls: 'lorebase-select-search-shell' });
        const searchWrap = searchShell.createDiv({ cls: 'lorebase-select-search-wrap' });
        const searchField = searchWrap.createDiv({ cls: 'lorebase-select-search-field' });
        setIcon(searchField.createSpan({ cls: 'lorebase-select-search-icon', attr: { 'aria-hidden': 'true' } }), 'search');
        const search = searchField.createEl('input', {
            cls: 'lorebase-select-search lorebase-related-picker-search',
            attr: { type: 'search', placeholder: t('promptSearchPlaceholder'), 'aria-label': t('promptSearchPlaceholder') },
        });
        const runSearch = (): void => {
            this.query = search.value.trim().toLowerCase();
            this.renderList();
            if (this.listEl) this.listEl.scrollTop = 0;
        };
        search.addEventListener('input', runSearch);
        search.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            runSearch();
        });
        const searchButton = searchWrap.createEl('button', {
            cls: 'lorebase-select-search-submit',
            attr: { type: 'button', title: t('promptSearchAction'), 'aria-label': t('promptSearchAction') },
        });
        setIcon(searchButton.createSpan({ cls: 'lorebase-select-search-submit-icon', attr: { 'aria-hidden': 'true' } }), 'search');
        searchButton.addEventListener('click', runSearch);

        const filters = this.contentEl.createDiv({ cls: 'lorebase-related-picker-filters' });
        const types: Array<{ value: RelatedMediaLink['type'] | 'all'; label: string }> = getRelatedTypeOptions();
        if (this.compact) types.unshift({ value: 'all', label: compactGameText('allMedia') });
        for (const option of types) {
            const button = filters.createEl('button', {
                cls: `lorebase-related-picker-filter is-${option.value} ${this.mediaFilter === option.value ? 'is-active' : ''}`,
                attr: { type: 'button', 'aria-pressed': String(this.mediaFilter === option.value) },
            });
            setIcon(button.createSpan({ attr: { 'aria-hidden': 'true' } }), option.value === 'all' ? 'layers' : MEDIA_ICONS[option.value]);
            button.createSpan({ text: option.label });
            button.addEventListener('click', () => {
                this.mediaFilter = option.value;
                filters.querySelectorAll<HTMLButtonElement>('.lorebase-related-picker-filter').forEach((entry) => {
                    const active = entry === button;
                    entry.toggleClass('is-active', active);
                    entry.setAttr('aria-pressed', String(active));
                });
                this.renderList();
                if (this.listEl) this.listEl.scrollTop = 0;
            });
        }

        this.listEl = this.contentEl.createDiv({ cls: 'lorebase-related-picker-grid lorebase-select-grid lorebase-select-search-grid' });
        const footer = this.contentEl.createDiv({ cls: 'lorebase-related-picker-footer lorebase-select-footer' });
        this.footerEl = footer.createSpan({ cls: 'lorebase-related-picker-selected', attr: { role: 'status', 'aria-live': 'polite' } });
        const actions = footer.createDiv({ cls: 'lorebase-related-picker-actions' });
        const cancel = actions.createEl('button', {
            cls: 'lorebase-flow-btn lorebase-flow-btn-secondary', text: t('commonCancel'), attr: { type: 'button' },
        });
        cancel.addEventListener('click', () => this.close());
        this.addButton = actions.createEl('button', { cls: 'lorebase-flow-btn lorebase-flow-btn-primary', attr: { type: 'button' } });
        setIcon(this.addButton.createSpan({ cls: 'lorebase-flow-btn-icon', attr: { 'aria-hidden': 'true' } }), 'plus');
        this.addButton.createSpan({ cls: 'lorebase-flow-btn-label' });
        this.addButton.addEventListener('click', () => {
            const picked = this.selectedOrder
                .map((path) => this.candidates.find((candidate) => candidate.path === path))
                .filter((candidate): candidate is RelatedMediaLink => Boolean(candidate));
            if (!picked.length) return;
            this.onPick(picked);
            this.close();
        });
        this.renderList();
        this.renderFooter();
        search.focus();
    }

    onClose(): void {
        this.contentEl.empty();
        this.listEl = null;
        this.footerEl = null;
        this.addButton = null;
        this.modalEl.removeClass('lorebase-related-picker-container');
        this.modalEl.removeClass('lorebase-compact-related-picker');
    }

    private renderList(): void {
        if (!this.listEl) return;
        this.listEl.empty();
        const items = this.candidates
            .filter((candidate) => {
                const typeMatches = this.mediaFilter === 'all' || candidate.type === this.mediaFilter;
                if (this.compact && !typeMatches) return false;
                if (!this.query) return typeMatches;
                return candidate.title.toLowerCase().includes(this.query)
                    || candidate.path.toLowerCase().includes(this.query);
            })
            .slice(0, 80);
        if (!items.length) {
            this.listEl.createDiv({ cls: 'lorebase-editmode-related-empty lorebase-related-picker-empty', text: t('editRelatedEmpty'), attr: { role: 'status' } });
            return;
        }

        for (const item of items) {
            const selected = this.selectedPaths.has(item.path);
            const card = this.listEl.createEl('button', {
                cls: `lorebase-related-picker-card lorebase-select-card is-${item.type} ${selected ? 'is-selected is-picked' : ''}`,
                attr: { type: 'button', title: item.path, 'aria-label': `${item.title} · ${getRelatedTypeLabel(item.type)}`, 'aria-pressed': String(selected), 'data-path': item.path },
            });
            const image = card.createDiv({ cls: 'lorebase-select-card-image' });
            image.toggleClass('is-empty', !item.imageUrl);
            setIcon(image.createSpan({ cls: 'lorebase-select-empty-poster-icon', attr: { 'aria-hidden': 'true' } }), MEDIA_ICONS[item.type]);
            if (item.imageUrl) {
                const poster = image.createEl('img', { attr: { src: item.imageUrl, alt: '', loading: 'lazy' } });
                poster.addEventListener('error', () => {
                    poster.remove();
                    image.addClass('is-empty');
                }, { once: true });
            }
            const typeLabel = getRelatedTypeLabel(item.type);
            const badge = image.createSpan({ cls: 'lorebase-select-classification lorebase-related-picker-card-type' });
            setIcon(badge.createSpan({ attr: { 'aria-hidden': 'true' } }), MEDIA_ICONS[item.type]);
            badge.createSpan({ text: typeLabel });
            card.createSpan({ cls: 'lorebase-select-card-check', attr: { 'aria-hidden': 'true' } });
            const body = card.createDiv({ cls: 'lorebase-select-card-body' });
            body.createDiv({ cls: 'lorebase-select-card-title', text: item.title });
            card.addEventListener('click', () => {
                this.toggle(item.path);
                const pressed = this.selectedPaths.has(item.path);
                card.toggleClass('is-selected', pressed);
                card.toggleClass('is-picked', pressed);
                card.setAttribute('aria-pressed', String(pressed));
                this.renderFooter();
            });
        }
    }

    private toggle(path: string): void {
        if (this.selectedPaths.has(path)) {
            this.selectedPaths.delete(path);
            this.selectedOrder = this.selectedOrder.filter((entry) => entry !== path);
            return;
        }
        this.selectedPaths.add(path);
        this.selectedOrder.push(path);
    }

    private renderFooter(): void {
        if (!this.footerEl || !this.addButton) return;
        const count = this.selectedPaths.size;
        this.footerEl.setText(count ? `${t('promptSelectedLabel')}: ${count}` : '');
        this.addButton.querySelector('.lorebase-flow-btn-label')?.setText(count ? `${t('promptAddSelected')} (${count})` : t('promptAddSelected'));
        this.addButton.disabled = count === 0;
    }
}

function normalizeRelatedMedia(values: RelatedMediaLink[]): RelatedMediaLink[] {
    const unique = new Map<string, RelatedMediaLink>();
    for (const value of values) {
        const path = value.path?.trim();
        if (!path) continue;
        unique.set(path, {
            type: value.type,
            path,
            title: value.title?.trim() || path.split('/').pop()?.replace(/\.md$/i, '') || path,
            imageUrl: value.imageUrl ?? null,
        });
    }
    return Array.from(unique.values());
}

function getRelatedTypeOptions(): Array<{ value: RelatedMediaLink['type']; label: string }> {
    return [
        { value: 'game', label: t('settingsGames') },
        { value: 'anime', label: t('settingsAnime') },
        { value: 'movie', label: t('settingsMovies') },
        { value: 'series', label: t('settingsSeries') },
        { value: 'book', label: t('settingsBooks') },
        { value: 'manga', label: t('settingsManga') },
    ];
}

function getRelatedTypeLabel(type: RelatedMediaLink['type']): string {
    return getRelatedTypeOptions().find((option) => option.value === type)?.label ?? type;
}
