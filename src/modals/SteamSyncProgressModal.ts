
import { App, Modal, setIcon } from 'obsidian';
import {
    SteamSyncController,
    type SteamImportCandidate,
    type SteamSyncItemOutcome,
    type SteamSyncItemResult,
    type SteamSyncResult,
} from '../services/SteamSyncService';
import type { Language } from '../types';
import type { InlineSyncPresentation } from './inlineSync';
import { getSteamLibraryPoster } from '../services/integrations/steamImages';
import { getSteamImportDisplayName } from '../services/integrations/steamPreview';

export type ProgressStatus = SteamSyncItemOutcome | 'pending' | 'processing' | 'cancelled';
type ProgressTextKey =
    | 'title' | 'running' | 'paused' | 'cancelling' | 'cancelled' | 'blocked' | 'complete' | 'failed'
    | 'pause' | 'resume' | 'cancel' | 'close'
    | 'created' | 'updated' | 'skipped' | 'errors' | 'pending' | 'processing' | 'added' | 'completeWithErrors';

const TEXT: Record<Language, Record<ProgressTextKey, string>> = {
    en: {
        title: 'Importing games',
        running: 'You can pause or cancel after the current game.',
        paused: 'Paused. No new game requests will start.',
        cancelling: 'Cancelling after the current game...',
        cancelled: 'Import cancelled.',
        blocked: 'Import stopped because Steam paused requests.',
        complete: 'Import complete.',
        completeWithErrors: 'Import finished with errors.',
        failed: 'Steam Sync failed.',
        pause: 'Pause',
        resume: 'Resume',
        cancel: 'Cancel',
        close: 'Done',
        created: 'Created',
        added: 'Added to your library',
        updated: 'Updated',
        skipped: 'Skipped',
        errors: 'Errors',
        pending: 'Pending',
        processing: 'Processing',
    },
    ru: {
        title: 'Импорт игр',
        running: 'Можно приостановить или отменить после текущей игры.',
        paused: 'Приостановлено. Новые запросы игр не запускаются.',
        cancelling: 'Отмена после завершения текущей игры...',
        cancelled: 'Импорт отменён.',
        blocked: 'Импорт остановлен: Steam приостановил запросы.',
        complete: 'Импорт завершён.',
        completeWithErrors: 'Импорт завершён с ошибками.',
        failed: 'Steam Sync завершился с ошибкой.',
        pause: 'Пауза',
        resume: 'Продолжить',
        cancel: 'Отменить',
        close: 'Готово',
        created: 'Создано',
        added: 'Добавлено в библиотеку',
        updated: 'Обновлено',
        skipped: 'Пропущено',
        errors: 'Ошибки',
        pending: 'Ожидает',
        processing: 'Обработка',
    },
    uk: {
        title: 'Імпорт ігор',
        running: 'Можна призупинити або скасувати після поточної гри.',
        paused: 'Призупинено. Нові запити ігор не запускаються.',
        cancelling: 'Скасування після завершення поточної гри...',
        cancelled: 'Імпорт скасовано.',
        blocked: 'Імпорт зупинено: Steam призупинив запити.',
        complete: 'Імпорт завершено.',
        completeWithErrors: 'Імпорт завершено з помилками.',
        failed: 'Steam Sync завершився з помилкою.',
        pause: 'Пауза',
        resume: 'Продовжити',
        cancel: 'Скасувати',
        close: 'Готово',
        created: 'Створено',
        added: 'Додано до бібліотеки',
        updated: 'Оновлено',
        skipped: 'Пропущено',
        errors: 'Помилки',
        pending: 'Очікує',
        processing: 'Обробка',
    },
    'zh-CN': {
        title: '正在导入游戏',
        running: '当前游戏处理完成后可以暂停或取消。',
        paused: '已暂停，不会开始新的游戏请求。',
        cancelling: '将在当前游戏处理完成后取消…',
        cancelled: '导入已取消。',
        blocked: '由于 Steam 暂停请求，导入已停止。',
        complete: '导入完成。',
        completeWithErrors: '导入完成，但存在错误。',
        failed: 'Steam 同步失败。',
        pause: '暂停',
        resume: '继续',
        cancel: '取消',
        close: '完成',
        created: '已创建',
        added: '已添加至资料库',
        updated: '已更新',
        skipped: '已跳过',
        errors: '错误',
        pending: '等待中',
        processing: '处理中',
    },
};

export class SteamSyncProgressModal extends Modal {
    private inline?: InlineSyncPresentation;
    private removeAbort?: () => void;
    private get root(): HTMLElement { return this.inline?.host ?? this.contentEl; }
    private readonly candidates: SteamImportCandidate[];
    private readonly language: Language;
    private readonly controller = new SteamSyncController();
    private readonly statuses = new Map<number, ProgressStatus>();
    private readonly rows = new Map<number, HTMLElement>();
    private readonly details = new Map<number, string>();
    private readonly results: SteamSyncResult = { created: 0, updated: 0, skipped: 0, failed: 0 };
    private unsubscribeController?: () => void;
    private processed = 0;
    private finished = false;
    private haltReason: 'cancelled' | 'blocked' | null = null;
    private statusEl?: HTMLElement;
    private progressTitleEl?: HTMLElement;
    private headerIcon?: HTMLElement;
    private fatalError = false;
    private activeName = '';
    private progressFillEl?: HTMLElement;
    private progressTextEl?: HTMLElement;
    private summaryEl?: HTMLElement;
    private pauseBtn?: HTMLButtonElement;
    private cancelBtn?: HTMLButtonElement;
    private closeBtn?: HTMLButtonElement;

    constructor(app: App, candidates: SteamImportCandidate[], language: Language = 'en', private readonly source: 'steam' | 'anilist' = 'steam') {
        super(app);
        this.candidates = candidates;
        this.language = language;
        candidates.forEach((candidate) => this.statuses.set(candidate.appId, 'pending'));
    }

    getController(): SteamSyncController {
        return this.controller;
    }

    mountInline(presentation: InlineSyncPresentation): void {
        this.inline = presentation;
        presentation.host.removeClass('lorebase-steam-sync-review');
        const abort = () => this.onClose();
        presentation.signal.addEventListener('abort', abort, { once: true });
        this.removeAbort = () => presentation.signal.removeEventListener('abort', abort);
        if (presentation.signal.aborted) { this.onClose(); return; }
        this.render();
        this.unsubscribeController = this.controller.onChange(() => this.syncControls());
    }

    onOpen(): void {
        this.modalEl.addClass('lorebase-steam-progress-modal-container');
        this.render();
        this.unsubscribeController = this.controller.onChange(() => this.syncControls());
    }

    onClose(): void {
        if (!this.finished) this.controller.cancel();
        this.unsubscribeController?.();
        this.removeAbort?.();
        if (!this.inline) this.modalEl.removeClass('lorebase-steam-progress-modal-container');
        this.root.empty();
    }

    setCurrent(candidate: SteamImportCandidate, _index: number, _total: number): void {
        if (this.finished) return;
        this.statuses.set(candidate.appId, 'processing');
        this.updateRow(candidate.appId);
        this.activeName = getSteamImportDisplayName(candidate.name, this.language);
        this.setStatus(this.activeName);
        this.updateProgress();
        this.rows.get(candidate.appId)?.scrollIntoView({ block: 'nearest' });
    }

    addResult(item: SteamSyncItemResult): void {
        if (this.finished) return;
        this.statuses.set(item.appId, item.outcome);
        const name = getSteamImportDisplayName(item.name, this.language);
        this.rows.get(item.appId)?.querySelector('.lorebase-sp-game')?.setText(name);
        if (item.detail) this.details.set(item.appId, item.detail);
        this.processed++;
        this.results[item.outcome === 'failed' ? 'failed' : item.outcome]++;
        this.updateRow(item.appId);
        this.updateProgress();
        this.updateSummary();
    }

    halt(reason: 'cancelled' | 'blocked'): void {
        this.haltReason = reason;
        if (reason === 'cancelled') this.setStatus(this.text('cancelling'));
        else this.setStatus(this.text('blocked'));
    }

    complete(result: SteamSyncResult): void {
        this.finished = true;
        Object.assign(this.results, result);
        this.markRemainingCancelled();
        for (const id of this.rows.keys()) this.updateRow(id);
        this.setStatus(this.haltReason === 'blocked'
            ? this.text('blocked')
            : this.haltReason === 'cancelled' || this.controller.isCancelled()
                ? this.text('cancelled')
                : this.text('complete'));
        this.updateProgress();
        this.updateSummary();
        this.syncControls();
        if (!this.inline?.signal.aborted) this.closeBtn?.focus();
    }

    fail(error: unknown): void {
        this.finished = true;
        this.fatalError = true;
        this.markRemainingCancelled();
        const message = error instanceof Error && error.message ? ` ${error.message}` : '';
        this.setStatus(`${this.text('failed')}${message}`);
        this.updateSummary();
        this.syncControls();
    }

    private render(): void {
        this.root.empty();
        this.root.addClass('lorebase-steam-progress-modal', 'lorebase-steam-progress-workspace');

        const header = this.root.createDiv({ cls: 'lorebase-sp-header' });
        this.headerIcon = header.createSpan({ cls: 'lorebase-sp-title-icon' });
        setIcon(this.headerIcon, 'loader-circle');
        const heading = header.createDiv({ cls: 'lorebase-sp-heading' });
        this.progressTitleEl = heading.createDiv({ cls: 'lorebase-sp-title', text: this.text('title') });
        this.statusEl = heading.createDiv({ cls: 'lorebase-sp-status', text: this.text('running') });

        const progress = this.root.createDiv({ cls: 'lorebase-sp-progress' });
        const track = progress.createDiv({ cls: 'lorebase-sp-progress-track' });
        track.setAttribute('role', 'progressbar');
        track.setAttribute('aria-valuemin', '0');
        track.setAttribute('aria-valuemax', String(this.candidates.length));
        this.progressFillEl = track.createDiv({ cls: 'lorebase-sp-progress-fill' });
        this.progressTextEl = progress.createDiv({ cls: 'lorebase-sp-progress-text' });

        this.summaryEl = this.root.createDiv({ cls: 'lorebase-sp-summary' });
        this.updateSummary();

        const list = this.root.createDiv({ cls: 'lorebase-sp-list' });
        for (const candidate of this.candidates) {
            const row = list.createDiv({ cls: 'lorebase-sp-row' });
            const art = row.createDiv({ cls: 'lorebase-sp-art' });
            setIcon(art.createSpan({ cls: 'lorebase-sp-art-fallback' }), 'gamepad-2');
            const poster = candidate.poster || (this.source === 'steam' ? getSteamLibraryPoster(candidate.appId) : '');
            if (poster) {
                const image = art.createEl('img', { attr: { src: poster, loading: 'lazy', alt: '' } });
                image.addEventListener('error', () => image.remove(), { once: true });
            }
            const info = row.createDiv({ cls: 'lorebase-sp-row-info' });
            info.createDiv({ cls: 'lorebase-sp-game', text: getSteamImportDisplayName(candidate.name, this.language) });
            info.createSpan({ cls: 'lorebase-sp-row-status' });
            row.createSpan({ cls: 'lorebase-sp-outcome-icon', attr: { 'aria-hidden': 'true' } });
            this.rows.set(candidate.appId, row);
            this.updateRow(candidate.appId);
        }

        const footer = this.root.createDiv({ cls: 'lorebase-sp-footer' });
        this.pauseBtn = this.createButton(footer, 'pause', this.text('pause'), 'secondary');
        this.cancelBtn = this.createButton(footer, 'square', this.text('cancel'), 'danger');
        this.closeBtn = this.createButton(footer, 'check', this.text('close'), 'primary');
        this.closeBtn.disabled = true;

        this.pauseBtn.addEventListener('click', () => {
            if (this.controller.isPaused()) this.controller.resume();
            else this.controller.pause();
        });
        this.cancelBtn.addEventListener('click', () => {
            this.haltReason = 'cancelled';
            this.controller.cancel();
            this.setStatus(this.text('cancelling'));
            this.syncControls();
        });
        this.closeBtn.addEventListener('click', () => this.inline ? this.inline.onBack() : this.close());
        this.updateProgress();
        this.syncControls();
    }

    private createButton(
        container: HTMLElement,
        iconName: string,
        label: string,
        variant: 'primary' | 'secondary' | 'danger'
    ): HTMLButtonElement {
        const button = container.createEl('button', {
            cls: `lorebase-sp-btn is-${variant} lorebase-flow-btn ${variant === 'primary' ? 'lorebase-flow-btn-primary' : 'lorebase-flow-btn-secondary'}`,
            attr: { type: 'button' },
        });
        const icon = button.createSpan({ cls: 'lorebase-sp-btn-icon' });
        setIcon(icon, iconName);
        button.createSpan({ cls: 'lorebase-sp-btn-label', text: label });
        return button;
    }

    private syncControls(): void {
        if (!this.pauseBtn || !this.cancelBtn || !this.closeBtn) return;
        this.pauseBtn.disabled = this.finished || this.controller.isCancelled();
        this.cancelBtn.disabled = this.finished || this.controller.isCancelled();
        this.closeBtn.disabled = !this.finished;
        this.pauseBtn.hidden = this.finished;
        this.cancelBtn.hidden = this.finished;
        this.closeBtn.hidden = !this.finished;
        const state = this.finished ? this.fatalError ? 'failed' : this.haltReason ?? (this.controller.isCancelled() ? 'cancelled' : this.results.failed ? 'errors' : 'complete')
            : this.controller.isCancelled() ? 'cancelling' : this.controller.isPaused() ? 'paused' : 'running';
        this.root.setAttribute('data-state', state);
        this.root.toggleClass('is-finished', this.finished);
        this.root.toggleClass('is-single-result', this.finished && this.candidates.length === 1);
        if (this.headerIcon) {
            this.headerIcon.empty();
            setIcon(this.headerIcon, this.finished ? (state === 'complete' ? 'circle-check' : state === 'cancelled' ? 'circle-stop' : 'circle-alert') : state === 'paused' ? 'pause' : 'loader-circle');
        }
        if (this.finished && this.progressTitleEl) {
            this.progressTitleEl.setText(this.text(state === 'errors' ? 'completeWithErrors' : state === 'complete' ? 'complete' : state === 'cancelled' ? 'cancelled' : state === 'blocked' ? 'blocked' : 'failed'));
            if (state !== 'failed') this.statusEl?.setText('');
        }

        this.pauseBtn.empty();
        const icon = this.pauseBtn.createSpan({ cls: 'lorebase-sp-btn-icon' });
        setIcon(icon, this.controller.isPaused() ? 'play' : 'pause');
        this.pauseBtn.createSpan({
            cls: 'lorebase-sp-btn-label',
            text: this.controller.isPaused() ? this.text('resume') : this.text('pause'),
        });

        if (!this.finished && this.controller.isPaused()) {
            this.setStatus(this.text('paused'));
        } else if (!this.finished && this.controller.isCancelled()) {
            this.setStatus(this.text('cancelling'));
        } else if (!this.finished) {
            this.setStatus(this.activeName || this.text('running'));
        }
    }

    private updateRow(appId: number): void {
        const row = this.rows.get(appId);
        const status = this.statuses.get(appId) ?? 'pending';
        if (!row) return;
        row.setAttr('data-status', status);
        const badge = row.querySelector<HTMLElement>('.lorebase-sp-row-status');
        badge?.setText(this.statusLabel(status));
        const icon = row.querySelector<HTMLElement>('.lorebase-sp-outcome-icon');
        if (icon) {
            icon.empty();
            setIcon(icon, status === 'created' || status === 'updated' ? 'check' : status === 'failed' ? 'circle-alert' : status === 'processing' ? 'loader-circle' : status === 'skipped' ? 'minus' : status === 'cancelled' ? 'x' : 'circle');
        }
        let detail = row.querySelector<HTMLElement>('.lorebase-sp-row-detail');
        const detailText = this.details.get(appId);
        if (detailText) {
            detail ??= row.querySelector<HTMLElement>('.lorebase-sp-row-info')!.createDiv({ cls: 'lorebase-sp-row-detail' });
            detail.setText(detailText);
        } else {
            detail?.remove();
        }
    }

    private updateProgress(): void {
        const total = this.candidates.length;
        const percent = total > 0 ? Math.min(100, Math.round((this.processed / total) * 100)) : 100;
        this.progressFillEl?.setCssStyles({ width: `${percent}%` });
        this.progressFillEl?.parentElement?.setAttribute('aria-valuenow', String(this.processed));
        this.progressTextEl?.setText(`${this.processed} / ${total} · ${percent}%`);
    }

    private updateSummary(): void {
        if (!this.summaryEl) return;
        this.summaryEl.empty();
        const entries: Array<[string, number, 'created' | 'updated' | 'skipped' | 'failed']> = [
            [this.text('created'), this.results.created, 'created'],
            [this.text('updated'), this.results.updated, 'updated'],
            [this.text('skipped'), this.results.skipped, 'skipped'],
            [this.text('errors'), this.results.failed, 'failed'],
        ];
        for (const [label, value, status] of entries) {
            if (this.finished && value === 0) continue;
            const item = this.summaryEl.createDiv({ cls: `lorebase-sp-summary-item is-${status}` });
            item.createSpan({ cls: 'lorebase-sp-summary-value', text: String(value) });
            item.createSpan({ cls: 'lorebase-sp-summary-label', text: label });
        }
        this.summaryEl.hidden = !this.summaryEl.childElementCount;
    }

    private markRemainingCancelled(): void {
        for (const candidate of this.candidates) {
            const status = this.statuses.get(candidate.appId);
            if (status === 'pending' || status === 'processing') {
                this.statuses.set(candidate.appId, 'cancelled');
                this.updateRow(candidate.appId);
            }
        }
    }

    private setStatus(value: string): void {
        this.statusEl?.setText(value);
    }

    private statusLabel(status: ProgressStatus): string {
        if (status === 'created') return this.text(this.finished ? 'added' : 'created');
        if (status === 'updated') return this.text('updated');
        if (status === 'skipped') return this.text('skipped');
        if (status === 'failed') return this.text('errors');
        if (status === 'cancelled') return this.text('cancelled');
        if (status === 'processing') return this.text('processing');
        return this.text('pending');
    }

    private text(key: ProgressTextKey): string {
        if (this.source === 'anilist') {
            const copy: Record<Language, Partial<Record<ProgressTextKey, string>>> = {
                ru: { title: 'Импорт из AniList', running: 'Добавляем выбранные аниме и мангу в библиотеку.', paused: 'Импорт приостановлен.', cancelling: 'Останавливаем после текущей записи…', failed: 'Не удалось завершить импорт AniList.' },
                uk: { title: 'Імпорт з AniList', running: 'Додаємо вибрані аніме й манґу до бібліотеки.', paused: 'Імпорт призупинено.', cancelling: 'Зупиняємо після поточного запису…', failed: 'Не вдалося завершити імпорт AniList.' },
                en: { title: 'Import from AniList', running: 'Adding selected anime and manga to your library.', paused: 'Import paused.', cancelling: 'Stopping after the current entry…', failed: 'AniList import failed.' },
                'zh-CN': { title: '从 AniList 导入', running: '正在将所选动画和漫画添加至资料库。', paused: '导入已暂停。', cancelling: '将在当前条目完成后停止…', failed: 'AniList 导入失败。' },
            };
            if (copy[this.language]?.[key]) return copy[this.language][key]!;
        }
        return TEXT[this.language]?.[key] ?? TEXT.en[key];
    }
}
