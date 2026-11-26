import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/constants';
import { GameService } from '../src/services/GameService';
import { VideoService } from '../src/services/VideoService';
import { AnimeService } from '../src/services/AnimeService';
import { IntegrationService } from '../src/services/IntegrationService';
import { configureMediaWorkTypes, countryLabel, countryOptions, getAnimeCountryCatalog, getMediaWorkTypeColor, getMediaWorkTypeOptions, normalizeAnimeCountryCatalog, normalizeCountry, normalizeMediaWorkType, normalizeMediaWorkTypeCatalog } from '../src/utils/mediaWorkType';
import { getBuiltInFieldDefinitions, getFilterFlagsForMediaType } from '../src/views/library/viewOptions';
import { matchesFilterRule, normalizeLibraryViewState, cloneLibraryViewState } from '../src/services/media/libraryViewState';
import { createMockApp, createMockFile, createMetadataService } from './helpers/testHelpers';
import { ManualCreateModal, type ManualCreateDraft } from '../src/modals/ManualCreateModal';

afterEach(() => { configureMediaWorkTypes(); vi.restoreAllMocks(); });

describe('media work types and anime origin', () => {
    it('keeps removed countries out of the picker after reload without rewriting existing country values', () => {
        const settings = normalizeAnimeCountryCatalog({ types: [{ value: 'CN' }, { value: 'KR' }], hidden: ['jp'] });
        configureMediaWorkTypes({ anime: JSON.parse(JSON.stringify(settings)) });
        expect(getAnimeCountryCatalog(['JP', 'KR']).types.map(entry => entry.value)).toEqual(['CN', 'KR']);
        expect(countryOptions('ru', ['JP']).some(entry => entry.value === 'JP')).toBe(false);
        expect(normalizeCountry('JP')).toBe('JP');
        expect(countryLabel('JP', 'ru')).toBe('Япония');
    });
    it('preserves custom colors across serialization and catalog normalization', () => {
        for (const type of ['game', 'movie', 'series', 'manga'] as const) {
            const initial = normalizeMediaWorkTypeCatalog(type);
            const value = initial.types[0].value;
            const defaultColor = getMediaWorkTypeColor(type, value);
            initial.types[0].color = '#123ABC';
            const restored = normalizeMediaWorkTypeCatalog(type, JSON.parse(JSON.stringify(initial)));
            configureMediaWorkTypes({ [type]: restored });
            expect(getMediaWorkTypeColor(type, value)).toBe('#123abc');
            delete restored.types[0].color;
            configureMediaWorkTypes({ [type]: restored });
            expect(getMediaWorkTypeColor(type, value)).toBe(defaultColor);
        }
        const invalid = normalizeMediaWorkTypeCatalog('game', { types: [{ value: 'Game', color: 'not-a-color' }] });
        expect(invalid.types[0].color).toBeUndefined();
    });
    it('shares country names, order and colors without changing ISO values', () => {
        const catalog = normalizeAnimeCountryCatalog(JSON.parse(JSON.stringify({ types: [
            { value: 'kr', label: 'Корея', color: '#ABCDEF' },
            { value: 'JP', label: 'Япония' }, { value: 'KR' }, { value: 'invalid' },
        ] })));
        configureMediaWorkTypes({ anime: catalog });
        expect(countryOptions('ru', ['DE']).map(entry => entry.value)).toEqual(['KR', 'JP', 'DE']);
        expect(countryLabel('KR', 'ru')).toBe('Корея');
        expect(getMediaWorkTypeColor('anime', 'KR')).toBe('#abcdef');
        expect(normalizeAnimeCountryCatalog({ types: [{ value: 'invalid' }] }).types[0].value).toBe('JP');
    });
    it('keeps custom catalogues independent and applies deleted-type redirects', () => {
        configureMediaWorkTypes({ game: { types: [{ value: 'Game' }, { value: 'Visual novel', label: 'Новелла' }], redirects: { Interactive: 'Visual novel' } } });
        expect(normalizeMediaWorkType('game', 'Interactive')).toBe('Visual novel');
        expect(getMediaWorkTypeOptions('game', 'ru').map(entry => entry.label)).toEqual(['Игра', 'Новелла']);
        expect(getMediaWorkTypeOptions('movie', 'ru').map(entry => entry.value)).toEqual(['Movie', 'Animation', 'Documentary']);
        expect(getMediaWorkTypeOptions('series', 'ru').map(entry => entry.value)).toContain('TV show');
    });

    it('reads legacy defaults and explicit work types without rewriting old notes', () => {
        const file = createMockFile('Games/test.md', 'test');
        const app = createMockApp({ [file.path]: { frontmatter: { type: 'game', name: 'Test', work_type: 'Visual novel', integration_provider: 'vndb', integration_id: 'v17' } } });
        const game = new GameService(app, createMetadataService(app)).parseGameFromCache(file);
        expect(game).toMatchObject({ workType: 'Visual novel', integrationProvider: 'vndb' });
    });

    it('persists a changed game type in frontmatter', async () => {
        const file = createMockFile('Games/test.md', 'test');
        const app = createMockApp({ [file.path]: { frontmatter: { type: 'game', name: 'Test' } } });
        app.vault.getAbstractFileByPath = () => file;
        const metadata = createMetadataService(app);
        const frontmatter: Record<string, unknown> = { type: 'game', name: 'Test' };
        app.fileManager.processFrontMatter = async (_file, update) => { update(frontmatter); };
        const service = new GameService(app, metadata);
        const game = service.parseGameFromCache(file)!;
        expect(game.workType).toBe('Game');
        await service.updateGame(game, { workType: 'Visual novel' });
        expect(frontmatter.work_type).toBe('Visual novel');
    });

    it('reads country and adult metadata into anime filters without changing anime format', () => {
        const file = createMockFile('Anime/test.md', 'test');
        const app = createMockApp({ [file.path]: { frontmatter: { type: 'anime', title: 'Test', country_of_origin: 'cn', Sex18: true, format: 'tv' } } });
        const service = new AnimeService(app, createMetadataService(app));
        const anime = service.parseAnimeFromCache(file)!;
        expect(anime).toMatchObject({ countryOfOrigin: 'CN', workType: 'CN', isAdult: true, format: 'tv' });
        expect(matchesFilterRule(anime, { id: 'country', field: 'workType', operator: 'containsAny', value: ['CN'] })).toBe(true);
        expect(matchesFilterRule(anime, { id: 'adult', field: 'adult', operator: 'isTrue' })).toBe(true);
        const fields = getBuiltInFieldDefinitions('anime', [], getFilterFlagsForMediaType('anime'), ['CN']);
        expect(fields.some(field => field.id === 'adult')).toBe(true);
        expect(fields.find(field => field.id === 'workType')?.options?.some(option => option.value === 'CN')).toBe(true);
        const state = cloneLibraryViewState(DEFAULT_SETTINGS.anime.viewState);
        state.workTypes = ['CN'];
        expect(normalizeLibraryViewState(JSON.parse(JSON.stringify(state)), DEFAULT_SETTINGS.anime.viewState).workTypes).toEqual(['CN']);
    });

    it('preserves movie and series types when parsing notes', () => {
        for (const [type, workType] of [['movie', 'Animation'], ['series', 'Documentary series']] as const) {
            const file = createMockFile(`${type}/test.md`, 'test');
            const app = createMockApp({ [file.path]: { frontmatter: { type, title: 'Test', work_type: workType } } });
            expect(new VideoService(app, type, type, createMetadataService(app)).parseFromCache(file)?.workType).toBe(workType);
        }
    });

    it('carries manual classification into creation values', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        const service = new IntegrationService(createMockApp({}), () => settings) as unknown as { buildManualValues(draft: ManualCreateDraft): Record<string, unknown> };
        const draft = { kind: 'games', title: 'Test', workType: 'Visual novel', genres: [], tags: [], year: '', released: '', rating: null } as ManualCreateDraft;
        expect(service.buildManualValues(draft).workType).toBe('Visual novel');
        expect(service.buildManualValues({ ...draft, kind: 'anime', countryOfOrigin: 'kr', isAdult: true, animeParts: [], format: 'tv' })).toMatchObject({ countryOfOrigin: 'KR', isAdult: true });
    });

    it.each(['games', 'movies', 'series', 'anime'] as const)('saves manually chosen classification even when an advanced %s template omits it', async kind => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.integrations!.media[kind].templateEnabled = true;
        settings.integrations!.media[kind].templateMode = 'advanced';
        settings.integrations!.media[kind].template = '---\ntitle: "{{VALUE:name}}"\n---';
        settings.integrations!.imageStorage.enabled = false;
        const app = createMockApp({});
        const draft = (new ManualCreateModal(app, kind) as unknown as { draft: ManualCreateDraft }).draft;
        Object.assign(draft, { title: 'Manual test', workType: kind === 'games' ? 'Visual novel' : kind === 'movies' ? 'Animation' : 'Animated series', countryOfOrigin: 'KR', isAdult: true });
        vi.spyOn(ManualCreateModal.prototype, 'openAndGetValue').mockResolvedValue(draft);
        const create = vi.fn().mockResolvedValue(undefined);
        app.vault.create = create;
        app.vault.createFolder = vi.fn().mockResolvedValue(undefined);
        const service = new IntegrationService(app, () => settings) as unknown as { addManualMedia(kind: string): Promise<void> };
        await service.addManualMedia(kind);
        expect(create).toHaveBeenCalledOnce();
        const content = create.mock.calls[0][1] as string;
        if (kind === 'anime') {
            expect(content).toContain('country_of_origin: "KR"');
            expect(content).toContain('Sex18: true');
        } else expect(content).toContain(`work_type: "${draft.workType}"`);
    });
});
