import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/constants';
import { IntegrationService } from '../src/services/IntegrationService';
import type { MediaKind, ProviderId } from '../src/services/integrations/types';
import { createMockApp } from './helpers/testHelpers';
import { setProviderEnabled } from '../src/services/integrations/providerSettings';

describe('provider compatibility matrix', () => {
    it.each<[MediaKind, ProviderId[]]>([
        ['games', ['rawg', 'steam', 'igdb', 'vndb']],
        ['anime', ['anilist', 'kitsu', 'shikimori', 'tmdb', 'tvmaze', 'omdb']],
        ['movies', ['tmdb', 'omdb']],
        ['series', ['tmdb', 'tvmaze', 'omdb']],
        ['books', ['hardcover', 'googlebooks', 'openlibrary']],
        ['manga', ['anilist', 'shikimori', 'mangaupdates', 'mangadex', 'comicvine']],
    ])('offers only compatible providers for %s', (kind, expected) => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        for (const provider of Object.values(settings.integrations!.providers)) {
            provider.enabled = true;
            provider.apiKey = 'key';
            provider.clientSecret = 'secret';
        }
        const service = new IntegrationService(createMockApp({}), () => settings);
        const getProviderOptions = (service as unknown as {
            getProviderOptions(value: MediaKind): Array<{ id: ProviderId; alternateSearch?: boolean }>;
        }).getProviderOptions.bind(service);

        const options = getProviderOptions(kind);
        expect(options.map((provider) => provider.id)).toEqual(expected);
        if (kind === 'manga') expect(options.find(provider => provider.id === 'mangaupdates')).toMatchObject({ label: 'MUpd' });
        expect(options.filter(provider => provider.alternateSearch).map(provider => provider.id)).toEqual(
            kind === 'anime' ? ['tmdb', 'tvmaze', 'omdb'] : [],
        );
    });

    it('keeps legacy Jikan manga support out of new manga searches', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        const service = new IntegrationService(createMockApp({}), () => settings);
        const options = (service as unknown as {
            getProviderOptions(value: MediaKind): Array<{ id: ProviderId }>;
        }).getProviderOptions('manga');

        expect(options.map((provider) => provider.id)).not.toContain('jikan');
    });

    it.each(['anilist', 'shikimori'] as const)('keeps %s enabled independently and tests the selected catalogue', async provider => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        const integrations = settings.integrations!;
        integrations.enabled = true;
        integrations.providers[provider].enabled = false;
        const service = new IntegrationService(createMockApp({}), () => settings);
        const options = (kind: MediaKind) => service['getProviderOptions'](kind).map(option => option.id);
        const search = vi.spyOn(service as any, 'search').mockResolvedValue([{ title: 'Naruto' }]);

        expect(options('anime')).not.toContain(provider);
        expect(options('manga')).not.toContain(provider);
        setProviderEnabled(integrations, provider, true, 'manga');
        expect(options('anime')).not.toContain(provider);
        expect(options('manga')).toContain(provider);
        await expect(service.testProvider(provider, 'manga')).resolves.toEqual({ ok: true });
        expect(search).toHaveBeenLastCalledWith(provider, 'naruto', '', '', {}, 'manga');
        await expect(service.testProvider(provider, 'anime')).resolves.toEqual({ ok: false, reason: 'disabled' });

        setProviderEnabled(integrations, provider, true, 'anime');
        setProviderEnabled(integrations, provider, false, 'manga');
        await expect(service.testProvider(provider, 'anime')).resolves.toEqual({ ok: true });
        expect(search).toHaveBeenLastCalledWith(provider, 'naruto', '', '', {}, 'anime');
        await expect(service.searchCatalogInput('manga', `${provider}:1`, provider)).rejects.toThrow();
        expect(options('anime')).toContain(provider);
        expect(options('manga')).not.toContain(provider);
    });
});
