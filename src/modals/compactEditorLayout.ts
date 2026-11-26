import { setIcon } from 'obsidian';
import { focusNotesContent } from '../components/NotesReader';
import { i18n, t } from '../localization';
import { compactGameText } from '../localization/compactGameEditor';

export function buildEditorHeaderActions(compact: boolean): string {
    return `
        <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-ghost" data-action="discard">${t('editCancel')}</button>
        <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-primary" data-action="save"${compact ? ` aria-label="${t('editSave')}" title="${t('editSave')}"` : ''}>${compact ? `<span data-icon="check" aria-hidden="true"></span><span>${t('editSave')}</span>` : t('editSave')}</button>
        <button type="button" class="lorebase-editmode-icon-btn" data-action="overflow" aria-label="${t('editOverflow')}"${compact ? ' aria-haspopup="menu"' : ''}>${compact ? '<span data-icon="ellipsis" aria-hidden="true"></span>' : '...'}</button>
        ${compact ? `<button type="button" class="lorebase-editmode-icon-btn lorebase-game-close" data-action="close" aria-label="${compactGameText('closeEditor')}" title="${compactGameText('closeEditor')}"><span data-icon="x" aria-hidden="true"></span></button>` : ''}`;
}

export function buildCompactCoverIdentity(extra = ''): string {
    return `<div class="lorebase-game-cover-identity">
        <div class="lorebase-game-cover-title-row">
            <input class="lorebase-game-cover-title" data-field="title" type="text" aria-label="${t('templateFieldName')}" title="${compactGameText('editCoverTitle')}" />
            <button type="button" class="lorebase-game-cover-pencil" data-action="edit-cover-title" aria-label="${compactGameText('editCoverTitle')}" title="${compactGameText('editCoverTitle')}"><span data-icon="pencil" aria-hidden="true"></span></button>
        </div>
        ${extra}
        <input class="lorebase-game-cover-year" data-field="year" type="number" inputmode="numeric" placeholder="${t('year')}" aria-label="${t('year')}" />
        <button type="button" class="lorebase-game-cover-notes" data-action="toggle-notes" aria-expanded="false" aria-label="${compactGameText('descriptionNotes')}" title="${compactGameText('descriptionNotes')}"><span data-icon="notebook-pen" aria-hidden="true"></span><span>${compactGameText('notesShort')}</span></button>
    </div>`;
}

export function buildCompactWorkTypeBadge(): string {
    return `<div class="lorebase-classification-panel lorebase-game-cover-type" data-role="cover-work-type" role="group" aria-label="${t('templateFieldWorkType')}">
        <div class="lorebase-editmode-dropdown" data-field="work-type"></div>
    </div>`;
}

export function buildSummaryNotesPanel(compact: boolean): string {
    return `<section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-notes is-collapsed${compact ? ' lorebase-editmode-game-notes' : ''}" data-component="NotesEditor"${compact ? ' data-mobile-pane="general"' : ''}>
        <div class="lorebase-editmode-panel-title-row">
            <h3 class="lorebase-editmode-panel-title" data-role="notes-title">${compact ? compactGameText('descriptionNotes') : t('editDescription')}</h3>
            <div class="lorebase-editmode-note-tabs" role="tablist">
                <button type="button" class="lorebase-editmode-note-tab is-active" data-mode="description">${t('editDescription')}</button>
                <button type="button" class="lorebase-editmode-note-tab" data-mode="myNotes">${compact ? compactGameText('myNotes') : t('editMyNotes')}</button>
            </div>
        </div>
        <div class="lorebase-editmode-notes-shell"><textarea class="lorebase-editmode-notes-input" data-field="summary" rows="9"></textarea></div>
        <div class="lorebase-editmode-notes-footer">
            <span class="lorebase-editmode-saved-indicator" data-role="saved-indicator">${t('editSaved')}</span>
            <span class="lorebase-editmode-char-count" data-role="char-count">0 ${t('editCharsShort')}</span>
        </div>
    </section>`;
}

export function focusSummaryNotes(root: HTMLElement, compact: boolean): void {
    window.setTimeout(() => {
        focusNotesContent(root, compact);
        if (compact) {
            root.querySelector<HTMLElement>('[data-component="NotesEditor"]')?.scrollIntoView({ block: 'nearest' });
        }
    }, 0);
}

export function formatCompactEditorRating(rating: number | null, max: number): string {
    if (rating === null) return '—';
    const value = new Intl.NumberFormat(i18n.getLocale(), { maximumFractionDigits: 1 }).format(rating);
    return rating > max ? value : `${value} / ${max}`;
}

export function bindCompactEditorChrome(root: HTMLElement, modal: HTMLElement, close: () => void): void {
    root.classList.add('lorebase-compact-editor');
    modal.querySelectorAll(':scope > :is(.modal-header-button, .modal-close-button)').forEach(button => button.remove());
    // Keep the cover near its desktop reference size across Obsidian zoom levels.
    const scale = Math.max(1, root.ownerDocument.defaultView?.devicePixelRatio ?? 1);
    root.style.setProperty('--lorebase-game-cover-width', `${Math.max(260, 341 / scale)}px`);
    root.querySelectorAll<HTMLElement>('.lorebase-editmode-header [data-icon], .lorebase-game-cover-identity [data-icon], .lorebase-game-quick-actions [data-icon]')
        .forEach(icon => setIcon(icon, icon.dataset.icon!));
    root.querySelector('[data-action="close"]')?.addEventListener('click', close);
    root.querySelector('[data-action="edit-cover-title"]')?.addEventListener('click', () => {
        root.querySelector<HTMLInputElement>('[data-field="title"]')?.focus();
    });
}

export function buildCompactQuickSettings(buttons: Array<{ key: string; label: string; icon?: string; hint?: string }>): string {
    return `<div class="lorebase-game-quick-actions" style="--quick-columns: ${buttons.length}">${buttons.map(({ key, label, icon, hint }) => `
        <button type="button" class="lorebase-editmode-icon-btn" data-toggle="${key}" aria-pressed="false" aria-label="${label}" title="${hint ? `${label} · ${hint}` : label}">
            ${icon ? `<span data-icon="${icon}" aria-hidden="true"></span>` : '<span aria-hidden="true">18+</span>'}
        </button>`).join('')}</div>`;
}

export function buildEditorTimestampRows(): string {
    return `<div class="lorebase-editmode-kv-list lorebase-game-timestamp-rows">
        <div class="lorebase-editmode-kv-row"><span class="lorebase-editmode-kv-key">${t('editAdded')}</span><span class="lorebase-editmode-kv-val" data-role="ts-added">-</span></div>
        <div class="lorebase-editmode-kv-row"><span class="lorebase-editmode-kv-key">${t('editUpdated')}</span><span class="lorebase-editmode-kv-val" data-role="ts-updated">-</span></div>
    </div>`;
}
