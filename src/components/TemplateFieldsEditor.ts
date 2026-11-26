import { setIcon } from 'obsidian';
import { i18n } from '../localization';

export interface TemplateEditorField {
    key: string;
    name: string;
    property: string;
    description: string;
    canWikilink?: boolean;
}

export function renderTemplateFieldsEditor(container: HTMLElement, options: {
    fields: TemplateEditorField[];
    selected: Set<string>;
    defaultOrder: string[];
    wikilinks?: { fields: Set<string>; onChange: (fields: Set<string>) => void };
    onChange: (keys: string[], selected: Set<string>) => void;
}): void {
    const ru = i18n.getLanguage() === 'ru', uk = i18n.getLanguage() === 'uk';
    const copy = ru ? { search: 'Найти поле…', all: 'Включить все', reset: 'По шаблону', field: 'Поле', property: 'Свойство YAML', on: 'Вкл.', empty: 'Поля не найдены', hint: 'Выберите поле, чтобы узнать его назначение.', move: 'Переместить', enabled: 'Включено' }
        : uk ? { search: 'Знайти поле…', all: 'Увімкнути всі', reset: 'За шаблоном', field: 'Поле', property: 'Властивість YAML', on: 'Увімк.', empty: 'Поля не знайдено', hint: 'Виберіть поле, щоб дізнатися його призначення.', move: 'Перемістити', enabled: 'Увімкнено' }
            : { search: 'Find a field…', all: 'Enable all', reset: 'Template order', field: 'Field', property: 'YAML property', on: 'On', empty: 'No matching fields', hint: 'Select a field to see what it does.', move: 'Move', enabled: 'Enabled' };
    const wikilinkLabel = {
        en: 'Write values as links to Obsidian notes',
        ru: 'Записывать значения как ссылки на заметки Obsidian',
        uk: 'Записувати значення як посилання на нотатки Obsidian',
        'zh-CN': '将值写成 Obsidian 笔记链接',
    }[i18n.getLanguage()];
    const linkStates = { en: ['On', 'Off'], ru: ['Вкл.', 'Выкл.'], uk: ['Увімк.', 'Вимк.'], 'zh-CN': ['开', '关'] }[i18n.getLanguage()];
    const inclusionLabel = { en: 'Include field', ru: 'В шаблоне', uk: 'У шаблоні', 'zh-CN': '包含字段' }[i18n.getLanguage()];
    const showLinks = Boolean(options.wikilinks) && options.fields.some(field => field.canWikilink);
    let keys = options.fields.map(field => field.key);
    const selected = options.selected;
    const fields = new Map(options.fields.map(field => [field.key, field]));
    const root = container.createDiv({ cls: 'lorebase-template-editor' + (showLinks ? ' has-wikilinks' : '') });
    const toolbar = root.createDiv({ cls: 'lorebase-template-editor-toolbar' });
    const search = toolbar.createEl('input', { attr: { type: 'search', placeholder: copy.search, 'aria-label': copy.search } });
    const count = toolbar.createSpan({ cls: 'lorebase-template-editor-count', attr: { 'aria-live': 'polite', title: copy.enabled } });
    const actions = toolbar.createDiv({ cls: 'lorebase-template-editor-actions' });
    const all = actions.createEl('button', { text: copy.all, attr: { type: 'button' } });
    const reset = actions.createEl('button', { text: copy.reset, attr: { type: 'button' } });
    const header = root.createDiv({ cls: 'lorebase-template-editor-columns', attr: { 'aria-hidden': 'true' } });
    header.createSpan(); header.createSpan({ text: copy.field }); header.createSpan({ text: copy.property });
    if (showLinks) header.createSpan({ text: 'Wikilink' });
    header.createSpan({ text: showLinks ? inclusionLabel : copy.on, attr: { title: inclusionLabel } });
    const list = root.createDiv({ cls: 'lorebase-template-editor-list' });
    const empty = root.createDiv({ cls: 'lorebase-template-editor-empty', text: copy.empty });
    const help = root.createDiv({ cls: 'lorebase-template-editor-help', attr: { 'aria-live': 'polite' } });
    help.hidden = true;
    let inspected = '';
    let dragging: string | null = null;
    const updateCount = (): void => {
        count.textContent = `${selected.size} / ${keys.length}`;
        all.disabled = selected.size === keys.length;
    };
    const save = (): void => { updateCount(); options.onChange(keys, selected); };
    const inspect = (field: TemplateEditorField): void => {
        inspected = field.key;
        help.hidden = false;
        help.replaceChildren();
        help.createEl('strong', { text: field.name });
        help.createEl('code', { text: field.property });
        help.createDiv({ text: field.description });
        if (field.canWikilink) help.createDiv({ text: wikilinkLabel });
        list.querySelectorAll<HTMLElement>('[data-field]').forEach(row => row.classList.toggle('is-inspected', row.dataset.field === inspected));
    };
    const move = (key: string, target: string): void => {
        const from = keys.indexOf(key), to = keys.indexOf(target);
        if (from < 0 || to < 0 || from === to) return;
        keys.splice(from, 1); keys.splice(to, 0, key);
        render(); save();
    };
    const render = (): void => {
        list.replaceChildren();
        const query = search.value.trim().toLocaleLowerCase();
        let visible = 0;
        for (const key of keys) {
            const field = fields.get(key)!;
            if (query && !`${field.name} ${field.property} ${field.description}`.toLocaleLowerCase().includes(query)) continue;
            visible++;
            const row = list.createDiv({ cls: 'lorebase-template-editor-row', attr: { 'data-field': key } });
            row.classList.toggle('is-inspected', inspected === key);
            row.draggable = true;
            const grip = row.createEl('button', { cls: 'lorebase-template-editor-grip', attr: { type: 'button', 'aria-label': `${copy.move}: ${field.name}`, 'aria-keyshortcuts': 'Alt+ArrowUp Alt+ArrowDown' } });
            setIcon(grip, 'grip-vertical');
            grip.addEventListener('keydown', event => {
                if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
                event.preventDefault();
                const index = keys.indexOf(key) + (event.key === 'ArrowUp' ? -1 : 1);
                if (keys[index]) { move(key, keys[index]); list.querySelector<HTMLButtonElement>(`[data-field="${key}"] .lorebase-template-editor-grip`)?.focus(); }
            });
            const name = row.createEl('button', { cls: 'lorebase-template-editor-name', text: field.name, attr: { type: 'button' } });
            name.addEventListener('click', () => inspect(field));
            const property = row.createDiv({ cls: 'lorebase-template-editor-property-cell' });
            property.createEl('code', { cls: 'lorebase-template-editor-property', text: field.property });
            const linkButton = showLinks && field.canWikilink ? row.createEl('button', {
                cls: 'lorebase-template-editor-wikilink',
                attr: { type: 'button', title: wikilinkLabel, 'aria-label': `Wikilink: ${field.name}` },
            }) : null;
            if (linkButton) {
                const preferences = options.wikilinks!;
                const paint = (): void => {
                    const enabled = preferences.fields.has(key);
                    linkButton.textContent = linkStates[enabled ? 0 : 1];
                    linkButton.setAttribute('aria-pressed', String(enabled));
                };
                paint();
                linkButton.disabled = !selected.has(key);
                linkButton.addEventListener('click', () => {
                    if (preferences.fields.has(key)) preferences.fields.delete(key);
                    else preferences.fields.add(key);
                    paint();
                    preferences.onChange(new Set(preferences.fields));
                });
            } else if (showLinks) row.createSpan({ cls: 'lorebase-template-editor-no-link', text: '—', attr: { 'aria-hidden': 'true' } });
            const check = row.createEl('label', { cls: 'lorebase-template-editor-check' });
            const toggle = check.createEl('input', { attr: { type: 'checkbox', 'aria-label': `${inclusionLabel}: ${field.name}` } });
            const mark = check.createSpan({ cls: 'lorebase-template-editor-check-mark', attr: { 'aria-hidden': 'true' } });
            setIcon(mark, 'check');
            toggle.checked = selected.has(key);
            toggle.addEventListener('change', () => {
                if (toggle.checked) selected.add(key);
                else selected.delete(key);
                if (linkButton) linkButton.disabled = !toggle.checked;
                save();
            });
            row.addEventListener('dragstart', event => { dragging = key; row.classList.add('is-dragging'); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; });
            row.addEventListener('dragover', event => { if (dragging && dragging !== key) { event.preventDefault(); row.classList.add('is-drag-over'); } });
            row.addEventListener('dragleave', () => row.classList.remove('is-drag-over'));
            row.addEventListener('drop', event => { event.preventDefault(); if (dragging) move(dragging, key); dragging = null; });
            row.addEventListener('dragend', () => { dragging = null; list.querySelectorAll('.is-dragging, .is-drag-over').forEach(item => item.classList.remove('is-dragging', 'is-drag-over')); });
        }
        empty.hidden = visible > 0;
        updateCount();
    };
    search.addEventListener('input', render);
    all.addEventListener('click', () => { keys.forEach(key => selected.add(key)); render(); save(); });
    reset.addEventListener('click', () => { keys = [...options.defaultOrder.filter(key => fields.has(key)), ...keys.filter(key => !options.defaultOrder.includes(key))]; render(); save(); });
    render();
}
