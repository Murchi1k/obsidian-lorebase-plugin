import { setIcon } from 'obsidian';
import { t } from '../localization';
import type { MediaType, MediaStatus } from '../types';
import { getStatusOptionsForMediaType } from '../views/library/viewOptions';
import { getStatusAppearance } from '../statusPresentation';
import { syncStatusReason } from './StatusReasonField';

const controls = new WeakMap<HTMLElement, { buttons: Map<string, HTMLButtonElement>; host: HTMLElement; media: MediaType }>();

/** Familiar status buttons and rating controls share a compact panel. */
export function bindTrackingStatus<T extends MediaStatus>(root: HTMLElement, media: MediaType, selected: T, onChange: (value: T) => void): void {
    const panel = root.querySelector<HTMLElement>('.lorebase-editmode-status-rating');
    const shell = panel?.querySelector<HTMLElement>('.lorebase-editmode-status-shell');
    const host = shell?.querySelector<HTMLElement>('.lorebase-editmode-segmented');
    const rating = panel?.querySelector<HTMLElement>('.lorebase-editmode-rating-wrap');
    if (!panel || !shell || !host || !rating) return;
    panel.classList.add('lorebase-compact-tracking');
    panel.setAttribute('aria-label', t('editTracking'));
    const primary = panel.querySelector<HTMLElement>('.lorebase-tracking-primary') ?? panel.createDiv({ cls: 'lorebase-tracking-primary' });
    primary.append(shell, rating);
    if (!shell.querySelector('.lorebase-tracking-caption')) {
        const caption = shell.createSpan({ cls: 'lorebase-tracking-caption', text: t('editStatus') });
        shell.prepend(caption);
    }
    host.empty();
    host.setAttribute('role', 'group');
    host.setAttribute('aria-label', t('editStatus'));
    host.classList.add('lorebase-tracking-status');
    const buttons = new Map<string, HTMLButtonElement>();
    for (const option of getStatusOptionsForMediaType(media).filter(option => option.status !== 'wishlist' && option.status !== 'to_be_released')) {
        const appearance = getStatusAppearance(media, option.status);
        const button = host.createEl('button', { cls: 'lorebase-editmode-segment', attr: { type: 'button', 'data-status': option.status } });
        setIcon(button.createSpan({ cls: 'lorebase-editmode-segment-icon', attr: { 'aria-hidden': 'true' } }), appearance.icon);
        button.createSpan({ cls: 'lorebase-editmode-segment-label', text: option.label });
        button.style.setProperty('--lorebase-status-color', appearance.color);
        button.addEventListener('click', () => onChange(option.status as T));
        buttons.set(option.status, button);
    }
    controls.set(root, { buttons, host, media });
    syncTrackingStatus(root, selected);
}

export function syncTrackingStatus(root: HTMLElement, selected: MediaStatus): void {
    syncStatusReason(root,selected);
    const control = controls.get(root);
    if (!control) return;
    for (const [status, button] of control.buttons) {
        const active = status === selected;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
        button.disabled = selected === 'wishlist';
    }
    const label = getStatusOptionsForMediaType(control.media).find(option => option.status === selected)?.label ?? selected;
    control.host.setAttribute('aria-label', t('editStatus') + ': ' + label);
}

let trackingDisclosureId = 0;

/** The disclosure toolbar stays in place while its panels expand below it. */
export function finishTrackingPanel(root: HTMLElement): void {
    const panel = root.querySelector<HTMLElement>('.lorebase-compact-tracking');
    if (!panel || panel.querySelector('.lorebase-tracking-secondary')) return;
    const advanced = panel.querySelector<HTMLDetailsElement>('.lorebase-detailed-rating');
    const dates = panel.querySelector<HTMLElement>('.lorebase-editmode-play-dates');
    const footer = panel.createDiv({ cls: 'lorebase-tracking-secondary' });
    const toolbar = footer.createDiv({ cls: 'lorebase-tracking-tools' });
    const toggles = new Map<HTMLDetailsElement, HTMLButtonElement>();
    const attach = (details: HTMLDetailsElement, action: string): void => {
        const summary = details.querySelector<HTMLElement>(':scope > summary')!;
        const button = toolbar.createEl('button', { cls: 'lorebase-tracking-tool', attr: { type: 'button', 'data-action': action } });
        button.append(...Array.from(summary.childNodes));
        let caret = button.querySelector<HTMLElement>('.lorebase-detailed-rating-chevron');
        if (!caret) { caret = button.createSpan({ attr: { 'aria-hidden': 'true' } }); setIcon(caret, 'chevron-down'); }
        caret.classList.add('lorebase-tracking-tool-caret');
        summary.hidden = true;
        details.id = 'lorebase-tracking-panel-' + ++trackingDisclosureId;
        button.id = details.id + '-toggle';
        button.setAttribute('aria-controls', details.id);
        details.setAttribute('aria-labelledby', button.id);
        const sync = (): void => {
            button.setAttribute('aria-expanded', String(details.open));
            details.hidden = !details.open;
        };
        button.addEventListener('click', () => { details.open = !details.open; sync(); });
        details.addEventListener('toggle', sync);
        toggles.set(details, button);
        sync();
        footer.append(details);
    };
    if (advanced) attach(advanced, 'toggle-detailed-rating');
    if (dates) {
        const disclosure = footer.createEl('details', { cls: 'lorebase-tracking-dates' });
        const summary = disclosure.createEl('summary');
        setIcon(summary.createSpan({ attr: { 'aria-hidden': 'true' } }), 'calendar-days');
        summary.createSpan({ text: t('editDates') });
        disclosure.append(dates);
        attach(disclosure, 'toggle-tracking-dates');
    }
    footer.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const target = event.target as HTMLElement;
        const disclosure = target.closest<HTMLDetailsElement>('details[open]')
            ?? [...toggles].find(([, button]) => button.contains(target))?.[0];
        if (!disclosure?.open || !toggles.has(disclosure)) return;
        event.preventDefault(); event.stopPropagation(); disclosure.open = false; disclosure.hidden = true;
        const button = toggles.get(disclosure)!;
        button.setAttribute('aria-expanded', 'false'); button.focus();
    });
}
