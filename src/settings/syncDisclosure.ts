import { handleAsyncAction } from '../utils/actionHandler';
import { setIcon } from 'obsidian';
import { i18n } from '../localization';
import { renderMediaSwitch } from './sections/mediaSwitch';

export function createSyncWorkspace(container: HTMLElement): {
    operations: HTMLElement;
    navigation: HTMLElement;
    addPage: (title: string, icon: string, description: string) => HTMLElement;
} {
    const workspace = container.createDiv({ cls: 'lorebase-sync-workspace-body lorebase-sync-dashboard' });
    const overview = workspace.createDiv({ cls: 'lorebase-sync-overview' });
    const operations = overview.createDiv({ cls: 'lorebase-sync-operations' });
    const navigation = overview.createDiv({ cls: 'lorebase-sync-page-links' });
    const backLabel = { en: 'Back', ru: 'Назад', uk: 'Назад', 'zh-CN': '返回' }[i18n.getLanguage()];

    const addPage = (title: string, icon: string, description: string): HTMLElement => {
        const open = navigation.createEl('button', { cls: 'lorebase-sync-page-link', attr: { type: 'button', 'aria-description': description } });
        setIcon(open.createSpan({ cls: 'lorebase-sync-page-link-icon', attr: { 'aria-hidden': 'true' } }), icon);
        open.createSpan({ text: title });
        setIcon(open.createSpan({ cls: 'lorebase-sync-page-link-arrow', attr: { 'aria-hidden': 'true' } }), 'chevron-right');
        const page = workspace.createEl('section', { cls: 'lorebase-sync-config-page' });
        page.hidden = true;
        const header = page.createDiv({ cls: 'lorebase-sync-config-header' });
        const back = header.createEl('button', { cls: 'lorebase-sync-back', attr: { type: 'button' } });
        setIcon(back.createSpan({ attr: { 'aria-hidden': 'true' } }), 'arrow-left');
        back.createSpan({ text: backLabel });
        const heading = header.createDiv();
        heading.createEl('h4', { text: title });
        heading.createDiv({ cls: 'setting-item-description', text: description });
        const content = page.createDiv({ cls: 'lorebase-sync-config-body' });
        open.addEventListener('click', () => {
            overview.hidden = true;
            page.hidden = false;
            back.focus({ preventScroll: true });
            page.scrollIntoView({ block: 'nearest' });
        });
        back.addEventListener('click', () => {
            page.hidden = true;
            overview.hidden = false;
            open.focus({ preventScroll: true });
        });
        return content;
    };
    return { operations, navigation, addPage };
}

interface SyncOperation {
    label: string;
    icon: string;
    description: string;
    run: () => void | Promise<void>;
}

export function renderSyncOperations(container: HTMLElement, operations: readonly SyncOperation[]): void {
    const root = container.createDiv({ cls: 'lorebase-sync-direct-actions' });
    const buttons = operations.map(operation => {
        const button = root.createEl('button', {
            cls: 'lorebase-sync-operation',
            attr: { type: 'button', title: operation.description, 'aria-description': operation.description },
        });
        setIcon(button.createSpan({ cls: 'lorebase-sync-operation-icon', attr: { 'aria-hidden': 'true' } }), operation.icon);
        button.createSpan({ text: operation.label });
        button.addEventListener('click', handleAsyncAction(async () => {
            if (button.disabled) return;
            buttons.forEach(control => { control.disabled = true; });
            try { await operation.run(); }
            finally { buttons.forEach(control => { control.disabled = false; }); }
        }));
        return button;
    });
}

export function renderSyncButton(
    container: HTMLElement, icon: string, label: string, variant: 'primary' | 'secondary' | 'link' = 'secondary',
): HTMLButtonElement {
    const button = container.createEl('button', { cls: `lorebase-sync-button is-${variant}`, attr: { type: 'button' } });
    setIcon(button.createSpan({ attr: { 'aria-hidden': 'true' } }), icon);
    button.createSpan({ text: label });
    return button;
}

export function renderSyncStartup(
    container: HTMLElement, title: string, description: string, value: boolean, onChange: (value: boolean) => void,
): void {
    const row = container.createDiv({ cls: 'lorebase-sync-startup' });
    setIcon(row.createSpan({ cls: 'lorebase-sync-startup-icon', attr: { 'aria-hidden': 'true' } }), 'power');
    const copy = row.createDiv();
    copy.createEl('strong', { text: title });
    copy.createDiv({ cls: 'setting-item-description', text: description });
    renderMediaSwitch(row, title, value, next => { onChange(next); return true; });
}

export function renderSyncConnectionStatus(container: HTMLElement): (configured: boolean, label: string) => void {
    const status = container.createDiv({ cls: 'lorebase-sync-provider-status' });
    status.createSpan({ cls: 'lorebase-sync-provider-status-dot', attr: { 'aria-hidden': 'true' } });
    const text = status.createSpan();
    return (configured, label) => {
        status.toggleClass('is-configured', configured);
        text.textContent = label;
    };
}


export function renderSyncConnectionTest(
    container: HTMLElement,
    button: HTMLButtonElement,
    failure: string,
    test: () => Promise<{ message: string; metric?: { label: string; value: string }; warnings?: string[] }>,
): () => void {
    const result = container.createDiv({ cls: 'lorebase-sync-test-result', attr: { role: 'status' } });
    const pending = { en: 'Checking connection…', ru: 'Проверяем подключение…', uk: 'Перевіряємо підключення…', 'zh-CN': '正在检查连接…' }[i18n.getLanguage()];
    let revision = 0;
    const show = (
        state: 'pending' | 'success' | 'warning' | 'error', message: string,
        metric?: { label: string; value: string }, details: string[] = [],
    ): void => {
        result.empty();
        result.dataset.state = state;
        setIcon(result.createSpan({ cls: 'lorebase-sync-test-icon', attr: { 'aria-hidden': 'true' } }),
            { pending: 'loader-circle', success: 'circle-check', warning: 'triangle-alert', error: 'circle-x' }[state]);
        const copy = result.createDiv({ cls: 'lorebase-sync-test-copy' });
        copy.createEl('strong', { text: message });
        if (metric) {
            const item = copy.createEl('dl', { cls: 'lorebase-sync-test-metric' });
            item.createEl('dt', { text: metric.label });
            item.createEl('dd', { text: metric.value });
        }
        for (const detail of details) copy.createDiv({ cls: 'setting-item-description', text: detail });
    };
    button.addEventListener('click', handleAsyncAction(async () => {
        if (button.disabled) return;
        const request = ++revision;
        button.disabled = true;
        show('pending', pending);
        try {
            const { message, metric, warnings } = await test();
            if (request === revision) show(warnings?.length ? 'warning' : 'success', message, metric, warnings);
        } catch (error) {
            const details = error instanceof Error && error.message ? [error.message] : [];
            if (request === revision) show('error', failure, undefined, details);
        } finally {
            button.disabled = false;
        }
    }));
    return () => {
        revision++;
        result.empty();
        delete result.dataset.state;
    };
}
