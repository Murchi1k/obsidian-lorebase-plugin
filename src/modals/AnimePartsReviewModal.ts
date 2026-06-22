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

        for (const part of this.parts) {
            const row = this.listEl.createDiv({ cls: 'lorebase-anime-parts-row' });
            row.toggleClass('is-selected', this.selected.has(part.id));

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
                if (!this.activePartId && this.selected.has(part.id)) this.activePartId = part.id;
                row.toggleClass('is-selected', this.selected.has(part.id));
                this.updateActiveButtons();
                this.updateSelectedUi();
            });

            const main = row.createDiv({ cls: 'lorebase-anime-parts-row-main' });
            const fields = main.createDiv({ cls: 'lorebase-anime-parts-part-fields' });
            const kindLabel = fields.createEl('label', { cls: 'lorebase-anime-parts-field is-kind' });
            kindLabel.createSpan({ text: t('editFormat') });
            const kindHost = kindLabel.createDiv({ cls: 'lorebase-anime-parts-dropdown lorebase-editmode-dropdown' });
            createLorebaseDropdown(
                kindHost,
                this.getFormats().map((value) => ({ value, label: this.getFormatLabel(value) })),
                part.kind,
                (value) => {
                    part.kind = value;
                    this.updatePartMeta(row, part);
                }
            );

            const titleLabel = fields.createEl('label', { cls: 'lorebase-anime-parts-field is-title' });
            titleLabel.createSpan({ text: t('templateFieldName') });
            const titleInput = titleLabel.createEl('input', {
                cls: 'lorebase-anime-parts-text',
                attr: { type: 'text' },
            });
            titleInput.value = part.title;
            titleInput.addEventListener('input', () => {
                part.title = titleInput.value.trim();
            });

            const seasonLabel = fields.createEl('label', { cls: 'lorebase-anime-parts-field is-season' });
            seasonLabel.createSpan({ text: t('editSeasonCurrent') });
            const seasonInput = seasonLabel.createEl('input', {
                cls: 'lorebase-anime-parts-number',
                attr: { type: 'number', min: '0', inputmode: 'numeric' },
            });
            seasonInput.value = part.seasonNumber === null || part.seasonNumber === undefined ? '' : String(part.seasonNumber);
            seasonInput.addEventListener('input', () => {
                part.seasonNumber = this.parseNumber(seasonInput.value);
            });
            main.createDiv({ cls: 'lorebase-anime-parts-row-meta', text: this.getPartMeta(part) });

            const controls = row.createDiv({ cls: 'lorebase-anime-parts-row-controls' });
            const statusHost = controls.createDiv({ cls: 'lorebase-anime-parts-dropdown lorebase-anime-parts-status-dropdown lorebase-editmode-dropdown' });
            createLorebaseDropdown(
                statusHost,
                this.getPartStatuses().map((value) => ({ value, label: this.getStatusLabel(value) })),
                part.status,
                (value) => {
                    part.status = value;
                }
            );

            const current = controls.createEl('input', {
                cls: 'lorebase-anime-parts-number',
                attr: { type: 'number', min: '0', inputmode: 'numeric', title: t('editEpisodeCurrent') },
            });
            current.value = String(part.episodeCurrent ?? 0);
            current.addEventListener('input', () => {
                part.episodeCurrent = this.parseNumber(current.value);
                this.updatePartMeta(row, part);
            });

            controls.createSpan({ cls: 'lorebase-anime-parts-slash', text: '/' });

            const total = controls.createEl('input', {
                cls: 'lorebase-anime-parts-number',
                attr: { type: 'number', min: '0', inputmode: 'numeric', title: t('editEpisodeTotal') },
            });
            total.value = part.episodeTotal === null || part.episodeTotal === undefined ? '' : String(part.episodeTotal);
            total.addEventListener('input', () => {
                part.episodeTotal = this.parseNumber(total.value);
                this.updatePartMeta(row, part);
            });

            const active = controls.createEl('button', {
                cls: `lorebase-anime-parts-active ${this.activePartId === part.id ? 'is-active' : ''}`,
                attr: { type: 'button', title: t('editActivePart') },
            });
            active.dataset.partId = part.id;
            setIcon(active, 'target');
            active.disabled = !this.selected.has(part.id);
            active.addEventListener('click', () => {
                if (!this.selected.has(part.id)) return;
                this.activePartId = part.id;
                this.updateActiveButtons();
            });
        }
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
        this.listEl?.querySelectorAll<HTMLButtonElement>('.lorebase-anime-parts-active').forEach((button) => {
            const partId = button.dataset.partId ?? '';
            const active = partId === this.activePartId;
            button.disabled = !this.selected.has(partId);
            button.toggleClass('is-active', active);
        });
    }

    private updatePartMeta(row: HTMLElement, part: IntegrationAnimePart): void {
        const meta = row.querySelector<HTMLElement>('.lorebase-anime-parts-row-meta');
        if (meta) meta.textContent = this.getPartMeta(part);
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

    private getPartLabel(part: IntegrationAnimePart): string {
        if (part.kind === 'tv' && part.seasonNumber) return `S${part.seasonNumber}: ${part.title}`;
        return `${part.kind.toUpperCase()}: ${part.title}`;
    }

    private getPartMeta(part: IntegrationAnimePart): string {
        const total = part.episodeTotal ?? '?';
        return `${part.kind.toUpperCase()} ${part.episodeCurrent ?? 0}/${total}`;
    }

    private parseNumber(value: string): number | null {
        if (!value.trim()) return null;
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
    }

    private getPartStatuses(): AnimeStatus[] {
        return ['planned', 'watching', 'completed', 'paused'];
    }

    private normalizePartStatus(status: AnimeStatus): AnimeStatus {
        return status === 'dropped' ? 'planned' : status;
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
