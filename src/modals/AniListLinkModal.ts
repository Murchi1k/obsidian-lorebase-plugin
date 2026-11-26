
import { createLorebaseDropdown } from '../components/LorebaseDropdown';
import { App, Modal, Notice, setIcon } from 'obsidian';
import type { LorebaseSettings } from '../types';
import { AniListSyncService, type AniListLinkCandidate, type AniListLinkMatch } from '../services/AniListSyncService';

export class AniListLinkModal extends Modal {
    private candidates: AniListLinkCandidate[] = [];
    private requestVersion = 0;
    private linking = false;
    private kind: 'anime' | 'manga' = 'anime';
    private selectedNotes: Partial<Record<'anime' | 'manga', string>> = {};

    constructor(app: App, private readonly service: AniListSyncService,
        private readonly settings: LorebaseSettings, private readonly save: () => Promise<void>) { super(app); }

    private text(en: string, ru: string, uk: string): string {
        return this.settings.language === 'ru' ? ru : this.settings.language === 'uk' ? uk : en;
    }
    onOpen(): void {
        this.modalEl.addClass('lorebase-select-modal-container', 'lorebase-anilist-link-modal');
        this.contentEl.addClass('lorebase-select-modal', 'lorebase-add-workspace', 'lorebase-anilist-link-workspace');
        this.render();
    }
    onClose(): void { this.requestVersion++; this.contentEl.empty(); }

    private render(): void {
        this.requestVersion++;
        const root = this.contentEl;
        root.empty();
        this.candidates = this.service.getUnlinkedItems(this.settings);
        const header = root.createDiv({ cls: 'lorebase-select-header' }).createDiv({ cls: 'lorebase-select-title-row' });
        setIcon(header.createSpan({ cls: 'lorebase-select-title-icon' }), 'link-2');
        header.createEl('h2', { cls: 'lorebase-select-title', text: this.text('Link with AniList', 'Связать с AniList', 'Пов’язати з AniList') });
        const kinds = root.createDiv({ cls: 'lorebase-anilist-link-kinds', attr: { role: 'group', 'aria-label': this.text('Media type', 'Тип произведения', 'Тип твору') } });
        for (const kind of ['anime', 'manga'] as const) {
            const button = kinds.createEl('button', { cls: 'lorebase-anilist-link-kind', attr: { type: 'button', 'data-kind': kind, 'aria-pressed': String(this.kind === kind) } });
            button.toggleClass('is-active', this.kind === kind);
            setIcon(button.createSpan({ cls: 'lorebase-flow-btn-icon' }), kind === 'anime' ? 'clapperboard' : 'book-open');
            button.createSpan({ text: kind === 'anime' ? this.text('Anime', 'Аниме', 'Аніме') : this.text('Manga', 'Манга', 'Манґа') });
            button.createSpan({ cls: 'lorebase-anilist-link-kind-count', text: String(this.candidates.filter(item => item.kind === kind).length) });
            button.addEventListener('click', () => {
                if (this.linking || this.kind === kind) return;
                this.kind = kind; this.render();
            });
        }
        const available = this.candidates.filter(item => item.kind === this.kind);
        if (!available.length) {
            root.createDiv({ cls: 'lorebase-select-empty', text: this.text('No unlinked notes in this library.', 'В этой библиотеке нет непривязанных заметок.', 'У цій бібліотеці немає непов’язаних нотаток.') });
            this.button(root.createDiv({ cls: 'lorebase-anilist-link-footer' }), 'x', this.text('Close', 'Закрыть', 'Закрити'), () => this.close());
            return;
        }
        let candidate = available.find(item => item.filePath === this.selectedNotes[this.kind]) ?? available[0];
        this.selectedNotes[this.kind] = candidate.filePath;
        let selected: AniListLinkMatch | undefined;
        const layout = root.createDiv({ cls: 'lorebase-anilist-link-layout' });
        const local = layout.createDiv({ cls: 'lorebase-anilist-local' });
        local.createDiv({ cls: 'lorebase-anilist-pane-label', text: this.text('Your note', 'Ваша заметка', 'Ваша нотатка') });
        const dropdown = local.createDiv({ cls: 'lorebase-anilist-note-dropdown' });
        const preview = local.createDiv({ cls: 'lorebase-anilist-local-preview' });
        const source = local.createDiv({ cls: 'lorebase-anilist-link-source' });
        const renderLocal = (): void => {
            preview.empty();
            this.poster(preview, candidate.image, candidate.title, 'lorebase-anilist-local-poster', true);
            preview.createDiv({ cls: 'lorebase-anilist-local-title', text: candidate.title });
            preview.createSpan({ cls: 'lorebase-anilist-local-provider', text: ({ anilist: 'AniList', shikimori: 'Shikimori', mangadex: 'MangaDex', mangaupdates: 'MangaUpdates', comicvine: 'Comic Vine', kitsu: 'Kitsu', manual: this.text('Manual entry', 'Создано вручную', 'Створено вручну') } as Record<string, string>)[candidate.provider] ?? candidate.provider });
            source.setText(candidate.filePath);
        };
        const remote = layout.createDiv({ cls: 'lorebase-anilist-remote' });
        remote.createDiv({ cls: 'lorebase-anilist-pane-label', text: this.text('Find on AniList', 'Произведение на AniList', 'Твір на AniList') });
        const searchRow = remote.createDiv({ cls: 'lorebase-select-search-wrap lorebase-anilist-link-search' });
        const field = searchRow.createDiv({ cls: 'lorebase-select-search-field' });
        setIcon(field.createSpan({ cls: 'lorebase-select-search-icon' }), 'search');
        const search = field.createEl('input', { cls: 'lorebase-select-search', attr: { type: 'search', 'aria-label': this.text('Title on AniList', 'Название на AniList', 'Назва на AniList') } });
        search.value = candidate.title;
        const find = this.button(searchRow, 'search', this.text('Search', 'Найти', 'Знайти'), () => { void runSearch(); });
        const results = remote.createDiv({ cls: 'lorebase-select-grid lorebase-select-search-grid lorebase-anilist-match-grid' });
        const empty = (): void => { results.empty(); results.createDiv({ cls: 'lorebase-select-empty', text: this.text('Search for a title to choose a match.', 'Найдите произведение и выберите совпадение.', 'Знайдіть твір і виберіть відповідність.') }); };
        empty();
        const help = root.createEl('details', { cls: 'lorebase-anilist-link-help' });
        help.createEl('summary', { text: this.text('What does linking do?', 'Что делает привязка?', 'Що робить прив’язка?') });
        help.createEl('p', { text: this.text(
            'The original provider stays unchanged. Linking does not send your data. The first sync sends local progress, rating, dates and My Notes to AniList. Later syncs work both ways, including deletions.',
            'Исходный провайдер сохранится. Сама привязка ничего не отправляет. Первая синхронизация отправит в AniList прогресс, оценку, даты и My Notes. Далее обмен работает в обе стороны, включая удаления.',
            'Початковий провайдер збережеться. Сама прив’язка нічого не надсилає. Перша синхронізація надішле в AniList прогрес, оцінку, дати та My Notes. Надалі обмін працює в обидва боки, включно з видаленнями.') });
        const footer = root.createDiv({ cls: 'lorebase-anilist-link-footer' });
        const confirmation = footer.createDiv({ cls: 'lorebase-anilist-link-confirmation', attr: { 'aria-live': 'polite' } });
        this.button(footer, 'x', this.text('Cancel', 'Отмена', 'Скасувати'), () => this.close());
        const link = this.button(footer, 'link-2', this.text('Link', 'Связать', 'Пов’язати'), () => { void linkSelected(); }, true);
        link.dataset.action = 'confirm-link'; link.disabled = true;
        const resetSelection = (): void => { selected = undefined; link.disabled = true; confirmation.empty(); };
        createLorebaseDropdown(dropdown, available.map(item => ({ value: item.filePath, label: item.title })), candidate.filePath, path => {
            if (this.linking) return;
            this.requestVersion++;
            candidate = available.find(item => item.filePath === path)!;
            this.selectedNotes[this.kind] = path;
            search.value = candidate.title; find.disabled = false;
            resetSelection(); renderLocal(); empty();
        });
        const notes = dropdown.querySelector<HTMLButtonElement>('.lorebase-settings-dropdown-btn')!;
        notes.setAttribute('aria-label', this.text('Local note', 'Заметка в плагине', 'Нотатка в плагіні'));
        renderLocal();
        const runSearch = async (): Promise<void> => {
            if (!search.value.trim() || this.linking) return;
            const version = ++this.requestVersion, kind = candidate.kind;
            resetSelection(); find.disabled = true;
            results.empty(); results.createDiv({ cls: 'lorebase-select-empty', text: this.text('Searching…', 'Ищем совпадения…', 'Шукаємо відповідності…'), attr: { role: 'status' } });
            try {
                const matches = await this.service.searchLinkMatches(this.settings.anilistSync, kind, search.value);
                if (version !== this.requestVersion) return;
                results.empty();
                if (!matches.length) results.createDiv({ cls: 'lorebase-select-empty', text: this.text('No matches. Try another title.', 'Не найдено. Попробуйте другое название.', 'Не знайдено. Спробуйте іншу назву.') });
                for (const match of matches) {
                    const card = results.createEl('button', { cls: 'lorebase-select-card', attr: { type: 'button', 'data-id': String(match.id), 'aria-label': match.title, 'aria-pressed': 'false', title: match.title } });
                    this.poster(card, match.image, match.title, 'lorebase-select-card-image', false);
                    card.createDiv({ cls: 'lorebase-select-card-check' });
                    const body = card.createDiv({ cls: 'lorebase-select-card-body' });
                    body.createDiv({ cls: 'lorebase-select-card-title', text: match.title });
                    body.createDiv({ cls: 'lorebase-select-card-meta', text: [match.year, match.format].filter(Boolean).join(' · ') });
                    card.addEventListener('click', () => {
                        if (this.linking) return;
                        selected = match;
                        results.querySelectorAll<HTMLElement>('.lorebase-select-card').forEach(el => { const active = el === card; el.toggleClass('is-picked', active); el.setAttribute('aria-pressed', String(active)); });
                        confirmation.setText(match.title); link.disabled = false;
                    });
                }
            } catch (error) {
                if (version !== this.requestVersion) return;
                results.empty(); results.createDiv({ cls: 'lorebase-select-empty is-error', text: String(error), attr: { role: 'alert' } });
            } finally { if (version === this.requestVersion) find.disabled = false; }
        };
        const linkSelected = async (): Promise<void> => {
            if (!selected || this.linking) return;
            this.linking = true;
            const version = this.requestVersion;
            const controls = Array.from(root.querySelectorAll<HTMLInputElement | HTMLButtonElement>('button,input'));
            const disabled = controls.map(control => control.disabled);
            controls.forEach(control => { control.disabled = true; });
            try {
                await this.service.linkExisting(this.settings, candidate, selected.id);
                await this.save();
                if (version !== this.requestVersion) return;
                new Notice(this.text('Linked. Run AniList sync to exchange data.', 'Связано. Запустите AniList Sync для обмена данными.', 'Пов’язано. Запустіть AniList Sync для обміну даними.'));
                this.linking = false; this.render();
            } catch (error) {
                if (version !== this.requestVersion) return;
                controls.forEach((control, index) => { control.disabled = disabled[index]; });
                confirmation.setText(String(error)); confirmation.setAttribute('role', 'alert');
            } finally { this.linking = false; }
        };
        search.addEventListener('input', () => { if (this.linking) return; this.requestVersion++; resetSelection(); empty(); find.disabled = false; });
        search.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); void runSearch(); } });
    }

    private button(host: HTMLElement, icon: string, label: string, click: () => void, primary = false): HTMLButtonElement {
        const button = host.createEl('button', { cls: `lorebase-flow-btn lorebase-flow-btn-${primary ? 'primary' : 'secondary'}`, attr: { type: 'button' } });
        setIcon(button.createSpan({ cls: 'lorebase-flow-btn-icon' }), icon);
        button.createSpan({ cls: 'lorebase-flow-btn-label', text: label });
        button.addEventListener('click', click); return button;
    }
    private poster(host: HTMLElement, image: string | undefined, _title: string, cls: string, local: boolean): void {
        const art = host.createDiv({ cls: cls + ' is-empty' });
        setIcon(art.createSpan({ cls: 'lorebase-select-empty-poster-icon' }), this.kind === 'anime' ? 'clapperboard' : 'book-open');
        if (!image) return;
        let url = image;
        if (local && !/^(https?:|data:|blob:|app:)/i.test(url)) {
            try { url = this.app.vault.adapter.getResourcePath(url); } catch { return; }
        }
        const img = art.createEl('img', { cls: 'lorebase-steam-poster', attr: { src: url, alt: '', loading: 'lazy' } });
        img.addEventListener('load', () => art.removeClass('is-empty'));
        img.addEventListener('error', () => img.remove(), { once: true });
    }
}
