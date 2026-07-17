import { App, Modal, setIcon } from 'obsidian';
import type { AnimePart, AnimeStatus } from '../types';
import type { IntegrationAnimePart } from '../services/integrations/types';
import { t } from '../localization';
import { createLorebaseDropdown } from '../components/LorebaseDropdown';

export interface AnimePartsReviewResult {
    parts: IntegrationAnimePart[];
    activePartId: string | null;
    status: AnimeStatus;
}

interface AnimePartsReviewOptions {
    title: string;
    subtitle?: string;
    providerParts: IntegrationAnimePart[];
    existingParts?: AnimePart[];
    activePartId?: string | null;
    status?: AnimeStatus;
    markNewParts?: boolean;
}

type PartDraft = IntegrationAnimePart & { isNew: boolean };

export class AnimePartsReviewModal extends Modal {
    private options: AnimePartsReviewOptions;
    private parts: PartDraft[];
    private selected = new Set<string>();
    private activePartId: string | null;
    private status: AnimeStatus;
    private resolve?: (value: AnimePartsReviewResult | null) => void;
    private hasResolved = false;
    private listEl?: HTMLElement;
    private confirmBtn?: HTMLButtonElement;
    private expandedPartId: string | null = null;

    private onKeydown = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        this.cancel();
    };

    constructor(app: App, options: AnimePartsReviewOptions) {
        super(app);
        this.options = options;
        const existing = new Map((options.existingParts ?? []).map((part) => [part.id, part]));
        const hasExisting = existing.size > 0;

        this.parts = options.providerParts.map((part) => {
            const saved = existing.get(part.id);
            return {
                ...part,
                title: saved?.title ?? part.title,
                episodeCurrent: saved?.episodeCurrent ?? part.episodeCurrent ?? 0,
                episodeTotal: saved?.episodeTotal ?? part.episodeTotal,
                status: this.normalizePartStatus(saved?.status ?? part.status),
                isNew: Boolean(options.markNewParts && hasExisting && !saved),
            };
        });

        if (hasExisting) {
            for (const part of options.existingParts ?? []) {
                if (this.parts.some((candidate) => candidate.id === part.id)) {
                    this.selected.add(part.id);
                }
            }
        } else {
            for (const part of this.parts) this.selected.add(part.id);
        }

        this.activePartId = options.activePartId && this.selected.has(options.activePartId)
            ? options.activePartId
            : this.getFirstSelectedId();
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
        const icon = titleRow.createSpan({ cls: 'lorebase-select-title-icon' });
        setIcon(icon, 'list-checks');
        titleRow.createEl('h2', { cls: 'lorebase-select-title lorebase-select-review-heading', text: this.options.title });
        header.createDiv({
            cls: 'lorebase-select-review-subtitle',
            text: this.options.subtitle ?? t('animePartsProviderTitle'),
        });

        const toolbar = contentEl.createDiv({ cls: 'lorebase-anime-parts-toolbar' });
        const selectedText = toolbar.createDiv({ cls: 'lorebase-anime-parts-selected', text: this.getSelectedLabel() });
        selectedText.dataset.role = 'selected-count';

        this.listEl = contentEl.createDiv({ cls: 'lorebase-anime-parts-list' });
        this.renderRows();

        const footer = contentEl.createDiv({ cls: 'lorebase-modal-actions lorebase-select-footer' });
        const cancelBtn = footer.createEl('button', { cls: 'lorebase-flow-btn lorebase-flow-btn-secondary', attr: { type: 'button' } });
        setIcon(cancelBtn.createSpan({ cls: 'lorebase-flow-btn-icon' }), 'x');
        cancelBtn.createSpan({ cls: 'lorebase-flow-btn-label', text: t('commonCancel') });
        this.confirmBtn = footer.createEl('button', { cls: 'lorebase-flow-btn lorebase-flow-btn-primary', attr: { type: 'button' } });
        setIcon(this.confirmBtn.createSpan({ cls: 'lorebase-flow-btn-icon' }), 'check');
        this.confirmBtn.createSpan({ cls: 'lorebase-flow-btn-label', text: t('animePartsApply') });

        cancelBtn.addEventListener('click', () => this.cancel());
        this.confirmBtn.addEventListener('click', () => this.confirm());
        this.updateSelectedUi();
    }

    private renderRows(): void {
        if (!this.listEl) return;
        this.listEl.empty();

        if (this.parts.length === 0) {
            this.listEl.createDiv({ cls: 'lorebase-anime-parts-no-new', text: t('animePartsNoNew') });
            return;
        }

        for (const part of this.parts) {
            const item = this.listEl.createDiv({ cls: 'lorebase-anime-parts-item' });
            item.dataset.partId = part.id;
            item.toggleClass('is-selected', this.selected.has(part.id));
            item.toggleClass('is-active-part', this.activePartId === part.id);
            item.toggleClass('is-expanded', this.expandedPartId === part.id);

            const row = item.createDiv({ cls: 'lorebase-anime-parts-row' });
            const check = row.createEl('input', {
                cls: 'lorebase-anime-parts-checkbox',
                attr: { type: 'checkbox' },
            });
            check.checked = this.selected.has(part.id);
            check.addEventListener('change', () => {
                if (check.checked) this.selected.add(part.id);
                else this.selected.delete(part.id);

                if (this.activePartId === part.id && !this.selected.has(part.id)) {
                    this.activePartId = this.getFirstSelectedId();
                }
                if (!this.activePartId && this.selected.has(part.id)) {
                    this.activePartId = part.id;
                }

                item.toggleClass('is-selected', this.selected.has(part.id));
                this.updateActiveButtons();
                this.updateSelectedUi();
            });

            row.createSpan({
                cls: 'lorebase-anime-parts-title',
                text: part.title || 'Untitled',
                attr: { 'data-role': 'part-title' },
            });
            row.createSpan({
                cls: 'lorebase-anime-parts-meta',
                text: this.getPartMeta(part),
                attr: { 'data-role': 'part-meta' },
            });

            const editBtn = row.createEl('button', {
                cls: 'lorebase-anime-parts-edit-btn',
                attr: { type: 'button', title: t('contextEdit') },
            });
            setIcon(editBtn, this.expandedPartId === part.id ? 'chevron-up' : 'pencil');
            editBtn.addEventListener('click', () => {
                this.expandedPartId = this.expandedPartId === part.id ? null : part.id;
                this.renderRows();
            });

            if (this.expandedPartId === part.id) {
                this.renderPartEditor(item, part);
            }
        }
    }

    private renderPartEditor(item: HTMLElement, part: PartDraft): void {
        const editor = item.createDiv({ cls: 'lorebase-anime-parts-editor' });

        const activeLabel = editor.createEl('label', { cls: 'lorebase-anime-parts-active-field' });
        const activeRadio = activeLabel.createEl('input', {
            cls: 'lorebase-anime-parts-active-radio',
            attr: { type: 'radio', name: 'lorebase-anime-active-part' },
        });
        activeRadio.dataset.partId = part.id;
        activeRadio.checked = this.activePartId === part.id;
        activeRadio.disabled = !this.selected.has(part.id);
        activeRadio.addEventListener('change', () => {
            if (!activeRadio.checked || !this.selected.has(part.id)) return;
            this.activePartId = part.id;
            this.updateActiveButtons();
        });
        activeLabel.createSpan({ text: t('editActivePart') });

        const fields = editor.createDiv({ cls: 'lorebase-anime-parts-editor-grid' });

        const kindField = fields.createDiv({ cls: 'lorebase-anime-parts-field is-format' });
        kindField.createSpan({ text: t('editFormat') });
        const kindHost = kindField.createDiv({ cls: 'lorebase-anime-parts-dropdown lorebase-editmode-dropdown' });
        createLorebaseDropdown(
            kindHost,
            this.getFormats().map((value) => ({ value, label: this.getFormatLabel(value) })),
            part.kind,
            (value) => {
                part.kind = value;
                this.updatePartSummary(item, part);
            }
        );

        const titleField = fields.createEl('label', { cls: 'lorebase-anime-parts-field is-title' });
        titleField.createSpan({ text: t('templateFieldName') });
        const titleInput = titleField.createEl('input', {
            cls: 'lorebase-anime-parts-text',
            attr: { type: 'text' },
        });
        titleInput.value = part.title;
        titleInput.addEventListener('input', () => {
            part.title = titleInput.value.trim();
            this.updatePartSummary(item, part);
        });

        const seasonField = fields.createEl('label', { cls: 'lorebase-anime-parts-field' });
        seasonField.createSpan({ text: t('editSeasonCurrent') });
        const seasonInput = seasonField.createEl('input', {
            cls: 'lorebase-anime-parts-number',
            attr: { type: 'number', min: '0', inputmode: 'numeric' },
        });
        seasonInput.value = part.seasonNumber === null || part.seasonNumber === undefined ? '' : String(part.seasonNumber);
        seasonInput.addEventListener('input', () => {
            part.seasonNumber = this.parseNumber(seasonInput.value);
            this.updatePartSummary(item, part);
        });

        const episodeField = fields.createDiv({ cls: 'lorebase-anime-parts-field is-episodes' });
        episodeField.createSpan({ text: t('editEpisodeCurrent') });
        const progress = episodeField.createDiv({ cls: 'lorebase-anime-parts-progress' });
        const currentInput = progress.createEl('input', {
            cls: 'lorebase-anime-parts-number',
            attr: { type: 'number', min: '0', inputmode: 'numeric', title: t('editEpisodeCurrent') },
        });
        currentInput.value = String(part.episodeCurrent ?? 0);
        currentInput.addEventListener('input', () => {
            part.episodeCurrent = this.parseNumber(currentInput.value);
            this.updatePartSummary(item, part);
        });
        progress.createSpan({ cls: 'lorebase-anime-parts-slash', text: '/' });
        const totalInput = progress.createEl('input', {
            cls: 'lorebase-anime-parts-number',
            attr: { type: 'number', min: '0', inputmode: 'numeric', title: t('editEpisodeTotal') },
        });
        totalInput.value = part.episodeTotal === null || part.episodeTotal === undefined ? '' : String(part.episodeTotal);
        totalInput.addEventListener('input', () => {
            part.episodeTotal = this.parseNumber(totalInput.value);
            this.updatePartSummary(item, part);
        });

        const statusField = fields.createDiv({ cls: 'lorebase-anime-parts-field is-status' });
        statusField.createSpan({ text: t('templateFieldStatus') });
        const statusHost = statusField.createDiv({ cls: 'lorebase-anime-parts-dropdown lorebase-editmode-dropdown' });
        createLorebaseDropdown(
            statusHost,
            this.getPartStatuses().map((value) => ({ value, label: this.getStatusLabel(value) })),
            part.status,
            (value) => {
                part.status = value;
            }
        );
    }

    private updatePartSummary(item: HTMLElement, part: IntegrationAnimePart): void {
        const title = item.querySelector<HTMLElement>('[data-role="part-title"]');
        if (title) title.textContent = part.title || 'Untitled';
        const meta = item.querySelector<HTMLElement>('[data-role="part-meta"]');
        if (meta) meta.textContent = this.getPartMeta(part);
    }

    private updateSelectedUi(): void {
        const count = this.selected.size;
        const label = this.contentEl.querySelector<HTMLElement>('[data-role="selected-count"]');
        if (label) label.textContent = this.getSelectedLabel();
        if (this.confirmBtn) this.confirmBtn.disabled = count === 0;
    }

    private getFirstSelectedId(): string | null {
        for (const id of this.selected) return id;
        return null;
    }

    private updateActiveButtons(): void {
        this.listEl?.querySelectorAll<HTMLInputElement>('.lorebase-anime-parts-active-radio').forEach((radio) => {
            const partId = radio.dataset.partId ?? '';
            radio.checked = partId === this.activePartId;
            radio.disabled = !this.selected.has(partId);
        });
        this.listEl?.querySelectorAll<HTMLElement>('.lorebase-anime-parts-item').forEach((item) => {
            item.toggleClass('is-active-part', item.dataset.partId === this.activePartId);
        });
    }

    private confirm(): void {
        const parts = this.parts
            .filter((part) => this.selected.has(part.id))
            .map(({ isNew: _isNew, ...part }) => ({ ...part }));
        this.hasResolved = true;
        this.resolve?.({
            parts,
            activePartId: this.activePartId && this.selected.has(this.activePartId) ? this.activePartId : parts[0]?.id ?? null,
            status: parts.length > 0 && parts.every((part) => part.status === 'completed') ? 'completed' : this.status,
        });
        this.close();
    }

    private cancel(): void {
        this.hasResolved = true;
        this.resolve?.(null);
        this.close();
    }

    private getSelectedLabel(): string {
        return `${t('animePartsSelected')}: ${this.selected.size} / ${this.parts.length}`;
    }

    private getPartMeta(part: IntegrationAnimePart): string {
        const chunks = [this.getFormatLabel(part.kind)];
        if (part.seasonNumber !== null && part.seasonNumber !== undefined) {
            chunks.push(`S${part.seasonNumber}`);
        }
        chunks.push(`${part.episodeCurrent ?? 0}/${part.episodeTotal ?? '?'}`);
        return chunks.join(' · ');
    }

    private parseNumber(value: string): number | null {
        if (!value.trim()) return null;
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
    }

    private normalizePartStatus(status: AnimeStatus): AnimeStatus {
        return status === 'dropped' ? 'planned' : status;
    }

    private getPartStatuses(): AnimeStatus[] {
        return ['planned', 'watching', 'completed', 'paused'];
    }

    private getFormats(): IntegrationAnimePart['kind'][] {
        return ['tv', 'movie', 'ova', 'ona', 'special'];
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
            case 'planned': return t('statusPlanned');
            case 'watching': return t('statusWatching');
            case 'completed': return t('statusCompleted');
            case 'dropped': return t('statusDropped');
            case 'paused': return t('statusPaused');
        }
    }
}
