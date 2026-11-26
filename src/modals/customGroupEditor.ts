import { setIcon } from 'obsidian';
import { t } from '../localization';
import { groupText as gt } from '../localization/groups';
import { CUSTOM_GROUP_COLORS, type CustomGroupDetails } from '../services/media/customGroups';
import type { CustomMediaGroup, MediaItem } from '../types';
import { renderCustomGroupCard } from './customGroupCard';
import { renderCustomGroupIcons } from './customGroupIcons';

let nextEditorId = 0;

export function renderCustomGroupEditor(parent: HTMLElement, options: {
    draft: CustomGroupDetails;
    group?: CustomMediaGroup;
    getItems: () => ReadonlyMap<string, MediaItem>;
    save: (details: CustomGroupDetails) => void;
    cancel: () => void;
}): { refreshPreview: () => void; focusName: () => void } {
    const { draft } = options;
    const prefix = `lorebase-group-editor-${++nextEditorId}`;
    const form = parent.createEl('form', { cls: 'lorebase-group-editor', attr: { novalidate: '' } });
    const body = form.createDiv({ cls: 'lorebase-group-editor-body' });
    const fields = body.createDiv({ cls: 'lorebase-group-editor-fields' });
    const field = (label: string, id: string, limit?: number): { root: HTMLElement; count: HTMLElement } => {
        const root = fields.createDiv({ cls: 'lorebase-group-field' });
        const header = root.createDiv({ cls: 'lorebase-group-field-heading' });
        header.createEl('label', { text: label, attr: { for: `${prefix}-${id}` } });
        const count = header.createSpan({ text: limit ? `0 / ${limit}` : '' });
        return { root, count };
    };
    const nameField = field(gt('name'), 'name', 80);
    const name = nameField.root.createEl('input', { cls: 'lorebase-group-name-input', attr: { id: `${prefix}-name`, name: 'name', type: 'text', maxlength: '80', placeholder: t('customGroupsNamePlaceholder'), required: '', autocomplete: 'off' } });
    name.value = draft.name;
    const error = nameField.root.createDiv({ cls: 'lorebase-group-field-error', text: gt('nameRequired'), attr: { role: 'alert' } });
    error.hidden = true;
    const descriptionField = field(`${gt('description')} · ${gt('optional')}`, 'description', 180);
    const description = descriptionField.root.createEl('textarea', { attr: { id: `${prefix}-description`, name: 'description', rows: '3', maxlength: '180', placeholder: gt('descriptionHint') } });
    description.value = draft.description;
    const icons = renderCustomGroupIcons(fields, () => draft.icon, icon => { draft.icon = icon; refreshPreview(); });
    const colorSection = fields.createDiv({ cls: 'lorebase-group-field' });
    const colorHeading = colorSection.createDiv({ cls: 'lorebase-group-field-heading' });
    colorHeading.createEl('strong', { text: gt('color') });
    const colorValue = colorHeading.createSpan();
    const colors = colorSection.createDiv({ cls: 'lorebase-group-color-options', attr: { role: 'group', 'aria-label': gt('color') } });
    for (const value of CUSTOM_GROUP_COLORS) {
        const button = colors.createEl('button', { attr: { type: 'button', 'data-color': value, 'aria-label': value, title: value, 'aria-pressed': String(draft.color === value) } });
        button.style.setProperty('--swatch-color', value);
        setIcon(button.createSpan({ attr: { 'aria-hidden': 'true' } }), 'check');
        button.addEventListener('click', () => { draft.color = value; refreshPreview(); });
    }
    const customSwatch = colors.createEl('label', { cls: 'lorebase-group-custom-color', attr: { title: gt('customColor') } });
    setIcon(customSwatch.createSpan({ attr: { 'aria-hidden': 'true' } }), 'pipette');
    const customColor = customSwatch.createEl('input', { attr: { type: 'color', value: draft.color, 'aria-label': gt('customColor') } });
    customColor.addEventListener('input', () => { draft.color = customColor.value; refreshPreview(); });
    const pinRow = fields.createDiv({ cls: 'lorebase-group-pin-row' });
    const pinCopy = pinRow.createDiv();
    pinCopy.createEl('strong', { text: gt('pinned') });
    pinCopy.createSpan({ text: gt('pinnedHint') });
    const pin = pinRow.createEl('button', { cls: 'lorebase-group-pin-switch', attr: { type: 'button', role: 'switch', 'aria-label': gt('pinned'), 'aria-checked': String(draft.pinned) } });
    pin.createSpan();
    pin.addEventListener('click', () => { draft.pinned = !draft.pinned; refreshPreview(); });

    const aside = body.createEl('aside', { cls: 'lorebase-group-editor-preview' });
    aside.createEl('strong', { cls: 'lorebase-group-field-label', text: gt('preview') });
    aside.createEl('p', { text: gt('previewHint') });
    const preview = renderCustomGroupCard(aside, { ...options.group, ...draft, id: options.group?.id ?? 'preview', itemPaths: options.group?.itemPaths ?? [], createdAt: 0, updatedAt: 0 }, options.getItems());
    aside.createEl('p', { cls: 'lorebase-group-preview-note', text: gt('anyMedia') });

    const footer = form.createDiv({ cls: 'lorebase-group-editor-footer' });
    const cancel = footer.createEl('button', { cls: 'lorebase-group-button', text: t('commonCancel'), attr: { type: 'button' } });
    cancel.addEventListener('click', options.cancel);
    const save = footer.createEl('button', { cls: 'lorebase-group-button is-primary', text: options.group ? t('editSave') : t('customGroupsCreate'), attr: { type: 'submit' } });
    const refreshPreview = (): void => {
        form.style.setProperty('--group-color', draft.color);
        nameField.count.textContent = `${draft.name.length} / 80`;
        descriptionField.count.textContent = `${draft.description.length} / 180`;
        colorValue.textContent = draft.color.toUpperCase();
        customColor.value = draft.color;
        icons.refresh();
        customSwatch.style.setProperty('--swatch-color', draft.color);
        customSwatch.classList.toggle('is-selected', !CUSTOM_GROUP_COLORS.some(color => color === draft.color));
        colors.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.color === draft.color)));
        pin.setAttribute('aria-checked', String(draft.pinned));
        preview.update({ ...options.group, ...draft, name: draft.name.trim() || gt('name'), id: options.group?.id ?? 'preview', itemPaths: options.group?.itemPaths ?? [], createdAt: 0, updatedAt: 0 }, options.getItems());
    };
    name.addEventListener('input', () => {
        draft.name = name.value;
        name.removeAttribute('aria-invalid');
        error.hidden = true;
        refreshPreview();
    });
    description.addEventListener('input', () => { draft.description = description.value; refreshPreview(); });
    form.addEventListener('submit', event => {
        event.preventDefault();
        if (!draft.name.trim()) {
            error.hidden = false;
            name.setAttribute('aria-invalid', 'true');
            name.focus();
            return;
        }
        options.save({ ...draft, name: draft.name.trim(), description: draft.description.trim() });
    });
    form.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!icons.closePicker()) options.cancel(); }
        else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); save.click(); }
    });
    refreshPreview();
    return { refreshPreview, focusName: () => name.focus() };
}
