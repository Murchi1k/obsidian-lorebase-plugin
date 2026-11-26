import { describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { DEFAULT_SETTINGS } from '../src/constants';
import { MetadataService } from '../src/services/MetadataService';

function fixture() {
    const settings = structuredClone(DEFAULT_SETTINGS);
    const config = settings.integrations.media.games;
    config.templateEnabled = true;
    config.templateMode = 'advanced';
    config.template = '---\nFirst: "{{VALUE:name}}"\n---';
    config.fieldAliases = {};
    return { settings, config, service: new MetadataService({} as App, () => settings) };
}

describe('compiled note templates', () => {
    it('reads the latest advanced template after an in-place edit', () => {
        const { config, service } = fixture();
        expect(service.resolveFrontmatter('game', { First: 'Original' }).name).toBe('Original');
        config.template = '---\nSecond: "{{VALUE:name}}"\n---';
        expect(service.resolveFrontmatter('game', { Second: 'Edited' }).name).toBe('Edited');
        expect(service.getNoteTemplate('game')).toBe(config.template);
    });

    it('observes in-place edits of simple fields, aliases and wikilinks', () => {
        const { config, service } = fixture();
        config.templateMode = 'simple'; config.templateFields = ['name', 'genres'];
        config.fieldAliases = { name: 'First' }; config.wikilinkFields = [];
        expect(service.resolveFrontmatter('game', { First: 'One' }).name).toBe('One');
        const initial = service.getNoteTemplate('game');
        config.fieldAliases.name = 'Second'; config.templateFields.push('favorite'); config.wikilinkFields.push('genres');
        const edited = service.getNoteTemplate('game');
        expect(edited).not.toBe(initial);
        expect(edited).toContain('favorite:');
        expect(edited).toContain('{{VALUE:genres|wikilink}}');
        expect(service.resolveFrontmatter('game', { Second: 'Two' }).name).toBe('Two');
    });

    it('keeps the alias cache isolated from callers and other media', () => {
        const { settings, service } = fixture();
        const aliases = service.getFrontmatterFieldAliases('game'); aliases.name = 'Wrong';
        Object.assign(settings.integrations.media.books, {
            templateEnabled: true, templateMode: 'advanced', template: '---\nBookTitle: "{{VALUE:name}}"\n---',
        });
        expect(service.resolveFrontmatter('book', { BookTitle: 'Book' }).title).toBe('Book');
        expect(service.resolveFrontmatter('game', { First: 'Game' }).name).toBe('Game');
    });

    it('reads updated alias history without changing the template', () => {
        const { config, service } = fixture();
        service.getNoteTemplate('game');
        config.previousFieldAliases = { name: ['Former'] };
        expect(service.resolveFrontmatter('game', { Former: 'One' }).name).toBe('One');
        config.previousFieldAliases.name.push('Older');
        expect(service.resolveFrontmatter('game', { Older: 'Two' }).name).toBe('Two');
    });

    it('observes disabling templates and replacing settings objects', () => {
        const { settings, config, service } = fixture();
        service.getNoteTemplate('game'); config.templateEnabled = false;
        expect(service.getNoteTemplate('game')).toBe('');
        settings.integrations.media.games = { ...config, templateEnabled: true, template: '---\nReplacement: "{{VALUE:name}}"\n---' };
        expect(service.resolveFrontmatter('game', { Replacement: 'New' }).name).toBe('New');
    });
});
