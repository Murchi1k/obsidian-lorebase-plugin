import { setIcon } from 'obsidian';
import { readRootYamlKey } from '../../services/integrations/templateSchema';
import { TEMPLATE_VALUE_PATTERN } from '../../services/integrations/templateValues';
import { templateCopy } from './templateFieldHelp';

function renderDisclosure(container: HTMLElement, title: string, icon: string, badge: string): HTMLElement {
    const details = container.createEl('details', { cls: 'lorebase-template-disclosure' });
    const summary = details.createEl('summary');
    setIcon(summary.createSpan({ cls: 'lorebase-template-tool-icon', attr: { 'aria-hidden': 'true' } }), icon);
    summary.createSpan({ text: title, cls: 'lorebase-template-tool-title' });
    summary.createSpan({ text: badge, cls: 'lorebase-template-tool-badge', attr: { 'aria-hidden': 'true' } });
    setIcon(summary.createSpan({ cls: 'lorebase-template-tool-chevron', attr: { 'aria-hidden': 'true' } }), 'chevron-down');
    return details.createDiv({ cls: 'lorebase-template-tool-body' });
}

function renderYaml(code: HTMLElement, yaml: string): void {
    code.replaceChildren();
    yaml.split('\n').forEach((line, index) => {
        if (index) code.append('\n');
        const property = line.match(/^("(?:[^"\\]|\\.)+"|'(?:[^']|'')+'|[^\s:#][^:]*)(?=:)/)?.[0] ?? '';
        if (property) code.createSpan({ cls: 'lorebase-template-yaml-key', text: property });
        const value = line.slice(property.length);
        let start = 0;
        for (const token of value.matchAll(TEMPLATE_VALUE_PATTERN)) {
            code.append(value.slice(start, token.index));
            code.createSpan({ cls: 'lorebase-template-yaml-token', text: token[0] });
            start = token.index + token[0].length;
        }
        code.append(value.slice(start));
    });
}

export function renderTemplatePreview(container: HTMLElement, initial: string): (yaml: string) => void {
    const body = renderDisclosure(container, templateCopy('yamlPreview'), 'file-code', 'YAML');
    const code = body.createEl('pre', { cls: 'lorebase-template-preview-code', attr: { tabindex: '0', 'aria-label': templateCopy('yamlPreview') } }).createEl('code');
    renderYaml(code, initial);
    return yaml => renderYaml(code, yaml);
}

export function renderTemplateCodeEditor(container: HTMLElement, label: string, initial: string) {
    const workspace = container.createDiv({ cls: 'lorebase-template-workspace' });
    const header = workspace.createDiv({ cls: 'lorebase-template-file-header' });
    const filename = header.createDiv({ cls: 'lorebase-template-file-name' });
    setIcon(filename.createSpan({ attr: { 'aria-hidden': 'true' } }), 'file-code');
    filename.createSpan({ text: 'template.md' });
    const pane = workspace.createDiv({ cls: 'lorebase-template-code-pane' });
    const gutter = pane.createEl('pre', { cls: 'lorebase-template-gutter', attr: { 'aria-hidden': 'true' } });
    const editor = pane.createEl('textarea', {
        cls: 'lorebase-template-code',
        attr: { rows: '15', wrap: 'off', spellcheck: 'false', 'aria-label': label },
    });
    editor.value = initial;
    const syncScroll = (): void => { gutter.scrollTop = editor.scrollTop; };
    const syncLines = (): void => {
        const total = editor.value.split('\n').length;
        gutter.textContent = Array.from({ length: total }, (_, index) => index + 1).join('\n');
        syncScroll();
    };
    editor.addEventListener('scroll', syncScroll);
    editor.addEventListener('input', syncLines);
    syncLines();
    const hint = workspace.createDiv({ cls: 'lorebase-template-field-hint' });
    const footer = workspace.createDiv({ cls: 'lorebase-template-actions' });
    return { editor, hint, footer, syncLines };
}

interface ReferenceField {
    name: string;
    description: string;
    yaml: string;
}

const delimiter = /^\uFEFF?---[ \t]*$/;

const templateHintPattern = new RegExp(TEMPLATE_VALUE_PATTERN.source, 'gi');

function templateTokens(line: string): string[] {
    if (line.trimStart().startsWith('#')) return [];
    return Array.from(line.matchAll(templateHintPattern), match => match[1].toLowerCase());
}

export function findTemplatePropertyAtCursor(value: string, cursor: number): { key: string; tokens: string[] } | undefined {
    const lines = value.split(/\r?\n/);
    if (!delimiter.test(lines[0])) return;
    const closingLine = lines.findIndex((line, index) => index > 0 && delimiter.test(line));
    const line = value.slice(0, cursor).split('\n').length - 1;
    if (line === 0 || closingLine !== -1 && line >= closingLine || !lines[line].trim() || lines[line].trimStart().startsWith('#')) return;

    let rootLine = line;
    let key = readRootYamlKey(lines[rootLine]);
    while (!key && rootLine > 1) key = readRootYamlKey(lines[--rootLine]);
    if (!key) return;

    const tokens = templateTokens(lines[rootLine]);
    const end = closingLine < 0 ? lines.length : closingLine;
    for (let index = rootLine + 1; index < end && !readRootYamlKey(lines[index]); index++) {
        tokens.push(...templateTokens(lines[index]));
    }
    return { key, tokens };
}

export function renderTemplateFieldHint(
    host: HTMLElement,
    editor: HTMLTextAreaElement,
    fields: ReferenceField[],
    linkableFields: Record<string, string>,
): () => void {
    const linkTokens = new Set([...Object.keys(linkableFields), ...Object.values(linkableFields)]);
    setIcon(host.createSpan({ cls: 'lorebase-template-hint-icon', attr: { 'aria-hidden': 'true' } }), 'info');
    const text = host.createDiv({ cls: 'lorebase-template-hint-text' });
    const byKey = new Map<string, ReferenceField>();
    const byToken = new Map<string, ReferenceField>();
    for (const field of fields) {
        for (const line of field.yaml.split('\n')) {
            const key = readRootYamlKey(line);
            if (key) byKey.set(key, field);
            for (const token of templateTokens(line)) byToken.set(token, field);
        }
    }

    let previous: string | undefined;
    const update = (): void => {
        const property = findTemplatePropertyAtCursor(editor.value, editor.selectionStart);
        const field = property && (property.tokens.map(token => byToken.get(token)).find(Boolean) ?? byKey.get(property.key));
        const linkToken = property?.tokens.find(token => linkTokens.has(token));
        const identity = JSON.stringify([property?.key, field?.name, field?.description, linkToken]);
        if (identity === previous) return;
        previous = identity;
        text.empty();
        if (!property) {
            text.setText(templateCopy('fieldHint'));
            return;
        }
        if (field) text.createEl('strong', { text: field.name });
        text.createEl('code', { text: property.key });
        if (field?.description) text.createDiv({ text: field.description });
        if (linkToken) {
            const links = text.createDiv({ cls: 'lorebase-template-wikilink-hint' });
            links.createSpan({ text: templateCopy('wikilinkHint') });
            links.createEl('code', { text: `{{VALUE:${linkToken}|wikilink}}` });
        }
    };
    for (const event of ['input', 'selectionchange', 'keyup', 'click', 'select', 'focus']) {
        editor.addEventListener(event, update);
    }
    update();
    return update;
}
