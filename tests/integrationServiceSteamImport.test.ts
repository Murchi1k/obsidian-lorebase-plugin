import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/constants';
import { IntegrationService } from '../src/services/IntegrationService';
import type { GameItem } from '../src/types';
import type { SearchResult } from '../src/services/integrations/types';
import type { JsonFetcher } from '../src/services/integrations/providers/common';
import { createMockApp, createMockFile } from './helpers/testHelpers';
import { __setRequestUrlMock } from './mocks/obsidian';
import { resetIntegrationRequestStateForTests } from '../src/services/integrations/shared';

function setup(detailResponse: unknown, provider: 'steam' | 'rawg' = 'steam') {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.showAddModeChoice = false;
    settings.games.folderPath = 'Games';
    settings.integrations!.enabled = true;
    settings.integrations!.providers[provider].enabled = true;
    settings.integrations!.providers[provider].apiKey = 'test-key';
    settings.integrations!.media.games.provider = provider;
    settings.integrations!.media.games.templateEnabled = true;
    settings.integrations!.media.games.templateMode = 'advanced';
    settings.integrations!.media.games.template = '---\nname: "{{VALUE:name}}"\nPoster: "{{VALUE:Poster}}"\nYear: {{VALUE:Year}}\nurl: "{{VALUE:url}}"\n---';
    settings.integrations!.media.games.howLongToBeatEnabled = false;
    settings.integrations!.imageStorage.enabled = false;

    const app = createMockApp({});
    const create = vi.fn().mockResolvedValue(undefined);
    app.vault.create = create;
    app.vault.createFolder = vi.fn().mockResolvedValue(undefined);
    const service = new IntegrationService(app, () => settings);
    const internals = service as unknown as {
        chooseResults(): Promise<SearchResult[]>;
        jsonFetcher: JsonFetcher;
        fetchDetails(): Promise<unknown>;
    };
    internals.chooseResults = async () => [{
        id: '10', provider, title: 'Selected Game', year: '2024',
        image: 'https://example.com/poster.jpg',
    }];
    internals.jsonFetcher = async () => detailResponse;
    return { service, create, internals };
}

beforeEach(() => {
    resetIntegrationRequestStateForTests();
    __setRequestUrlMock(() => ({ status: 200, headers: { 'content-type': 'image/jpeg' } }));
});

describe('Steam community rating', () => {
    const game = { type: 'game', steamAppId: '227300' } as GameItem;

    it('refreshes a rating-only link saved by the breakdown experiment', async () => {
        const file = createMockFile('game.md', 'game');
        const app = createMockApp({ [file.path]: { frontmatter: {
            lorebase_community_ratings: [
                { provider: 'Steam', rating: 90, votes: 100, source: { provider: 'steam', id: '10' } },
            ],
        } } });
        app.vault.getAbstractFileByPath = () => file;
        const service = new IntegrationService(app, () => DEFAULT_SETTINGS);
        __setRequestUrlMock(options => {
            expect(typeof options === 'string' ? options : options.url).toContain('/appreviews/10?');
            return { json: { query_summary: { total_positive: 82, total_reviews: 100 } } };
        });

        expect(await service.fetchCommunityRatingForItem({ ...game, filePath: file.path, communityRatingProvider: 'Steam' }))
            .toEqual({ provider: 'Steam', rating: 82, votes: 100 });
    });

    it('accepts zero positive reviews and uses the review summary', async () => {
        const service = new IntegrationService(createMockApp({}), () => DEFAULT_SETTINGS);
        const fetch = vi.fn(() => ({ json: { query_summary: { total_positive: 0, total_reviews: 5 } } }));
        __setRequestUrlMock(fetch);

        expect(await service.fetchCommunityRatingForItem(game)).toEqual({ provider: 'Steam', rating: 0, votes: 5 });
        expect(fetch).toHaveBeenCalledOnce();
    });

    it('uses the aggregate from the store page when appreviews responds with HTML', async () => {
        const service = new IntegrationService(createMockApp({}), () => DEFAULT_SETTINGS);
        __setRequestUrlMock(options => {
            const url = typeof options === 'string' ? options : options.url;
            if (url.includes('/appreviews/')) return {
                get json() { throw new SyntaxError('Unexpected HTML'); },
                text: '<html>Welcome to Steam</html>',
            };
            expect(url).toBe('https://store.steampowered.com/app/227300/?l=english');
            return { text: `<a data-tooltip-html="96% of the 5,857 user reviews in the last 30 days are positive."></a>
                <a data-tooltip-html="97% of the 147,396 user reviews in your language are positive" itemprop="aggregateRating"></a>` };
        });

        expect(await service.fetchCommunityRatingForItem(game)).toEqual({ provider: 'Steam', rating: 97, votes: 147396 });
    });
});

afterEach(() => {
    __setRequestUrlMock(null);
    vi.restoreAllMocks();
});

describe('Steam search note creation', () => {
    it.each([
        { 10: { success: false } },
        {},
    ])('creates the selected note when Steam has no appdetails: %j', async (response) => {
        const { service, create } = setup(response);

        await service.addGame();

        expect(create).toHaveBeenCalledOnce();
        const [path, content] = create.mock.calls[0];
        expect(path).toBe('Games/Selected Game.md');
        expect(content).toContain('name: "Selected Game"');
        expect(content).toContain('Poster: "https://example.com/poster.jpg"');
        expect(content).toContain('Year: 2024');
        expect(content).toContain('https://store.steampowered.com/app/10/');
        expect(content).toContain('integration_provider: "steam"');
        expect(content).toContain('integration_id: "10"');
    });

    it.each(['10', '2441600'])('keeps full Steam details returned under key %s', async (key) => {
        const { service, create } = setup({
            [key]: { success: true, data: { steam_appid: 10, name: 'Full Game Title', release_date: { date: 'Jan 1, 2023' } } },
        });

        await service.addGame();

        expect(create).toHaveBeenCalledOnce();
        expect(create.mock.calls[0][0]).toBe('Games/Full Game Title.md');
        expect(create.mock.calls[0][1]).toContain('Year: 2023');
    });

    it('does not apply the Steam fallback to other providers', async () => {
        const { service, create, internals } = setup(null, 'rawg');
        internals.fetchDetails = async () => null;

        await service.addGame();

        expect(create).not.toHaveBeenCalled();
    });

    it('does not turn a failed request into a successful import', async () => {
        const { service, create, internals } = setup(null);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        internals.jsonFetcher = async () => { throw new Error('Network unavailable'); };

        await service.addGame();

        expect(create).not.toHaveBeenCalled();
    });
});
