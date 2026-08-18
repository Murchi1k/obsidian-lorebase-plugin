import { App, Modal, setIcon } from 'obsidian';
import {
    SteamSyncController,
    type SteamImportCandidate,
    type SteamSyncItemOutcome,
    type SteamSyncItemResult,
    type SteamSyncResult,
} from '../services/SteamSyncService';
import type { Language } from '../types';

export type ProgressStatus = SteamSyncItemOutcome | 'pending' | 'processing' | 'cancelled';
type ProgressTextKey =
    | 'title' | 'running' | 'paused' | 'cancelling' | 'cancelled' | 'blocked' | 'complete' | 'failed'
    | 'pause' | 'resume' | 'cancel' | 'close'
    | 'created' | 'updated' | 'skipped' | 'errors' | 'pending' | 'processing';

const TEXT: Record<Language, Record<ProgressTextKey, string>> = {
    en: {
        title: 'Steam Sync progress',
        running: 'Import is running. You can pause or cancel after the current game.',
        paused: 'Paused. No new game requests will start.',
        cancelling: 'Cancelling after the current game...',
        cancelled: 'Import cancelled.',
        blocked: 'Import stopped because Steam paused requests.',
        complete: 'Import complete.',
        failed: 'Steam Sync failed.',
        pause: 'Pause',
        resume: 'Resume',
        cancel: 'Cancel',
        close: 'Close',
        created: 'Created',
        updated: 'Updated',
        skipped: 'Skipped',
        errors: 'Errors',
        pending: 'Pending',
        processing: 'Processing',
    },
    ru: {
        title: 'Прогресс Steam Sync',
        running: 'Импорт выполняется. Его можно приостановить или отменить после текущей игры.',
        paused: 'Приостановлено. Новые запросы игр не запускаются.',
        cancelling: 'Отмена после завершения текущей игры...',
        cancelled: 'Импорт отменён.',
        blocked: 'Импорт остановлен: Steam приостановил запросы.',
        complete: 'Импорт завершён.',
        failed: 'Steam Sync завершился с ошибкой.',
        pause: 'Пауза',
        resume: 'Продолжить',
        cancel: 'Отменить',
        close: 'Закрыть',
        created: 'Создано',
        updated: 'Обновлено',
        skipped: 'Пропущено',
        errors: 'Ошибки',
        pending: 'Ожидает',
        processing: 'Обработка',
    },
    uk: {
        title: 'Прогрес Steam Sync',
        running: 'Імпорт виконується. Його можна призупинити або скасувати після поточної гри.',
        paused: 'Призупинено. Нові запити ігор не запускаються.',
        cancelling: 'Скасування після завершення поточної гри...',
        cancelled: 'Імпорт скасовано.',
        blocked: 'Імпорт зупинено: Steam призупинив запити.',
        complete: 'Імпорт завершено.',
        failed: 'Steam Sync завершився з помилкою.',
        pause: 'Пауза',
        resume: 'Продовжити',
        cancel: 'Скасувати',
        close: 'Закрити',
        created: 'Створено',
        updated: 'Оновлено',
        skipped: 'Пропущено',
        errors: 'Помилки',
        pending: 'Очікує',
        processing: 'Обробка',
    },
    'zh-CN': {
        title: 'Steam 同步进度',
        running: '正在导入。当前游戏处理完成后可以暂停或取消。',
        paused: '已暂停，不会开始新的游戏请求。',
        cancelling: '将在当前游戏处理完成后取消…',
        cancelled: '导入已取消。',
        blocked: '由于 Steam 暂停请求，导入已停止。',
        complete: '导入完成。',
        failed: 'Steam 同步失败。',
        pause: '暂停',
        resume: '继续',
        cancel: '取消',
        close: '关闭',
        created: '已创建',
        updated: '已更新',
        skipped: '已跳过',
        errors: '错误',
        pending: '等待中',
        processing: '处理中',
    },
};

export class SteamSyncProgressModal extends Modal {
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
    private progressFillEl?: HTMLElement;
    private progressTextEl?: HTMLElement;
    private summaryEl?: HTMLElement;
    private pauseBtn?: HTMLButtonElement;
    private cancelBtn?: HTMLButtonElement;
    private closeBtn?: HTMLButtonElement;

    constructor(app: App, candidates: SteamImportCandidate[], language: Language = 'en') {
        super(app);
        this.candidates = candidates;
        this.language = language;
        candidates.forEach((candidate) => this.statuses.set(candidate.appId, 'pending'));
    }

    getController(): SteamSyncController {
        return this.controller;
    }

    onOpen(): void {
        this.modalEl.addClass('lorebase-steam-progress-modal-container');
        this.render();
        this.unsubscribeController = this.controller.onChange(() => this.syncControls());
    }

    onClose(): void {
        if (!this.finished) this.controller.cancel();
        this.unsubscribeController?.();
        this.modalEl.removeClass('lorebase-steam-progress-modal-container');
        this.contentEl.empty();
    }

    setCurrent(candidate: SteamImportCandidate, index: number, total: number): void {
        if (this.finished) return;
        this.statuses.set(candidate.appId, 'processing');
        this.updateRow(candidate.appId);
        this.setStatus(`${this.text('processing')}: ${candidate.name} · ${index + 1}/${total}`);
        this.updateProgress();
        this.rows.get(candidate.appId)?.scrollIntoView({ block: 'nearest' });
    }

    addResult(item: SteamSyncItemResult): void {
        if (this.finished) return;
        this.statuses.set(item.appId, item.outcome);
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
        this.setStatus(this.haltReason === 'blocked'
            ? this.text('blocked')
            : this.haltReason === 'cancelled' || this.controller.isCancelled()
                ? this.text('cancelled')
                : this.text('complete'));
        this.updateProgress();
        this.updateSummary();
        this.syncControls();
    }

    fail(error: unknown): void {
        this.finished = true;
        this.markRemainingCancelled();
        const message = error instanceof Error && error.message ? ` ${error.message}` : '';
        this.setStatus(`${this.text('failed')}${message}`);
        this.syncControls();
    }

    private render(): void {
        this.contentEl.empty();
        this.contentEl.addClass('lorebase-steam-progress-modal');

        const header = this.contentEl.createDiv({ cls: 'lorebase-sp-header' });
        const icon = header.createSpan({ cls: 'lorebase-sp-title-icon' });
        setIcon(icon, 'refresh-cw');
        const heading = header.createDiv({ cls: 'lorebase-sp-heading' });
        heading.createDiv({ cls: 'lorebase-sp-title', text: this.text('title') });
        this.statusEl = heading.createDiv({ cls: 'lorebase-sp-status', text: this.text('running') });

        const progress = this.contentEl.createDiv({ cls: 'lorebase-sp-progress' });
        const track = progress.createDiv({ cls: 'lorebase-sp-progress-track' });
        this.progressFillEl = track.createDiv({ cls: 'lorebase-sp-progress-fill' });
        this.progressTextEl = progress.createDiv({ cls: 'lorebase-sp-progress-text' });

        this.summaryEl = this.contentEl.createDiv({ cls: 'lorebase-sp-summary' });
        this.updateSummary();

        const list = this.contentEl.createDiv({ cls: 'lorebase-sp-list' });
        for (const candidate of this.candidates) {
            const row = list.createDiv({ cls: 'lorebase-sp-row' });
            row.createDiv({ cls: 'lorebase-sp-game', text: candidate.name });
            row.createDiv({ cls: 'lorebase-sp-appid', text: `App ${candidate.appId}` });
            row.createSpan({ cls: 'lorebase-sp-row-status' });
            this.rows.set(candidate.appId, row);
            this.updateRow(candidate.appId);
        }

        const footer = this.contentEl.createDiv({ cls: 'lorebase-sp-footer' });
        this.pauseBtn = this.createButton(footer, 'pause', this.text('pause'), 'secondary');
        this.cancelBtn = this.createButton(footer, 'square', this.text('cancel'), 'danger');
        this.closeBtn = this.createButton(footer, 'x', this.text('close'), 'primary');
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
        this.closeBtn.addEventListener('click', () => this.close());
        this.updateProgress();
    }

    private createButton(
        container: HTMLElement,
        iconName: string,
        label: string,
        variant: 'primary' | 'secondary' | 'danger'
    ): HTMLButtonElement {
        const button = container.createEl('button', {
            cls: `lorebase-sp-btn is-${variant}`,
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
        }
    }

    private updateRow(appId: number): void {
        const row = this.rows.get(appId);
        const status = this.statuses.get(appId) ?? 'pending';
        if (!row) return;
        row.setAttr('data-status', status);
        const badge = row.querySelector<HTMLElement>('.lorebase-sp-row-status');
        badge?.setText(this.statusLabel(status));
        let detail = row.querySelector<HTMLElement>('.lorebase-sp-row-detail');
        const detailText = this.details.get(appId);
        if (detailText) {
            detail ??= row.createDiv({ cls: 'lorebase-sp-row-detail' });
            detail.setText(detailText);
            row.setAttr('title', detailText);
        } else {
            detail?.remove();
            row.removeAttribute('title');
        }
    }

    private updateProgress(): void {
        const total = this.candidates.length;
        const percent = total > 0 ? Math.min(100, Math.round((this.processed / total) * 100)) : 100;
        this.progressFillEl?.setCssStyles({ width: `${percent}%` });
        this.progressTextEl?.setText(`${this.processed} / ${total} · ${percent}%`);
    }

    private updateSummary(): void {
        if (!this.summaryEl) return;
        this.summaryEl.empty();
        const entries: Array<[string, number, 'created' | 'skipped' | 'failed']> = [
            [this.text('created'), this.results.created, 'created'],
            [this.text('skipped'), this.results.skipped, 'skipped'],
            [this.text('errors'), this.results.failed, 'failed'],
        ];
        for (const [label, value, status] of entries) {
            const item = this.summaryEl.createDiv({ cls: `lorebase-sp-summary-item is-${status}` });
            item.createSpan({ cls: 'lorebase-sp-summary-value', text: String(value) });
            item.createSpan({ cls: 'lorebase-sp-summary-label', text: label });
        }
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
        if (status === 'created') return this.text('created');
        if (status === 'updated') return this.text('updated');
        if (status === 'skipped') return this.text('skipped');
        if (status === 'failed') return this.text('errors');
        if (status === 'cancelled') return this.text('cancelled');
        if (status === 'processing') return this.text('processing');
        return this.text('pending');
    }

    private text(key: ProgressTextKey): string {
        return TEXT[this.language]?.[key] ?? TEXT.en[key];
    }
}
