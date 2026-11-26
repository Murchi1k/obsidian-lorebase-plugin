// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import { RecommendationsPanel } from '../src/components/RecommendationsPanel';
import type { RecommendationsService, RecommendationTitle } from '../src/services/RecommendationsService';
import { AnimeEditModal } from '../src/modals/AnimeEditModal';
import { VideoEditModal } from '../src/modals/VideoEditModal';
import { rt } from '../src/localization/recommendations';
const item = { type: 'movie', integrationProvider: 'tmdb', integrationId: '10' } as RecommendationTitle;
const result = { source: 'TMDB' as const, items: Array.from({ length: 9 }, (_, n) => ({ id: String(n), title: `Title <b>${n}</b>`, year: '2024', image: '', url: `https://www.themoviedb.org/movie/${n}` })) };
function serviceFor(load: () => Promise<typeof result>) { return { load, libraryIndex: () => () => null, add: vi.fn(async () => null as TFile | null), open: vi.fn(async () => {}) }; }
afterEach(() => document.body.replaceChildren());
describe('compact recommendation panel', () => {
    it('opens by default, renders seven source links and does not refetch on collapse/reopen', async () => {
        const load = vi.fn(async () => result), host = document.body.appendChild(document.createElement('div'));
        const panel = new RecommendationsPanel(host, item, serviceFor(load) as unknown as RecommendationsService);
        expect(host.querySelector('details')!.open).toBe(true);
        await vi.waitFor(() => expect(host.querySelectorAll('a')).toHaveLength(7));
        expect(host.querySelector('a')!.href).toBe(result.items[0].url); expect(host.querySelector('a')!.rel).toBe('noopener noreferrer');
        expect(host.querySelector('.lorebase-recommendation-link strong')!.textContent).toBe('Title <b>0</b>'); expect(host.querySelector('b')).toBeNull();
        expect(host.querySelector('.lorebase-recommendations-help')?.textContent).toContain(rt('online'));
        host.querySelector('details')!.open = false; host.querySelector('details')!.open = true;
        expect(load).toHaveBeenCalledOnce(); panel.destroy();
    });
    it('does not update a destroyed editor when the network responds late', async () => {
        let finish!: (value: typeof result) => void;
        const host = document.body.appendChild(document.createElement('div'));
        const panel = new RecommendationsPanel(host, item, serviceFor(() => new Promise(resolve => { finish = resolve; })) as unknown as RecommendationsService);
        panel.destroy(); finish(result); await Promise.resolve(); expect(host.querySelectorAll('a')).toHaveLength(0);
    });
    it('shows a short failure and retries without creating more panels', async () => {
        const load = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(result);
        const host = document.body.appendChild(document.createElement('div'));
        const panel = new RecommendationsPanel(host, item, serviceFor(load) as unknown as RecommendationsService);
        await vi.waitFor(() => expect(host.querySelector('button')?.textContent).toBe(rt('retry')));
        host.querySelector('button')!.click(); await vi.waitFor(() => expect(host.querySelectorAll('a')).toHaveLength(7));
        expect(host.querySelectorAll('.lorebase-recommendations')).toHaveLength(1); panel.destroy();
    });
    it('adds a recommendation once, marks the result and opens its note on the next click', async () => {
        let added = false, finish!: (file: TFile) => void;
        const file = new TFile('Movies/Title.md', 'Title'), service = serviceFor(async () => result);
        service.libraryIndex = () => () => added ? file as any : null;
        service.add.mockImplementation(() => new Promise(resolve => { finish = file => { added = true; resolve(file); }; }));
        const host = document.body.appendChild(document.createElement('div'));
        const panel = new RecommendationsPanel(host, item, service as unknown as RecommendationsService);
        await vi.waitFor(() => expect(host.querySelectorAll('a')).toHaveLength(7));
        const button = host.querySelector<HTMLButtonElement>('.lorebase-recommendation-add')!;
        button.click(); button.click(); expect(service.add).toHaveBeenCalledOnce(); expect(button.disabled).toBe(true);
        finish(file); await vi.waitFor(() => expect(button.disabled).toBe(false));
        expect(button.getAttribute('aria-label')).toContain(rt('openLibrary'));
        button.click(); expect(service.open).toHaveBeenCalledWith(file); expect(service.add).toHaveBeenCalledOnce(); panel.destroy();
    });
    it('keeps an add failure retryable and does not change a closed editor after an import', async () => {
        const service = serviceFor(async () => result); service.add.mockRejectedValueOnce(new Error('Offline'));
        const host = document.body.appendChild(document.createElement('div'));
        const panel = new RecommendationsPanel(host, item, service as unknown as RecommendationsService);
        await vi.waitFor(() => expect(host.querySelectorAll('a')).toHaveLength(7));
        const button = host.querySelector<HTMLButtonElement>('.lorebase-recommendation-add')!; button.click();
        await vi.waitFor(() => expect(host.querySelector('[role=status]')?.textContent).toBe(rt('addFailed')));
        await vi.waitFor(() => expect(button.disabled).toBe(false)); expect(button.getAttribute('aria-label')).toContain(rt('add'));
        let finish!: (value: TFile) => void; service.add.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
        button.click(); panel.destroy(); host.replaceChildren(); finish(new TFile('Movies/New.md', 'New')); await Promise.resolve(); await Promise.resolve(); expect(host.childElementCount).toBe(0);
    });
    it('places recommendations after actors in video editors and before title composition in anime', () => {
        const base = { displayName: 'Title', imageUrl: '', type: 'anime', status: 'planned', year: 2024, userRating: null, favorite: false, isAdult: false, genres: [], tags: [], parts: [], studios: [] } as any;
        const anime = new AnimeEditModal(new App(), base, vi.fn()), video = new VideoEditModal(new App(), { ...base, type: 'series' }, vi.fn(), vi.fn());
        const animeTemplate = (anime as any).buildTemplate() as string, videoTemplate = (video as any).buildTemplate() as string;
        expect(animeTemplate.indexOf('data-role="recommendations-panel"')).toBeLessThan(animeTemplate.indexOf('class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-anime-parts"'));
        expect(videoTemplate.indexOf('data-role="recommendations-panel"')).toBeGreaterThan(videoTemplate.indexOf('data-role="cast-panel"'));
    });
});
