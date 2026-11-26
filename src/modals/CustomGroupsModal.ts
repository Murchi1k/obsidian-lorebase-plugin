
import { App, Menu, Modal, setIcon } from 'obsidian';
import { addWorkspaceModalClose } from '../components/WorkspaceModalChrome';
import { renderCustomGroupIcon } from '../components/CustomGroupIcon';
import type { CustomMediaGroup, MediaItem, MediaType } from '../types';
import { t } from '../localization';
import { groupCount, groupText as gt } from '../localization/groups';
import { mt } from '../localization/music';
import { MEDIA_ICONS } from '../mediaPresentation';
import { createCustomGroup, normalizeCustomGroups, normalizeGroupDetails, setGroupMembership, sortedCustomGroups, type CustomGroupDetails } from '../services/media/customGroups';
import { renderCustomGroupCard } from './customGroupCard';
import { renderCustomGroupEditor } from './customGroupEditor';
import { getSearchCardClassification } from './searchCardMetadata';
import { getMediaWorkTypeColor, supportsWorkTypes } from '../utils/mediaWorkType';

const GROUP_MEDIA_TYPES: MediaType[] = ['game', 'anime', 'movie', 'series', 'book', 'manga', 'music'];
const CANDIDATES_PER_PAGE = 12;

export class CustomGroupsModal extends Modal {
    private groups: CustomMediaGroup[];
    private items: MediaItem[] = [];
    private itemMap = new Map<string, MediaItem>();
    private activeGroupId: string | null;
    private searchTerm = '';
    private addPanelOpen = false;
    private groupSearch = '';
    private overviewLimit = 36;
    private editorDraft: CustomGroupDetails | null = null;
    private editingGroupId: string | null = null;
    private refreshEditorPreview: (() => void) | null = null;
    private refreshOverview: (() => void) | null = null;
    private loadGeneration = 0;
    private closed = true;
    private candidateTypes = new Set<MediaType>(GROUP_MEDIA_TYPES);
    private candidatePage = 1;
    private loading = true;

    constructor(
        app: App,
        groups: CustomMediaGroup[],
        private readonly loadItems: () => Promise<MediaItem[]>,
        private readonly openItem: (item: MediaItem) => Promise<void>,
        private readonly onGroupsChange: (groups: CustomMediaGroup[]) => void
    ) {
        super(app);
        this.groups = normalizeCustomGroups(groups);
        this.activeGroupId = null;
    }

    onOpen(): void {
        this.closed = false;
        this.modalEl.addClass('lorebase-custom-groups-container');
        this.contentEl.addClass('lorebase-custom-groups', 'lorebase-add-workspace');
        this.render();
        void this.loadLibrary();
    }

    onClose(): void {
        this.closed = true;
        this.loadGeneration++;
        this.editorDraft = null;
        this.editingGroupId = null;
        this.refreshEditorPreview = null;
        this.refreshOverview = null;
        this.contentEl.empty();
    }

    private async loadLibrary(): Promise<void> {
        const generation = ++this.loadGeneration;
        try {
            const items = await this.loadItems();
            if (this.closed || generation !== this.loadGeneration) return;
            this.items = [...items].sort((a, b) => a.displayName.localeCompare(b.displayName));
            this.itemMap = new Map(this.items.map(item => [item.filePath, item]));
        } catch (error) {
            if (this.closed || generation !== this.loadGeneration) return;
            console.error('[Custom groups] Failed to load media:', error);
            this.items = [];
            this.itemMap = new Map();
        } finally {
            if (!this.closed && generation === this.loadGeneration) {
                this.loading = false;
                if (this.refreshEditorPreview) this.refreshEditorPreview();
                else if (this.refreshOverview) this.refreshOverview();
                else {
                    const input = this.contentEl.querySelector<HTMLInputElement>('.lorebase-groups-search');
                    const focused = input === this.contentEl.ownerDocument.activeElement;
                    this.render();
                    if (focused) this.contentEl.querySelector<HTMLInputElement>('.lorebase-groups-search')?.focus();
                }
            }
        }
    }

    private render(): void {
        if (this.closed) return;
        this.modalEl.toggleClass('is-group-editor', Boolean(this.editorDraft));
        this.refreshEditorPreview = null;
        this.refreshOverview = null;
        this.contentEl.empty();
        const header = this.contentEl.createDiv({ cls: 'lorebase-groups-header' });
        if (this.editorDraft) {
            const back = this.iconButton(header, 'arrow-left', t('commonBack'));
            back.addClass('lorebase-groups-editor-back');
            back.addEventListener('click', () => this.cancelEditor());
        } else {
            const icon = header.createSpan({ cls: 'lorebase-groups-header-icon' });
            setIcon(icon, 'folders');
        }
        const heading = header.createDiv({ cls: 'lorebase-groups-header-copy' });
        heading.createEl('h2', { text: this.editorDraft ? this.editingGroupId ? gt('editGroup') : t('customGroupsCreate') : t('customGroups') });
        heading.createEl('p', { text: this.editorDraft ? gt('createHint') : t('customGroupsSubtitle') });
        if (!this.editorDraft) {
            const create = header.createEl('button', { cls: 'lorebase-groups-create-btn lorebase-group-button', attr: { type: 'button' } });
            setIcon(create.createSpan(), 'plus');
            create.createSpan({ text: gt('newGroup') });
            create.addEventListener('click', () => this.openEditor());
        }
        addWorkspaceModalClose(this.modalEl, header, () => this.close());
        if (this.editorDraft) {
            const editor = renderCustomGroupEditor(this.contentEl, {
                draft: this.editorDraft,
                group: this.groups.find(group => group.id === this.editingGroupId),
                getItems: () => this.itemMap,
                cancel: () => this.cancelEditor(),
                save: details => this.saveEditor(details),
            });
            this.refreshEditorPreview = editor.refreshPreview;
            editor.focusName();
            return;
        }
        const layout = this.contentEl.createDiv({ cls: 'lorebase-groups-layout' });
        const main = layout.createEl('main', { cls: 'lorebase-groups-main' });
        const activeGroup = this.groups.find((group) => group.id === this.activeGroupId) ?? null;
        if (!activeGroup) this.renderOverview(main);
        else this.renderGroup(main, activeGroup);
    }

    private openEditor(group?: CustomMediaGroup): void {
        this.editingGroupId = group?.id ?? null;
        this.editorDraft = normalizeGroupDetails(group ?? {});
        this.render();
    }

    private cancelEditor(): void {
        const editingId = this.editingGroupId;
        this.editorDraft = null;
        this.editingGroupId = null;
        this.render();
        const selector = this.activeGroupId
            ? '.lorebase-groups-edit'
            : '.lorebase-groups-create-btn';
        const editedCard = !this.activeGroupId && editingId
            ? Array.from(this.contentEl.querySelectorAll<HTMLElement>('.lorebase-group-card')).find(card => card.dataset.groupId === editingId)
            : undefined;
        const target = editedCard?.querySelector<HTMLButtonElement>('.lorebase-group-card-open') ?? this.contentEl.querySelector<HTMLButtonElement>(selector);
        target?.focus({ preventScroll: true });
    }

    private saveEditor(details: CustomGroupDetails): void {
        if (this.closed) return;
        const name = this.uniqueName(details.name, this.editingGroupId ?? undefined);
        if (this.editingGroupId) {
            this.groups = this.groups.map(group => group.id === this.editingGroupId ? { ...group, ...details, name, updatedAt: Date.now() } : group);
        } else {
            const group = { ...createCustomGroup(name), ...details, name };
            this.groups.push(group);
            this.activeGroupId = group.id;
            this.searchTerm = '';
            this.groupSearch = '';
            this.candidatePage = 1;
            this.addPanelOpen = false;
        }
        this.editorDraft = null;
        this.persist();
        this.render();
    }

    private renderOverview(parent: HTMLElement): void {
        const controls = parent.createDiv({ cls: 'lorebase-groups-overview-controls' });
        const searchShell = controls.createDiv({ cls: 'lorebase-groups-search-shell' });
        setIcon(searchShell.createSpan({ cls: 'lorebase-groups-search-icon' }), 'search');
        const search = searchShell.createEl('input', { cls: 'lorebase-groups-search', attr: { type: 'search', 'aria-label': gt('search'), placeholder: gt('search') } });
        search.value = this.groupSearch;
        const count = controls.createSpan({ cls: 'lorebase-groups-overview-count' });
        const scroll = parent.createDiv({ cls: 'lorebase-groups-scroll lorebase-groups-overview-scroll' });
        const refresh = (): void => {
            scroll.empty();
            const query = this.groupSearch.trim().normalize('NFKC').toLocaleLowerCase();
            const groups = sortedCustomGroups(this.groups).filter(group => !query || `${group.name} ${group.description ?? ''}`.normalize('NFKC').toLocaleLowerCase().includes(query));
            count.textContent = groupCount(groups.length);
            if (!this.groups.length) { this.renderEmpty(scroll); return; }
            if (!groups.length) {
                const empty = scroll.createDiv({ cls: 'lorebase-groups-empty' });
                empty.createEl('strong', { text: gt('noResults') });
                empty.createSpan({ text: gt('noResultsHint') });
                return;
            }
            const grid = scroll.createDiv({ cls: 'lorebase-groups-overview-grid' });
            for (const group of groups.slice(0, this.overviewLimit)) renderCustomGroupCard(grid, group, this.itemMap, {
                open: () => { this.activeGroupId = group.id; this.searchTerm = ''; this.candidatePage = 1; this.addPanelOpen = false; this.render(); },
                contextMenu: event => this.showGroupMenu(group.id, event),
            });
            if (groups.length > this.overviewLimit) {
                const more = scroll.createEl('button', { cls: 'lorebase-group-button lorebase-groups-show-more', text: `${gt('showMore')} · ${Math.min(this.overviewLimit, groups.length)} / ${groups.length}`, attr: { type: 'button' } });
                more.addEventListener('click', () => { const top = scroll.scrollTop; this.overviewLimit += 36; refresh(); scroll.scrollTop = top; });
            }
        };
        search.addEventListener('input', () => { this.groupSearch = search.value; this.overviewLimit = 36; refresh(); scroll.scrollTop = 0; });
        this.refreshOverview = refresh;
        refresh();
    }

    private togglePinned(id: string): void {
        if (this.closed) return;
        const group = this.groups.find(entry => entry.id === id);
        if (!group) return;
        const scrollTop = this.contentEl.querySelector<HTMLElement>('.lorebase-groups-scroll')?.scrollTop ?? 0;
        this.groups = this.groups.map(entry => entry.id === id ? { ...entry, pinned: !entry.pinned, updatedAt: Date.now() } : entry);
        this.persist();
        this.render();
        const scroll = this.contentEl.querySelector<HTMLElement>('.lorebase-groups-scroll');
        if (scroll) scroll.scrollTop = scrollTop;
        const card = Array.from(this.contentEl.querySelectorAll<HTMLElement>('.lorebase-group-card')).find(entry => entry.dataset.groupId === id);
        (card?.querySelector<HTMLButtonElement>('.lorebase-group-card-open') ?? this.contentEl.querySelector<HTMLButtonElement>('.lorebase-groups-pin'))?.focus({ preventScroll: true });
    }

    private deleteGroup(id: string): void {
        if (this.closed || !this.groups.some(entry => entry.id === id)) return;
        this.groups = this.groups.filter(entry => entry.id !== id);
        if (this.activeGroupId === id) { this.activeGroupId = null; this.addPanelOpen = false; }
        this.persist();
        this.render();
    }

    private showGroupMenu(id: string, event: MouseEvent | KeyboardEvent): void {
        const group = this.groups.find(entry => entry.id === id);
        if (this.closed || !group) return;
        const menu = new Menu();
        menu.addItem(item => item.setTitle(gt(group.pinned ? 'unpin' : 'pin')).setIcon(group.pinned ? 'pin-off' : 'pin').onClick(() => this.togglePinned(id)));
        menu.addItem(item => item.setTitle(gt('editGroup')).setIcon('pencil').onClick(() => {
            const current = this.groups.find(entry => entry.id === id);
            if (!this.closed && current) this.openEditor(current);
        }));
        menu.addSeparator();
        menu.addItem(item => item.setTitle(t('customGroupsDelete')).setIcon('trash-2').setWarning(true).onClick(() => this.deleteGroup(id)));
        if (event.type === 'contextmenu') menu.showAtMouseEvent(event as MouseEvent);
        else {
            const rect = (event.target as HTMLElement).getBoundingClientRect();
            menu.showAtPosition({ x: rect.left, y: rect.bottom });
        }
    }

    private renderEmpty(parent: HTMLElement): void {
        const empty = parent.createDiv({ cls: 'lorebase-groups-empty' });
        setIcon(empty.createSpan(), 'folder-plus');
        empty.createEl('strong', { text: t('customGroupsEmpty') });
        empty.createSpan({ text: t('customGroupsEmptyHint') });
    }

    private renderGroup(parent: HTMLElement, group: CustomMediaGroup): void {
        const toolbar = parent.createDiv({ cls: 'lorebase-groups-toolbar' });
        const back = this.iconButton(toolbar, 'arrow-left', gt('back'));
        back.addEventListener('click', () => { this.activeGroupId = null; this.addPanelOpen = false; this.render(); });
        const title = toolbar.createDiv({ cls: 'lorebase-groups-title' });
        title.style.setProperty('--group-color', normalizeGroupDetails(group).color);
        renderCustomGroupIcon(title.createSpan({ cls: 'lorebase-groups-detail-icon', attr: { 'aria-hidden': 'true' } }), normalizeGroupDetails(group).icon);
        title.createEl('h3', { text: group.name });
        title.createSpan({ text: `${group.itemPaths.length} ${t('customGroupsItems')}` });
        const actions = toolbar.createDiv({ cls: 'lorebase-groups-actions' });
        const add = actions.createEl('button', {
            cls: `lorebase-groups-add-toggle ${this.addPanelOpen ? 'is-active' : ''}`,
            attr: { type: 'button', 'aria-expanded': String(this.addPanelOpen) },
        });
        setIcon(add.createSpan(), this.addPanelOpen ? 'check' : 'plus');
        add.createSpan({ text: this.addPanelOpen ? gt('done') : t('customGroupsAddItems') });
        add.addEventListener('click', () => {
            this.addPanelOpen = !this.addPanelOpen;
            this.render();
            if (this.addPanelOpen) this.contentEl.querySelector<HTMLInputElement>('.lorebase-groups-search')?.focus();
            else this.contentEl.querySelector<HTMLButtonElement>('.lorebase-groups-add-toggle')?.focus({ preventScroll: true });
        });
        if (!this.addPanelOpen) {
            const pin = this.iconButton(actions, group.pinned ? 'pin-off' : 'pin', gt(group.pinned ? 'unpin' : 'pin'));
            pin.addClass('lorebase-groups-pin');
            pin.setAttribute('aria-pressed', String(Boolean(group.pinned)));
            pin.addEventListener('click', () => this.togglePinned(group.id));
            const rename = this.iconButton(actions, 'pencil', gt('editGroup'));
            rename.addClass('lorebase-groups-edit');
            const remove = this.iconButton(actions, 'trash-2', t('customGroupsDelete'));
            remove.addClass('is-danger');
            rename.addEventListener('click', () => this.openEditor(group));
            remove.addEventListener('click', () => this.deleteGroup(group.id));
        }

        if (group.description && !this.addPanelOpen) parent.createDiv({ cls: 'lorebase-groups-detail-description', text: group.description });

        if (this.addPanelOpen) {
            this.renderAddPanel(parent, group);
            return;
        }

        const scroll = parent.createDiv({ cls: 'lorebase-groups-scroll' });
        const members = group.itemPaths.flatMap((path) => {
            const item = this.itemMap.get(path);
            return item ? [item] : [];
        });
        if (members.length > 0) {
            const grid = scroll.createDiv({ cls: 'lorebase-groups-member-grid lorebase-select-search-grid' });
            for (const item of members) this.renderMember(grid, group, item);
        } else if (!this.loading) {
            const hint = scroll.createEl('button', {
                cls: 'lorebase-groups-members-empty',
                attr: { type: 'button' },
            });
            setIcon(hint.createSpan(), 'layout-grid');
            hint.createSpan({ text: t('customGroupsAddItems') });
            hint.addEventListener('click', () => {
                this.addPanelOpen = true;
                this.render();
                this.contentEl.querySelector<HTMLInputElement>('.lorebase-groups-search')?.focus();
            });
        }

    }

    private renderAddPanel(parent: HTMLElement, group: CustomMediaGroup): void {
        const addSection = parent.createDiv({ cls: 'lorebase-groups-add-section' });
        const controls = addSection.createDiv({ cls: 'lorebase-groups-browser-controls' });
        const bar = controls.createDiv({ cls: 'lorebase-groups-picker-bar' });
        const searchShell = bar.createDiv({ cls: 'lorebase-groups-search-shell' });
        setIcon(searchShell.createSpan({ cls: 'lorebase-groups-search-icon' }), 'search');
        const search = searchShell.createEl('input', {
            cls: 'lorebase-groups-search',
            attr: { type: 'search', placeholder: t('customGroupsSearchPlaceholder'), 'aria-label': t('customGroupsSearchPlaceholder') },
        });
        search.value = this.searchTerm;
        bar.createSpan({ cls: 'lorebase-groups-picker-count', text: `${gt('inGroup')}: ${group.itemPaths.length}`, attr: { 'aria-live': 'polite' } });
        search.addEventListener('input', () => {
            this.searchTerm = search.value;
            this.candidatePage = 1;
            this.renderCandidates(results, group);
            results.scrollTop = 0;
        });
        const filters = controls.createDiv({ cls: 'lorebase-groups-add-filters' });
        for (const type of GROUP_MEDIA_TYPES) {
            const enabled = this.candidateTypes.has(type);
            const filter = filters.createEl('button', {
                cls: `lorebase-groups-add-filter is-${type} ${enabled ? 'is-active' : ''}`,
                attr: { type: 'button', 'aria-pressed': String(enabled) },
            });
            setIcon(filter.createSpan(), MEDIA_ICONS[type]);
            filter.createSpan({ text: this.mediaLabel(type) });
            filter.addEventListener('click', () => {
                if (this.candidateTypes.has(type)) this.candidateTypes.delete(type);
                else this.candidateTypes.add(type);
                this.candidatePage = 1;
                this.renderAddPanelState(addSection, group);
                results.scrollTop = 0;
            });
        }
        const results = addSection.createDiv({ cls: 'lorebase-groups-results lorebase-groups-scroll' });
        addSection.createDiv({ cls: 'lorebase-groups-pagination' });
        this.renderCandidates(results, group);
    }

    private renderAddPanelState(section: HTMLElement, group: CustomMediaGroup): void {
        const filters = section.querySelectorAll<HTMLButtonElement>('.lorebase-groups-add-filter');
        filters.forEach((button, index) => {
            const enabled = this.candidateTypes.has(GROUP_MEDIA_TYPES[index]);
            button.toggleClass('is-active', enabled);
            button.setAttribute('aria-pressed', String(enabled));
        });
        const results = section.querySelector<HTMLElement>('.lorebase-groups-results');
        if (results) this.renderCandidates(results, group);
    }

    private renderMember(parent: HTMLElement, group: CustomMediaGroup, item: MediaItem): void {
        const shell = parent.createEl('article', { cls: 'lorebase-groups-member-shell' });
        const card = this.renderPosterCard(shell, item);
        card.addClass('lorebase-groups-member');
        card.addEventListener('click', () => {
            this.close();
            void this.openItem(item);
        });
        const remove = shell.createEl('button', {
            cls: 'lorebase-groups-member-remove',
            attr: { type: 'button', 'aria-label': `${t('customGroupsRemoveItem')}: ${item.displayName}`, title: t('customGroupsRemoveItem') },
        });
        setIcon(remove, 'x');
        remove.addEventListener('click', () => this.updateMembership(group, item.filePath, false));
    }

    private renderPosterCard(parent: HTMLElement, item: MediaItem): HTMLButtonElement {
        const card = parent.createEl('button', {
            cls: `lorebase-select-card is-${item.type}`,
            attr: { type: 'button', title: item.displayName, 'aria-label': item.displayName, 'data-path': item.filePath },
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
        const workTypeMedia = supportsWorkTypes(item.type) ? item.type : undefined;
        const countryOfOrigin = item.type === 'anime' ? item.countryOfOrigin : undefined;
        const classification = getSearchCardClassification({
            workType: item.workType, workTypeMedia, countryOfOrigin,
        }, item.type === 'anime', workTypeMedia) || this.mediaLabel(item.type);
        const badge = image.createSpan({
            cls: 'lorebase-select-classification', text: classification, attr: { title: classification },
        });
        badge.style.setProperty('--lorebase-type-color', getMediaWorkTypeColor(item.type, countryOfOrigin ?? item.workType ?? ''));
        const body = card.createDiv({ cls: 'lorebase-select-card-body' });
        body.createDiv({ cls: 'lorebase-select-card-title', text: item.displayName });
        if (item.year) body.createDiv({ cls: 'lorebase-select-card-meta', text: String(item.year) });
        return card;
    }

    private renderCandidates(parent: HTMLElement, group: CustomMediaGroup): void {
        parent.empty();
        const pagination = parent.parentElement?.querySelector<HTMLElement>('.lorebase-groups-pagination');
        pagination?.empty();
        if (this.loading) {
            const loading = parent.createDiv({ cls: 'lorebase-groups-results-empty' });
            setIcon(loading.createSpan(), 'loader-circle');
            return;
        }
        const query = this.searchTerm.trim().toLocaleLowerCase();
        const memberPaths = new Set(group.itemPaths);
        const candidates = this.items
            .filter((item) => this.candidateTypes.has(item.type))
            .filter((item) => !query || item.nameLower.includes(query) || item.displayName.toLocaleLowerCase().includes(query));
        if (!candidates.length) {
            parent.createDiv({ cls: 'lorebase-groups-results-empty', text: t('customGroupsNoResults') });
            return;
        }
        const pages = Math.ceil(candidates.length / CANDIDATES_PER_PAGE);
        this.candidatePage = Math.min(this.candidatePage, pages);
        const offset = (this.candidatePage - 1) * CANDIDATES_PER_PAGE;
        const grid = parent.createDiv({ cls: 'lorebase-groups-candidate-grid lorebase-select-search-grid' });
        for (const item of candidates.slice(offset, offset + CANDIDATES_PER_PAGE)) {
            const included = memberPaths.has(item.filePath);
            const button = this.renderPosterCard(grid, item);
            button.addClass('lorebase-groups-result');
            button.toggleClass('is-picked', included);
            button.setAttribute('aria-pressed', String(included));
            button.setAttribute('aria-label', `${t(included ? 'customGroupsRemoveItem' : 'customGroupsAddItems')}: ${item.displayName}`);
            button.createDiv({ cls: 'lorebase-select-card-check', attr: { 'aria-hidden': 'true' } });
            button.addEventListener('click', () => this.updateMembership(group, item.filePath, !included));
        }
        if (!pagination || pages <= 1) return;
        const previous = this.iconButton(pagination, 'chevron-left', t('promptPreviousPage'));
        previous.disabled = this.candidatePage === 1;
        pagination.createSpan({ text: `${t('promptPage')} ${this.candidatePage} / ${pages}`, attr: { 'aria-live': 'polite' } });
        const next = this.iconButton(pagination, 'chevron-right', t('promptNextPage'));
        next.disabled = this.candidatePage === pages;
        const changePage = (delta: number): void => {
            this.candidatePage += delta;
            this.renderCandidates(parent, group);
            parent.scrollTop = 0;
            const buttons = pagination.querySelectorAll<HTMLButtonElement>('button');
            const target = buttons[delta > 0 ? 1 : 0];
            (target?.disabled ? parent.querySelector<HTMLButtonElement>('.lorebase-groups-result') : target)?.focus({ preventScroll: true });
        };
        previous.addEventListener('click', () => changePage(-1));
        next.addEventListener('click', () => changePage(1));
    }

    private updateMembership(group: CustomMediaGroup, filePath: string, included: boolean): void {
        const scrollTop = this.contentEl.querySelector<HTMLElement>('.lorebase-groups-scroll')?.scrollTop ?? 0;
        this.groups = this.groups.map((entry) => entry.id === group.id
            ? setGroupMembership(entry, filePath, included)
            : entry);
        this.persist();
        this.render();
        const scroll = this.contentEl.querySelector<HTMLElement>('.lorebase-groups-scroll');
        if (scroll) scroll.scrollTop = scrollTop;
        if (this.addPanelOpen) {
            const card = Array.from(this.contentEl.querySelectorAll<HTMLButtonElement>('.lorebase-groups-result'))
                .find(candidate => candidate.dataset.path === filePath);
            card?.focus({ preventScroll: true });
        }
    }

    private persist(): void {
        this.onGroupsChange(this.groups.map((group) => ({ ...group, itemPaths: [...group.itemPaths] })));
    }

    private uniqueName(name: string, exceptId?: string): string {
        const taken = new Set(this.groups
            .filter((group) => group.id !== exceptId)
            .map((group) => group.name.toLocaleLowerCase()));
        if (!taken.has(name.toLocaleLowerCase())) return name;
        let suffix = 2;
        while (taken.has(`${name} ${suffix}`.toLocaleLowerCase())) suffix++;
        return `${name} ${suffix}`;
    }

    private iconButton(parent: HTMLElement, icon: string, label: string): HTMLButtonElement {
        const button = parent.createEl('button', {
            cls: 'lorebase-groups-icon-btn',
            attr: { type: 'button', 'aria-label': label, title: label },
        });
        setIcon(button, icon);
        return button;
    }

    private mediaLabel(type: MediaType): string {
        if (type === 'game') return t('settingsGames');
        if (type === 'anime') return t('settingsAnime');
        if (type === 'movie') return t('settingsMovies');
        if (type === 'series') return t('settingsSeries');
        if (type === 'book') return t('settingsBooks');
        if (type === 'music') return mt('music');
        return t('settingsManga');
    }
}
