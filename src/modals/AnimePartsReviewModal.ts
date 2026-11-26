import { ct } from '../localization/continuations';
import { isFutureReleaseDate } from '../services/media/releaseStatus';
import { inspectPartCatalog } from '../services/media/partCatalog';
import type { Continuation } from '../services/media/partCatalog';
import type { PartCatalog } from '../types';
import { getStatusAppearance } from '../statusPresentation';
import { App, Modal, setIcon } from 'obsidian';
import type { AnimePart, AnimeStatus } from '../types';
import type { IntegrationAnimePart } from '../services/integrations/types';
import { i18n, t } from '../localization';
import { setPartPoster, watchCopy } from '../components/WatchProgress';
import { DEFAULT_COVER } from '../constants';
import { reconcileAnimeParts } from '../services/integrations/animeParts';

export interface AnimePartsReviewResult {
    partCatalog?: PartCatalog;
    continuations?: Continuation<IntegrationAnimePart>[];
    parts: IntegrationAnimePart[];
    activePartId: string | null;
    status: AnimeStatus;
}

interface AnimePartsReviewOptions {
    catalogSource?: string;
    partCatalog?: PartCatalog;
    title: string;
    subtitle?: string;
    providerParts: IntegrationAnimePart[];
    existingParts?: AnimePart[];
    activePartId?: string | null;
    status?: AnimeStatus;
    markNewParts?: boolean;
}

type PartDraft = IntegrationAnimePart & { isNew: boolean };

const labels = {
    en: { hint: 'Choose the parts to include. You can edit their details after applying.', all: 'Select all', clear: 'Clear selection', search: 'Find a part…', empty: 'No matching parts.', unavailable: 'No parts available.', saved: 'In your title', local: 'Local part' },
    ru: { hint: 'Выберите части для тайтла. Изменить их данные можно после применения.', all: 'Выбрать все', clear: 'Снять выбор', search: 'Найти часть…', empty: 'Части не найдены.', unavailable: 'Нет доступных частей.', saved: 'В составе', local: 'Своя часть' },
    uk: { hint: 'Виберіть частини для тайтлу. Їхні дані можна змінити після застосування.', all: 'Вибрати всі', clear: 'Зняти вибір', search: 'Знайти частину…', empty: 'Частин не знайдено.', unavailable: 'Немає доступних частин.', saved: 'У складі', local: 'Власна частина' },
    'zh-CN': { hint: '选择要包含的分部，应用后可以编辑详细信息。', all: '全选', clear: '清除选择', search: '查找分部…', empty: '没有匹配的分部。', unavailable: '没有可用分部。', saved: '已包含', local: '本地分部' },
};
let reviewId = 0;

export class AnimePartsReviewModal extends Modal {
    private options: AnimePartsReviewOptions;
    private parts: PartDraft[];
    private selected = new Set<string>();
    private existingPartIds: Set<string>;
    private providerPartIds: Set<string>;
    private activePartId: string | null;
    private status: AnimeStatus;
    private resolve?: (value: AnimePartsReviewResult | null) => void;
    private hasResolved = false;
    private listEl?: HTMLElement;
    private confirmBtn?: HTMLButtonElement;
    private readonly instanceId = ++reviewId;
    private query = '';

    private onKeydown = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        this.cancel();
    };

    constructor(app: App, options: AnimePartsReviewOptions) {
        super(app);
        this.options = options;
        const result = reconcileAnimeParts(options.providerParts, options.existingParts, options.activePartId);
        this.existingPartIds = result.existingIds; this.providerPartIds = result.providerIds;
        const hasExisting = Boolean(options.existingParts?.length);
        this.parts = result.parts.map(part => ({ ...part, isNew: Boolean(options.markNewParts && hasExisting && !(options.catalogSource && (!options.partCatalog || options.partCatalog.source !== options.catalogSource)) && !result.existingIds.has(part.id) && (!options.partCatalog || options.partCatalog.source !== options.catalogSource || !Object.prototype.hasOwnProperty.call(options.partCatalog.parts, part.id))) }));
        for (const part of this.parts) if (!hasExisting || result.existingIds.has(part.id)) this.selected.add(part.id);
        this.activePartId = result.activePartId && this.selected.has(result.activePartId) ? result.activePartId : this.getFirstSelectedId();
        this.status = options.status ?? 'planned';
    }

    openAndGetValue(): Promise<AnimePartsReviewResult | null> {
        return new Promise(resolve => {
            this.resolve = resolve;
            this.open();
        });
    }

    onOpen(): void {
        this.modalEl.addClass('lorebase-anime-parts-review-container');
        this.modalEl.addEventListener('keydown', this.onKeydown, { capture: true });
        this.render();
    }

    onClose(): void {
        this.modalEl.removeClass('lorebase-anime-parts-review-container');
        this.modalEl.removeEventListener('keydown', this.onKeydown, { capture: true });
        if (!this.hasResolved) this.resolve?.(null);
        this.contentEl.empty();
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lorebase-select-modal', 'lorebase-anime-parts-review');

        const header = contentEl.createDiv({ cls: 'lorebase-select-review-header' });
        const titleRow = header.createDiv({ cls: 'lorebase-select-review-title-row' });
        setIcon(titleRow.createSpan({ cls: 'lorebase-select-title-icon' }), 'list-checks');
        titleRow.createEl('h2', { cls: 'lorebase-select-title lorebase-select-review-heading', text: this.options.title });
        if (this.options.subtitle) header.createDiv({ cls: 'lorebase-select-review-subtitle', text: this.options.subtitle });
        header.createEl('p', { cls: 'lorebase-anime-parts-hint', text: this.copy().hint });

        const toolbar = contentEl.createDiv({ cls: 'lorebase-anime-parts-toolbar' });
        toolbar.createSpan({ cls: 'lorebase-anime-parts-selected', attr: { 'data-role': 'selected-count', 'aria-live': 'polite' } });
        const toggleAll = toolbar.createEl('button', { cls: 'lorebase-anime-parts-select-all', attr: { type: 'button', 'data-action': 'toggle-all' } });
        toggleAll.addEventListener('click', () => {
            if (this.selected.size === this.parts.length) this.selected.clear();
            else for (const part of this.parts) this.selected.add(part.id);
            this.reconcileActivePart();
            this.updateSelectedUi();
        });

        if (this.parts.length > 6) {
            const search = contentEl.createEl('input', {
                cls: 'lorebase-anime-parts-search',
                attr: { type: 'search', placeholder: this.copy().search, 'aria-label': this.copy().search },
            });
            search.value = this.query;
            search.addEventListener('input', () => {
                this.query = search.value;
                this.updateRowsVisibility();
            });
        }

        this.listEl = contentEl.createDiv({ cls: 'lorebase-anime-parts-list', attr: { role: 'list', 'aria-label': t('editAnimeParts') } });
        this.renderRows();
        const footer = contentEl.createDiv({ cls: 'lorebase-modal-actions lorebase-select-footer' });
        const cancel = footer.createEl('button', { cls: 'lorebase-flow-btn lorebase-flow-btn-secondary', text: t('commonCancel'), attr: { type: 'button', 'data-action': 'cancel' } });
        this.confirmBtn = footer.createEl('button', { cls: 'lorebase-flow-btn lorebase-flow-btn-primary', text: t('animePartsApply'), attr: { type: 'button', 'data-action': 'apply' } });
        cancel.addEventListener('click', () => this.cancel());
        this.confirmBtn.addEventListener('click', () => this.confirm());
        this.updateSelectedUi();
    }

    private renderRows(): void {
        if (!this.listEl) return;
        this.listEl.empty();
        const savedIds = this.existingPartIds;
        const providerIds = this.providerPartIds;

        for (const part of this.parts) {
            const item = this.listEl.createDiv({ cls: 'lorebase-anime-parts-item', attr: { role: 'listitem' } });
            item.dataset.partId = part.id;
            const row = item.createDiv({ cls: 'lorebase-anime-parts-row' });
            const id = `lorebase-provider-part-${this.instanceId}-${encodeURIComponent(part.id)}`;
            const title = part.title || t('editAnimeParts');
            const check = row.createEl('input', {
                cls: 'lorebase-anime-parts-checkbox',
                attr: { type: 'checkbox', id, 'aria-labelledby': `${id}-title` },
            });
            check.addEventListener('change', () => {
                if (check.checked) this.selected.add(part.id);
                else this.selected.delete(part.id);
                this.reconcileActivePart();
                this.updateSelectedUi();
            });

            const cover = row.createEl('img', { cls: 'lorebase-part-cover', attr: { alt: '', loading: 'lazy' } });
            setPartPoster(cover, this.app, part.poster, DEFAULT_COVER);
            const body = row.createEl('label', { cls: 'lorebase-part-review-body', attr: { for: id } });
            const heading = body.createSpan({ cls: 'lorebase-anime-parts-name-row' });
            heading.createEl('strong', { cls: 'lorebase-anime-parts-title', text: title, attr: { id: `${id}-title` } });
            if (part.isNew || savedIds.has(part.id)) {
                const badge = heading.createSpan({
                    cls: `lorebase-anime-parts-badge${part.isNew ? ' is-new' : ''}`,
                    text: part.isNew ? t('animePartsNew') : providerIds.has(part.id) ? this.copy().saved : this.copy().local,
                });
                badge.dataset.role = 'part-origin';
            }
            body.createSpan({ cls: 'lorebase-anime-parts-meta', text: this.getPartMeta(part) });
            const tracking = body.createSpan({ cls: 'lorebase-anime-parts-tracking' });
            tracking.createSpan({ text: `${part.episodeCurrent ?? 0} / ${part.episodeTotal && part.episodeTotal > 0 ? part.episodeTotal : '?'} ${watchCopy().episodes}` });
            tracking.createSpan({ cls: 'lorebase-anime-parts-status', text: this.getStatusLabel(part.status) });

            const activeLabel = row.createEl('label', { cls: 'lorebase-anime-parts-active-field' });
            const radio = activeLabel.createEl('input', {
                cls: 'lorebase-anime-parts-active-radio',
                attr: { type: 'radio', name: `lorebase-provider-active-${this.instanceId}`, 'aria-label': `${watchCopy().activate}: ${title}` },
            });
            radio.addEventListener('change', () => {
                if (!radio.checked || !this.selected.has(part.id)) return;
                this.activePartId = part.id;
                this.updateSelectedUi();
            });
            activeLabel.createSpan({ attr: { 'data-role': 'active-caption' } });
        }
        this.listEl.createDiv({ cls: 'lorebase-anime-parts-no-new', attr: { 'data-role': 'empty-results', role: 'status' } });
        this.updateRowsVisibility();
    }

    private updateRowsVisibility(): void {
        const query = this.query.trim().normalize('NFKC').toLocaleLowerCase();
        let visible = 0;
        const items = this.listEl?.querySelectorAll<HTMLElement>('.lorebase-anime-parts-item');
        items?.forEach((item, index) => {
            const part = this.parts[index];
            item.hidden = Boolean(query && ![part.title, this.getPartMeta(part)].join(' ').normalize('NFKC').toLocaleLowerCase().includes(query));
            if (!item.hidden) visible++;
        });
        const empty = this.listEl?.querySelector<HTMLElement>('[data-role="empty-results"]');
        if (empty) {
            empty.hidden = visible > 0;
            empty.textContent = this.parts.length ? this.copy().empty : this.copy().unavailable;
        }
    }

    private updateSelectedUi(): void {
        const label = this.contentEl.querySelector<HTMLElement>('[data-role="selected-count"]');
        if (label) label.textContent = `${t('animePartsSelected')}: ${this.selected.size} / ${this.parts.length}`;
        const all = this.contentEl.querySelector<HTMLButtonElement>('[data-action="toggle-all"]');
        if (all) {
            all.textContent = this.selected.size === this.parts.length && this.parts.length > 0 ? this.copy().clear : this.copy().all;
            all.disabled = this.parts.length === 0;
        }
        if (this.confirmBtn) this.confirmBtn.disabled = this.selected.size === 0;
        this.listEl?.querySelectorAll<HTMLElement>('.lorebase-anime-parts-item').forEach(item => {
            const id = item.dataset.partId ?? '';
            const selected = this.selected.has(id);
            const active = this.activePartId === id;
            item.toggleClass('is-selected', selected);
            item.toggleClass('is-active-part', active);
            item.querySelector<HTMLInputElement>('.lorebase-anime-parts-checkbox')!.checked = selected;
            const radio = item.querySelector<HTMLInputElement>('.lorebase-anime-parts-active-radio')!;
            radio.checked = active;
            radio.disabled = !selected;
            item.querySelector<HTMLElement>('[data-role="active-caption"]')!.textContent = active ? watchCopy().active : watchCopy().activate;
        });
    }

    private reconcileActivePart(): void {
        if (!this.activePartId || !this.selected.has(this.activePartId)) this.activePartId = this.getFirstSelectedId();
    }

    private getFirstSelectedId(): string | null {
        return this.parts.find(part => this.selected.has(part.id))?.id ?? null;
    }

    private confirm(): void {
        if (!this.selected.size) return;
        const parts = this.parts
            .filter(part => this.selected.has(part.id))
            .map(({ isNew: _isNew, ...part }) => ({ ...part }));
        this.hasResolved = true;
        this.resolve?.({
            ...(this.options.catalogSource ? { partCatalog: inspectPartCatalog(this.options.catalogSource, this.options.providerParts, [], this.options.partCatalog).catalog } : {}),
            parts,
            activePartId: this.activePartId && this.selected.has(this.activePartId) ? this.activePartId : parts[0]?.id ?? null,
            status: parts.every(part => part.status === 'completed') ? 'completed' : this.status,
        });
        this.close();
    }

    private cancel(): void {
        this.hasResolved = true;
        this.resolve?.(null);
        this.close();
    }

    private copy() {
        return labels[i18n.getLanguage()] ?? labels.en;
    }

    private getPartMeta(part: IntegrationAnimePart): string {
        const chunks = [this.getFormatLabel(part.kind)];
        if (part.releaseDate) chunks.push(`${ct('date')}: ${part.releaseDate}${isFutureReleaseDate(part.releaseDate) ? ` · ${ct('announced')}` : ''}`);
        else if (part.year) chunks.push(String(part.year));
        if (part.episodeDuration && part.episodeDuration > 0) chunks.push(`${part.episodeDuration} ${watchCopy().minute}`);
        return chunks.join(' · ');
    }

    private getFormatLabel(format: IntegrationAnimePart['kind']): string {
        switch (format) {
            case 'tv': return t('formatTv');
            case 'movie': return t('formatMovie');
            case 'ova': return t('formatOva');
            case 'ona': return t('formatOna');
            case 'special': return t('formatSpecial');
        }
    }

    private getStatusLabel(status: AnimeStatus): string {
        switch (status) {
            case 'to_be_released': return t('statusToBeReleased');
            case 'planned': return t('statusPlanned');
            case 'watching': return t('statusWatching');
            case 'completed': return t('statusCompleted');
            case 'dropped': return t('statusDropped');
            case 'paused': return t('statusPaused');
            default: return getStatusAppearance('anime', status).label || status;
        }
    }
}
