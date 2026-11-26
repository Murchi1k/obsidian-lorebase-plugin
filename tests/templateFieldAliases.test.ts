import { describe, expect, it } from 'vitest';
import {
    applyFrontmatterAliases,
    parseTemplateFieldAliases,
    remapFrontmatterUpdates,
} from '../src/services/media/templateFieldAliases';

describe('templateFieldAliases', () => {
    it('uses the YAML key attached to a template placeholder as the field name', () => {
        const aliases = parseTemplateFieldAliases('game', [
            '---',
            'MyName: "{{VALUE:name}}"',
            'MyRating: {{VALUE:userRating}}',
            'МойСтатус: "{{VALUE:status}}"',
            'MyPoster: "{{VALUE:Poster}}"',
            '---',
        ].join('\n'));

        expect(aliases.name).toBe('MyName');
        expect(aliases.title).toBe('MyName');
        expect(aliases.userRating).toBe('MyRating');
        expect(aliases.status).toBe('МойСтатус');
        expect(aliases.poster).toBe('MyPoster');
    });

    it('reads custom fields through the canonical media properties', () => {
        const aliases = parseTemplateFieldAliases('game', 'MyRating: {{VALUE:userRating}}');
        const source = { MyRating: 8.5, untouched: true };
        const normalized = applyFrontmatterAliases(source, aliases);

        expect(normalized.userRating).toBe(8.5);
        expect(normalized.MyRating).toBe(8.5);
        expect(Object.keys(normalized)).toEqual(['MyRating', 'untouched']);
    });

    it('reads a renamed movie poster field for dashboard cards', () => {
        const aliases = parseTemplateFieldAliases('movie', 'cover: "{{VALUE:Poster}}"');
        const normalized = applyFrontmatterAliases({ cover: 'https://example.com/poster.jpg' }, aliases);

        expect(aliases.poster).toBe('cover');
        expect(normalized.poster).toBe('https://example.com/poster.jpg');
    });

    it('writes updates back to the custom key without adding the canonical key', () => {
        const aliases = parseTemplateFieldAliases('game', 'MyRating: {{VALUE:userRating}}');

        expect(remapFrontmatterUpdates({ userRating: 10 }, aliases)).toEqual({ MyRating: 10 });
    });

    it('keeps a new value when a service also removes a legacy alias', () => {
        const aliases = parseTemplateFieldAliases('anime', 'MyRating: {{VALUE:rating}}');

        expect(remapFrontmatterUpdates({ rating: 7.5, userRating: null }, aliases)).toEqual({ MyRating: 7.5 });
    });

    it('supports block placeholders used by multipart media templates', () => {
        const aliases = parseTemplateFieldAliases('anime', [
            'MyParts:',
            '{{VALUE:animePartsYaml}}',
        ].join('\n'));

        expect(aliases.anime_parts).toBe('MyParts');
    });
});
