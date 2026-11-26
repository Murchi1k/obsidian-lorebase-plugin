// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/constants';
import { i18n } from '../src/localization';
import { renderGlobalTemplateWikilinks } from '../src/settings/sections/templateWikilinks';
import { getAllTemplateWikilinksState, setAllTemplateWikilinks, setTemplateWikilinkFields, updateTemplateWikilinks } from '../src/services/integrations/templateWikilinks';
import { buildDefaultAdvancedTemplate, switchTemplateMode, TEMPLATE_MEDIA_TYPES } from '../src/services/integrations/templatePreferences';
import { getSimpleWikilinkTokens, renderTemplate } from '../src/services/integrations/templateUtils';
import type { LorebaseSettings } from '../src/types';
import type { TemplateKind } from '../src/services/integrations/types';
import { installStatisticsDom } from './helpers/statisticsDom';
import { renderTemplatesSection } from '../src/settings/sections/integrations';
import type { SettingsSectionContext } from '../src/settings/sections/types';

beforeAll(() => {
    installStatisticsDom();
    HTMLElement.prototype.setText = function (text: string) { this.textContent = text; };
});
afterEach(() => document.body.replaceChildren());
const kinds = Object.keys(TEMPLATE_MEDIA_TYPES) as TemplateKind[];
const configFor = (settings: LorebaseSettings, kind: TemplateKind) => kind === 'music' ? settings.music.noteTemplate! : settings.integrations.media[kind];

describe('global template Wikilinks', () => {
    it.each(kinds)('switches every supported %s field without enabling excluded properties or changing other preferences', kind => {
        const settings = structuredClone(DEFAULT_SETTINGS), config = configFor(settings, kind);
        config.templateEnabled = false;
        config.templateFields = ['genres'];
        config.fieldAliases = { genres: 'My genres' };
        const fields = [...config.templateFields];
        setAllTemplateWikilinks(settings, false);
        expect(getAllTemplateWikilinksState(settings)).toBe('off');
        expect(config.wikilinkFields).toEqual([]);
        expect(config.template).toContain('"My genres":');
        expect(config.template).toContain('{{VALUE:genres}}');
        expect(renderTemplate(config.template, { genres: ['Rock'] })).not.toContain('[[Rock]]');
        setAllTemplateWikilinks(settings, true);
        expect(getAllTemplateWikilinksState(settings)).toBe('on');
        expect(config.wikilinkFields).toEqual(Object.keys(getSimpleWikilinkTokens(kind)));
        expect(config.template).toContain('{{VALUE:genres|wikilink}}');
        expect(renderTemplate(config.template, { genres: ['Rock'] })).toContain('[[Rock]]');
        expect(config.templateEnabled).toBe(false);
        expect(config.templateFields).toEqual(fields);
        expect(config.fieldAliases).toEqual({ genres: 'My genres' });
    });

    it('updates active and saved advanced templates, keeping custom names, values, body and mode', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        for (const [index, kind] of kinds.entries()) {
            const config = configFor(settings, kind);
            config.templateMode = index % 2 ? 'advanced' : 'simple';
            config.advancedTemplate = '---\n"Custom genres": "{{VALUE:genres|wikilink}}"\nyear: {{VALUE:Year}}\ncustom: keep\n---\n\n# My body\n[[Hand-written link]]';
            if (config.templateMode === 'advanced') config.template = config.advancedTemplate;
        }
        setAllTemplateWikilinks(settings, false);
        for (const kind of kinds) {
            const config = configFor(settings, kind);
            expect(config.advancedTemplate).toContain('"Custom genres": "{{VALUE:genres}}"');
            expect(config.advancedTemplate).toContain('year: {{VALUE:Year}}\ncustom: keep');
            expect(config.advancedTemplate).toContain('# My body\n[[Hand-written link]]');
            switchTemplateMode(kind, config, 'advanced');
            expect(config.template).not.toContain('|wikilink');
        }
        setAllTemplateWikilinks(settings, true);
        for (const kind of kinds) {
            const config = configFor(settings, kind);
            expect(config.template).toContain('"Custom genres": "{{VALUE:genres|wikilink}}"');
            expect(config.template).toContain('year: {{VALUE:Year}}');
            expect(config.advancedTemplate).toBe(config.template);
        }
    });

    it('recognizes mixed settings and keeps the global choice after saving and changing modes', () => {
        let settings = structuredClone(DEFAULT_SETTINGS);
        settings.integrations.media.games.wikilinkFields = [];
        expect(getAllTemplateWikilinksState(settings)).toBe('mixed');
        setAllTemplateWikilinks(settings, false);
        settings = JSON.parse(JSON.stringify(settings));
        for (const kind of kinds) switchTemplateMode(kind, configFor(settings, kind), 'advanced');
        expect(getAllTemplateWikilinksState(settings)).toBe('off');
        setAllTemplateWikilinks(settings, true);
        for (const kind of kinds) switchTemplateMode(kind, configFor(settings, kind), 'simple');
        expect(getAllTemplateWikilinksState(settings)).toBe('on');
    });

    it('detects a manually edited advanced template instead of showing a stale global state', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        setAllTemplateWikilinks(settings, true);
        const config = settings.integrations.media.books;
        config.templateMode = 'advanced';
        config.template = buildDefaultAdvancedTemplate('books', {}, undefined, []);
        expect(getAllTemplateWikilinksState(settings)).toBe('mixed');
        setAllTemplateWikilinks(settings, true);
        expect(getAllTemplateWikilinksState(settings)).toBe('on');
    });

    it('can update an unsaved draft without replacing its edits or touching numeric fields', () => {
        const draft = '---\n"My directors": "{{VALUE:directors}}"\nyear: {{VALUE:Year}}\n---\n\nUnsaved text';
        const updated = updateTemplateWikilinks(draft, 'movies', true);
        expect(updated).toBe(draft.replace('{{VALUE:directors}}', '{{VALUE:directors|wikilink}}'));
        expect(updateTemplateWikilinks(updated, 'movies', false)).toBe(draft);
    });

    it('renders one accessible switch and updates all seven media before notifying the settings panel', () => {
        i18n.setLanguage('ru');
        const settings = structuredClone(DEFAULT_SETTINGS), root = document.body.createDiv();
        const changed = vi.fn(() => expect(getAllTemplateWikilinksState(settings)).toBe('off'));
        renderGlobalTemplateWikilinks(root, settings, changed);
        const button = root.querySelector<HTMLButtonElement>('[role="switch"]')!;
        expect(root.querySelectorAll('button')).toHaveLength(1);
        expect(button.getAttribute('aria-checked')).toBe('true');
        expect(root.textContent).toContain('Включено');
        button.click();
        expect(changed).toHaveBeenCalledExactlyOnceWith(false);
        expect(button.getAttribute('aria-checked')).toBe('false');
        expect(root.textContent).toContain('Выключено');
        for (const kind of kinds) expect(configFor(settings, kind).wikilinkFields).toEqual([]);
        root.replaceChildren();
        renderGlobalTemplateWikilinks(root, settings, () => undefined);
        expect(root.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('false');
        root.querySelector<HTMLButtonElement>('button')!.click();
        expect(getAllTemplateWikilinksState(settings)).toBe('on');
    });

    it('refreshes the complete settings panel while preserving an unsaved advanced draft', () => {
        i18n.setLanguage('ru');
        const settings = structuredClone(DEFAULT_SETTINGS);
        const books = settings.integrations.media.books;
        books.templateMode = 'advanced';
        books.template = buildDefaultAdvancedTemplate('books');
        const root = document.body.createDiv(), save = vi.fn(async () => undefined);
        const context = {
            plugin: { settings, saveSettings: save },
            createSectionHeader: () => undefined,
            getActiveMediaTab: () => 'books',
            setActiveMediaTab: vi.fn(),
        } as unknown as SettingsSectionContext;
        renderTemplatesSection(context, root);
        expect(root.querySelectorAll('.lorebase-template-global-wikilinks')).toHaveLength(1);
        expect(root.querySelector('.lorebase-template-editor-actions [aria-pressed]')).toBeNull();
        const editor = root.querySelector<HTMLTextAreaElement>('.is-books textarea')!;
        editor.value += '\nUNSAVED user text';
        editor.dispatchEvent(new Event('input'));
        const button = root.querySelector<HTMLButtonElement>('.lorebase-template-global-wikilinks [role="switch"]')!;
        button.click();
        expect(save).toHaveBeenCalledOnce();
        expect(getAllTemplateWikilinksState(settings)).toBe('off');
        const updated = root.querySelector<HTMLTextAreaElement>('.is-books textarea')!;
        expect(updated.value).toContain('UNSAVED user text');
        expect(updated.value).not.toContain('|wikilink');
        expect(books.template).not.toContain('UNSAVED user text');
        expect(root.querySelector<HTMLButtonElement>('.is-books button.mod-cta')!.disabled).toBe(false);
        for (const panel of root.querySelectorAll('.lorebase-template-preview-code')) expect(panel.textContent).not.toContain('|wikilink');
        button.click();
        expect(getAllTemplateWikilinksState(settings)).toBe('on');
        expect(root.querySelector<HTMLTextAreaElement>('.is-books textarea')!.value).toContain('UNSAVED user text');
        expect(root.querySelector<HTMLTextAreaElement>('.is-books textarea')!.value).toContain('{{VALUE:authors|wikilink}}');
    });

    it('allows per-field exceptions alongside the global control and persists field inclusion separately', () => {
        i18n.setLanguage('ru');
        const settings = structuredClone(DEFAULT_SETTINGS), root = document.body.createDiv();
        const save = vi.fn(async () => undefined);
        const context = {
            plugin: { settings, saveSettings: save }, createSectionHeader: () => undefined,
            getActiveMediaTab: () => 'books', setActiveMediaTab: vi.fn(),
        } as unknown as SettingsSectionContext;
        renderTemplatesSection(context, root);
        const otherTemplates = kinds.filter(kind => kind !== 'books').map(kind => configFor(settings, kind).template);
        const authorLink = () => root.querySelector<HTMLButtonElement>('.is-books [data-field="authors"] .lorebase-template-editor-wikilink')!;
        authorLink().click();
        const books = settings.integrations.media.books;
        expect(books.template).toContain('{{VALUE:authors}}');
        expect(books.template).toContain('{{VALUE:genres|wikilink}}');
        expect(getAllTemplateWikilinksState(settings)).toBe('mixed');
        expect(root.querySelector('.lorebase-template-global-wikilinks-status')?.textContent).toBe('Частично');
        expect(kinds.filter(kind => kind !== 'books').map(kind => configFor(settings, kind).template)).toEqual(otherTemplates);
        const included = root.querySelector<HTMLInputElement>('.is-books [data-field="authors"] input[type="checkbox"]')!;
        included.checked = false; included.dispatchEvent(new Event('change'));
        expect(books.template).not.toContain('{{VALUE:authors');
        included.checked = true; included.dispatchEvent(new Event('change'));
        expect(books.template).toContain('{{VALUE:authors}}');
        const global = root.querySelector<HTMLButtonElement>('.lorebase-template-global-wikilinks [role="switch"]')!;
        global.click();
        expect(getAllTemplateWikilinksState(settings)).toBe('on');
        expect(authorLink().getAttribute('aria-pressed')).toBe('true');
        global.click();
        expect(getAllTemplateWikilinksState(settings)).toBe('off');
        expect(authorLink().getAttribute('aria-pressed')).toBe('false');
        authorLink().click();
        expect(getAllTemplateWikilinksState(settings)).toBe('mixed');
        const restored = JSON.parse(JSON.stringify(settings));
        root.replaceChildren();
        context.plugin.settings = restored;
        renderTemplatesSection(context, root);
        expect(authorLink().getAttribute('aria-pressed')).toBe('true');
        expect(root.querySelector('.is-books [data-field="genres"] .lorebase-template-editor-wikilink')?.getAttribute('aria-pressed')).toBe('false');
    });

    it('keeps individual choices in the advanced backup when switching editor modes', () => {
        const config = structuredClone(DEFAULT_SETTINGS.integrations.media.books);
        config.advancedTemplate = '---\n"My authors": "{{VALUE:authors|wikilink}}"\n"My genres": "{{VALUE:genres|wikilink}}"\nyear: {{VALUE:Year}}\n---\n\nMy custom text';
        setTemplateWikilinkFields(config, 'books', ['authors']);
        switchTemplateMode('books', config, 'advanced');
        expect(config.template).toContain('"My authors": "{{VALUE:authors|wikilink}}"');
        expect(config.template).toContain('"My genres": "{{VALUE:genres}}"');
        expect(config.template).toContain('year: {{VALUE:Year}}');
        expect(config.template).toContain('My custom text');
        switchTemplateMode('books', config, 'simple');
        expect(config.template).toContain('{{VALUE:authors|wikilink}}');
        expect(config.template).toContain('{{VALUE:genres}}');
    });
});
