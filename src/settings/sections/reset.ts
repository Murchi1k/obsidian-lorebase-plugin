import { Notice, setIcon } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../constants';
import { t } from '../../localization';
import type { SettingsSectionContext } from './types';

export function renderResetSettings(context: SettingsSectionContext, container: HTMLElement): void {
    const block = container.createDiv({ cls: 'lorebase-settings-reset' });
    const heading = block.createEl('h3', { text: t('settingsDefaults') });
    const trigger = block.createEl('button', {
        cls: 'lorebase-reset-trigger',
        attr: { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'lorebase-settings-reset-confirm' },
    });
    setIcon(trigger.createSpan({ attr: { 'aria-hidden': 'true' } }), 'rotate-ccw');
    trigger.createSpan({ text: t('settingsReset') });

    const confirmPanel = block.createDiv({
        cls: 'lorebase-settings-reset-confirm', attr: { id: 'lorebase-settings-reset-confirm' },
    });
    confirmPanel.hidden = true;
    const warning = confirmPanel.createDiv({ cls: 'lorebase-settings-reset-warning', attr: { role: 'status' } });
    setIcon(warning.createSpan({ attr: { 'aria-hidden': 'true' } }), 'triangle-alert');
    warning.createSpan({ text: t('resetSubtitle') });
    const actions = confirmPanel.createDiv({ cls: 'lorebase-settings-reset-actions' });
    const cancel = actions.createEl('button', { text: t('deleteCancel'), attr: { type: 'button' } });
    const confirm = actions.createEl('button', {
        cls: 'lorebase-reset-confirm-button', attr: { type: 'button' },
    });
    setIcon(confirm.createSpan({ attr: { 'aria-hidden': 'true' } }), 'rotate-ccw');
    confirm.createSpan({ text: t('resetConfirm') });
    const close = (): void => {
        confirmPanel.hidden = true;
        heading.hidden = trigger.hidden = false;
        trigger.setAttribute('aria-expanded', 'false');
        block.classList.remove('is-confirming');
        trigger.focus();
    };
    trigger.addEventListener('click', () => {
        confirmPanel.hidden = false;
        heading.hidden = trigger.hidden = true;
        trigger.setAttribute('aria-expanded', 'true');
        block.classList.add('is-confirming');
        cancel.focus({ preventScroll: true });
        confirmPanel.scrollIntoView({ block: 'nearest' });
    });
    cancel.addEventListener('click', close);
    confirmPanel.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || cancel.disabled) return;
        event.stopPropagation();
        close();
    });
    confirm.addEventListener('click', async () => {
        if (confirm.disabled) return;
        confirm.disabled = cancel.disabled = true;
        const previous = context.plugin.settings;
        context.plugin.settings = structuredClone(DEFAULT_SETTINGS);
        try {
            await context.plugin.saveSettings();
        } catch (error) {
            context.plugin.settings = previous;
            console.error('LOREBASE: unable to reset settings', error);
            new Notice(t('settingsResetFailed'));
            confirm.disabled = cancel.disabled = false;
            return;
        }
        context.plugin.refreshViews();
        const settings = container.closest('.lorebase-settings');
        context.display();
        settings?.querySelector<HTMLButtonElement>('.lorebase-reset-trigger')?.focus();
    });
}
