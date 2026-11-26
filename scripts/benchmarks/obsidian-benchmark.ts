// Test-vault companion plugin. It never runs in the user's normal vault.
import { Plugin, Notice } from 'obsidian';
import { createServer } from 'http';
import { validateCoverImage } from '../../src/services/integrations/coverValidation';
import { onePixelPng } from '../../tests/helpers/coverImages';
import { renderGalleryTrailers } from '../../src/components/GalleryTrailerPlayer';

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
const frame = (): Promise<number> => new Promise(resolve => requestAnimationFrame(resolve));
const percentile = (values: number[], fraction: number): number => [...values].sort((a,b) => a-b)[Math.min(values.length - 1, Math.floor(values.length * fraction))] ?? 0;
async function until(check: () => boolean, timeout = 120_000): Promise<void> {
    const start = performance.now(); while (!check()) { if (performance.now() - start > timeout) throw new Error('Benchmark condition timed out'); await sleep(50); }
}

export default class LorebaseBenchmark extends Plugin {
    private readonly output = '.obsidian/plugins/lorebase-benchmark/';
    private stopped = false;
    async onload(): Promise<void> {
        if (!await this.app.vault.adapter.exists('.lorebase-benchmark-owned')) throw new Error('Benchmark vault marker is missing.');
        this.register(() => { this.stopped = true; });
        this.app.workspace.onLayoutReady(() => { void this.run(); });
    }
    private async write(name: string, data: unknown): Promise<void> { await this.app.vault.adapter.write(this.output + name + '.json', JSON.stringify(data, null, 2)); }
    private async stage(name: string): Promise<void> { if (this.stopped) throw new Error('Benchmark unloaded'); await this.write('progress', { stage: name, timestamp: new Date().toISOString() }); new Notice('Lorebase test: ' + name, 3000); }
    private async run(): Promise<void> {
        const results: Record<string, any> = { timestamp: new Date().toISOString(), environment: { platform: process.platform, versions: process.versions, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio } } };
        try {
            const config = JSON.parse(await this.app.vault.adapter.read(this.output + 'config.json')) as { count: number; manualStart?: boolean; smokeOnly?: boolean; profileOnly?: boolean; profileLabel?: 'before' | 'after' };
            results.count = config.count;
            if (config.manualStart) {
                await this.stage('waiting for start');
                while (!await this.app.vault.adapter.exists(this.output + 'start.json')) { if (this.stopped) return; await sleep(200); }
            }
            await this.stage('waiting for foreground');
            await until(() => document.visibilityState === 'visible' && document.hasFocus(), 300_000);
            if (config.profileOnly) {
                await until(() => this.app.vault.getMarkdownFiles().filter(file => file.path.startsWith('Games/') && this.app.metadataCache.getFileCache(file)?.frontmatter).length === config.count, 180_000);
                const manager = (this.app as any).plugins; await manager.enablePlugin('lorebase');
                await this.profile(manager.plugins.lorebase, config.count, config.profileLabel ?? 'before'); return;
            }
            if (config.smokeOnly) {
                const manager = (this.app as any).plugins; await manager.enablePlugin('lorebase');
                results.images = await this.images(); results.hls = await this.hls();
                results.musicImport = await this.musicImport(manager.plugins.lorebase);
                if (!results.hls.galleryStopped || !results.musicImport.nestedYamlPreserved || !results.musicImport.sourceUnchanged || !results.musicImport.repeatSkipped) throw new Error('Native smoke assertions failed');
                results.complete = true; await this.write('smoke-results', results); await this.stage('smoke complete'); return;
            }
            let focusLost = false;
            const blur = (): void => { focusLost = true; };
            window.addEventListener('blur', blur); this.register(() => window.removeEventListener('blur', blur));
            await this.stage('metadata indexing');
            const indexing = performance.now();
            await until(() => this.app.vault.getMarkdownFiles().filter(file => file.path.startsWith('Games/') && this.app.metadataCache.getFileCache(file)?.frontmatter).length === config.count, 180_000);
            results.indexWaitMs = performance.now() - indexing;
            const manager = (this.app as any).plugins;
            await this.stage('plugin startup');
            const startup = performance.now(); await manager.enablePlugin('lorebase');
            const plugin = manager.plugins.lorebase;
            if (!plugin) throw new Error('Lorebase did not load');
            results.pluginEnableMs = performance.now() - startup;
            await sleep(1000);
            const service = plugin.getGameService();
            await this.stage('cold library load');
            service.invalidateCache(); const cold = performance.now(); const items = await service.loadGames();
            results.coldLibraryMs = performance.now() - cold; results.parsedItems = items.length;
            const cached = performance.now(); await service.loadGames(); results.cachedLibraryMs = performance.now() - cached;
            await this.stage('library rendering');
            const opening = performance.now(); await plugin.activateView('game');
            const view = this.app.workspace.getLeavesOfType('lorebase-library-view')[0]?.view as any;
            if (!view) throw new Error('Library view did not open');
            await until(() => view.games?.length === config.count); await frame(); await frame();
            results.openLibraryMs = performance.now() - opening;
            results.renderedCards = view.gridEl?.children.length;
            const filtering: number[] = [];
            for (let i=0; i<10; i++) {
                const start = performance.now();
                service.filterAndSort(items, { ...view.filter, searchTerm: 'Fixture 00001' }, 'name', 'asc');
                filtering.push(performance.now() - start);
            }
            results.filterMedianMs = percentile(filtering, .5); results.filterP95Ms = percentile(filtering, .95);
            await this.stage('scroll frames');
            const scroller: HTMLElement = view.contentEl;
            results.scrollContainerFound = scroller.scrollHeight > scroller.clientHeight;
            const gaps: number[] = []; let previous = await frame();
            for (let i=0; i<120; i++) {
                if (scroller) scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) * (i / 119);
                const now = await frame(); gaps.push(now - previous); previous = now;
            }
            results.scrollFrameMedianMs = percentile(gaps, .5); results.scrollFrameP95Ms = percentile(gaps, .95); results.framesOver33Ms = gaps.filter(ms => ms > 33).length;
            if (scroller) scroller.scrollTop = 0;
            const resize = performance.now(), width = view.containerEl.style.width;
            view.containerEl.style.width = '600px'; view.onResize?.(); await frame(); await frame();
            results.resizeTwoFramesMs = performance.now() - resize; view.containerEl.style.width = width; view.onResize?.();
            await this.stage('statistics');
            const statsStart = performance.now(); const modal = plugin.showStatsModal() as any;
            await until(() => !modal.loading && modal.library?.records?.length === config.count); await frame();
            results.statisticsMs = performance.now() - statsStart; results.statisticsItems = modal.library.records.length; modal.close();
            results.validForeground = !focusLost;
            window.removeEventListener('blur', blur);
            await this.stage('native image decoder'); results.images = await this.images();
            await this.stage('local HLS playback'); results.hls = await this.hls();
            if (config.count === 100) { await this.stage('music import in Obsidian'); results.musicImport = await this.musicImport(plugin); }
            results.complete = true;
            await this.write('results', results); await this.stage('complete');
            await this.app.vault.adapter.write('РЕЗУЛЬТАТЫ.md', '# Benchmark complete\n\n' + config.count + ' synthetic notes. Results are stored in .obsidian/plugins/lorebase-benchmark/results.json.\n');
        } catch (error) { results.error = error instanceof Error ? error.stack : String(error); await this.write('results', results); await this.stage('failed'); }
    }
    private async profile(plugin: any, count: number, label: 'before' | 'after'): Promise<void> {
        const result: Record<string, any> = { count, label, timestamp: new Date().toISOString(), viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio } };
        let focusLost = false;
        const blur = (): void => { focusLost = true; }; window.addEventListener('blur', blur);
        const totals: Record<string, { calls: number; ms: number }> = {};
        const restores: Array<() => void> = [];
        const watch = (target: any, prefix: string, names: string[]): void => {
            for (const name of names) {
                if (!target || typeof target[name] !== 'function') continue;
                const own = Object.prototype.hasOwnProperty.call(target, name), original = target[name];
                const entry = totals[prefix + name] = { calls: 0, ms: 0 };
                target[name] = function(this: unknown, ...args: unknown[]) {
                    const start = performance.now(); entry.calls++;
                    try { return original.apply(this, args); } finally { entry.ms += performance.now() - start; }
                };
                restores.push(() => { if (own) target[name] = original; else delete target[name]; });
            }
        };
        try {
            await this.stage('profile cold load');
            const service = plugin.getGameService(), metadata = plugin.getMetadataService();
            watch(service, 'game.', ['parseGameFromCache']);
            watch(metadata, 'metadata.', ['resolveFrontmatter','getAliases','getNoteTemplate','getPreviousAliases','getImageUrl']);
            service.invalidateCache(); const load = performance.now(); const items = await service.loadGames();
            result.coldLibraryMs = performance.now() - load; result.parsedItems = items.length;
            result.coldFunctions = structuredClone(totals);
            restores.splice(0).reverse().forEach(restore => restore());
            for (const entry of Object.values(totals)) { entry.calls = 0; entry.ms = 0; }
            await plugin.activateView('game');
            const view = this.app.workspace.getLeavesOfType('lorebase-library-view')[0]?.view as any;
            await until(() => view?.games?.length === count); await frame(); await frame();
            const grid = view.virtualGrid;
            if (!grid) throw new Error('Profiling requires the virtualized library');
            const firstCard = grid?.visibleCards?.values().next().value;
            watch(view, 'view.', ['createCard','getEffectiveLayout','refreshGridLayout']);
            watch(grid, 'grid.', ['updateVisibleCards','updateHeaders']);
            watch(grid?.cardCache, 'cache.', ['retain','take']);
            watch(firstCard && Object.getPrototypeOf(firstCard).constructor, 'card.', ['measureOverlay']);
            const scroller: HTMLElement = view.contentEl;
            const scroll = async (frames: number, jump: boolean): Promise<Record<string, number>> => {
                scroller.scrollTop = 0; await frame(); await frame();
                const gaps: number[] = []; let previous = await frame();
                for (let i = 0; i < frames; i++) {
                    scroller.scrollTop = jump ? (scroller.scrollHeight - scroller.clientHeight) * i / (frames - 1) : (i + 1) * 140;
                    const now = await frame(); gaps.push(now - previous); previous = now;
                }
                return { frames, medianMs: percentile(gaps, .5), p95Ms: percentile(gaps, .95), over33Ms: gaps.filter(ms => ms > 33).length };
            };
            await this.stage('profile normal scroll'); result.normalScroll = await scroll(120, false);
            result.normalFunctions = structuredClone(totals);
            for (const entry of Object.values(totals)) { entry.calls = 0; entry.ms = 0; }
            await this.stage('profile jump scroll'); result.jumpScroll = await scroll(60, true);
            result.jumpFunctions = structuredClone(totals);
            restores.splice(0).reverse().forEach(restore => restore());
            scroller.scrollTop = 0;
            await this.stage('profile statistics');
            const start = performance.now(), modal = plugin.showStatsModal() as any;
            await until(() => !modal.loading && modal.library?.records?.length === count); await frame();
            result.statisticsMs = performance.now() - start; result.statisticsItems = modal.library.records.length; modal.close();
            result.viewportChecks = await this.checkViewport(view);
            if (items.length !== count || !result.viewportChecks.complete) throw new Error('Profile library validation failed');
            result.validForeground = !focusLost; result.complete = true;
            await this.write('profile-' + label, result); await this.stage('profile complete');
        } finally { restores.reverse().forEach(restore => restore()); window.removeEventListener('blur', blur); }
    }

    private async checkViewport(view: any): Promise<Record<string, unknown>> {
        const scroller: HTMLElement = view.contentEl;
        const check = (): { visible: number; missing: number; cards: number } => {
            const grid = view.virtualGrid, gridEl: HTMLElement = view.gridEl;
            const top = scroller.getBoundingClientRect().top + scroller.clientTop - gridEl.getBoundingClientRect().top;
            const bottom = top + scroller.clientHeight;
            const height = grid.options.cardHeight, gap = grid.options.gap ?? 16, padding = grid.options.padding ?? 16;
            const positions = grid.positions ?? grid.options.items.map((item: any, i: number) => ({ item, top: padding + Math.floor(i / grid.columns) * (height + gap) }));
            const expected = positions.filter((position: any) => position.top + height > top && position.top < bottom);
            const mounted = new Map([...grid.visibleCards.values()].map((card: any) => [card.getElement().dataset.lorebaseFilePath, card.getElement()]));
            const missing = expected.filter((position: any) => !mounted.has(position.item.filePath)).length;
            return { visible: expected.length, missing, cards: mounted.size };
        };
        scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) * .7;
        view.virtualGrid.updateViewport();
        const immediate = check();
        await sleep(240); await frame();
        const settled = check();
        const oldWidth = view.containerEl.style.width;
        view.containerEl.style.width = '560px'; await sleep(500); await frame();
        const resized = check();
        const measured = view.getEffectiveLayout(), cached = view.cachedLayout;
        const layoutCurrent = cached?.columns === measured.columns && cached?.orientation === measured.orientation
            && cached?.dimensions?.verticalMinWidth === measured.dimensions?.verticalMinWidth;
        view.containerEl.style.width = oldWidth; await sleep(500); await frame();
        const restored = check();
        scroller.scrollTop = 0; view.virtualGrid.updateViewport(); await sleep(240); await frame();
        const complete = [immediate, settled, resized, restored].every(result => result.visible > 0 && result.missing === 0 && result.cards < 150)
            && settled.cards >= immediate.cards && layoutCurrent;
        return { immediate, settled, resized, restored, layoutCurrent, complete };
    }

    private async musicImport(plugin: any): Promise<Record<string, unknown>> {
        const original = plugin.settings.noteImport;
        const folder = 'LegacyMusic'; if (!await this.app.vault.adapter.exists(folder)) await this.app.vault.createFolder(folder);
        const source = '---\ntype: album\ntitle: Bench Album\nperformer: Fixture Artist\nrating: 0\nfavorite: false\nextra: keep\n"label: text": {}\npersonal_grid: [["1e3", "001"], [], {}]\ntracklist:\n  - id: "001"\n    name: Bench Song\n    userRating: 9\n    listened: true\n    extra_track: keep\n---\n\n## My Notes\n\nPersonal text\n```md\n## Example\n```\n';
        const path = folder + '/Album.md'; if (await this.app.vault.adapter.exists(path)) return { previouslyRun: true };
        const file = await this.app.vault.create(path, source);
        await until(() => Boolean(this.app.metadataCache.getFileCache(file)?.frontmatter));
        try {
            plugin.settings.noteImport = { ...structuredClone(original), sourceFolderPath: folder, targetMedia: 'auto', writeMode: 'copy' };
            const preview = await plugin.noteConversionService.preview(plugin.settings), item = preview.items[0];
            if (item.targetMedia !== 'music' || !item.canImport) throw new Error('Music preview failed');
            const applied = await plugin.noteConversionService.apply(plugin.settings, new Set([item.id]));
            await until(() => { const target = this.app.vault.getAbstractFileByPath(item.targetPath); return Boolean(target && this.app.metadataCache.getFileCache(target as any)?.frontmatter?.lorebase_import_source); });
            const target = this.app.vault.getAbstractFileByPath(item.targetPath) as any;
            const metadata = this.app.metadataCache.getFileCache(target)!.frontmatter!;
            const repeat = await plugin.noteConversionService.preview(plugin.settings);
            const parsed = plugin.getMusicService().parseFromCache(target);
            return { applied, parsedKind: parsed?.musicKind, artist: parsed?.artist, stableTrackId: parsed?.tracks[0]?.id,
                trackRating: parsed?.tracks[0]?.userRating, unknownFieldsPreserved: metadata.extra === 'keep' && metadata.tracks[0].extra_track === 'keep',
                personalTextPreserved: (await this.app.vault.read(target)).includes('Personal text\n```md\n## Example\n```'),
                nestedYamlPreserved: JSON.stringify(metadata.personal_grid) === JSON.stringify([['1e3','001'],[],{}]) && JSON.stringify(metadata['label: text']) === '{}',
                sourceUnchanged: await this.app.vault.read(file) === source, repeatSkipped: repeat.items[0].canImport === false };
        } finally { plugin.settings.noteImport = original; }
    }
    private async images(): Promise<Record<string, unknown>> {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 8;
        canvas.getContext('2d')!.fillRect(0,0,8,8); const formats: Record<string, boolean> = {};
        for (const [mime, extension] of [['image/png','png'],['image/jpeg','jpg'],['image/webp','webp']]) {
            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mime));
            if (!blob || blob.type !== mime) throw new Error('Native encoder unavailable: ' + mime);
            await validateCoverImage(await blob.arrayBuffer(), extension); formats[extension] = true;
        }
        const gif = Uint8Array.from(atob('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='), char => char.charCodeAt(0));
        await validateCoverImage(gif.buffer, 'gif'); formats.gif = true;
        let rejected = false; try { await validateCoverImage(onePixelPng().slice(0,-3), 'png'); } catch { rejected = true; }
        return { formats, truncatedPngRejected: rejected };
    }
    private async hls(): Promise<Record<string, unknown>> {
        const start = performance.now(); const { default: Player } = await import('hls.js'); const moduleMs = performance.now() - start;
        if (!Player.isSupported()) return { moduleMs, supported: false };
        const segment = Buffer.from(await this.app.vault.adapter.readBinary('BenchMedia/segment.ts'));
        const server = createServer((request, response) => {
            response.setHeader('Access-Control-Allow-Origin', '*');
            if (request.url === '/clip.m3u8') { response.setHeader('Content-Type','application/vnd.apple.mpegurl'); response.end('#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:12\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:10,\nsegment.ts\n#EXT-X-ENDLIST\n'); }
            else if (request.url === '/segment.ts') { response.setHeader('Content-Type','video/mp2t'); response.end(segment); }
            else { response.statusCode = 404; response.end(); }
        });
        await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
        const address = server.address(); if (!address || typeof address === 'string') throw new Error('Local media server failed');
        const video = document.createElement('video'); video.muted = true; video.autoplay = true; video.style.cssText = 'position:fixed;right:8px;bottom:8px;width:320px;z-index:9999'; document.body.appendChild(video);
        const player = new Player({ enableWorker: false });
        try {
            const load = performance.now();
            const decoded = new Promise<void>((resolve,reject) => {
                const timer = setTimeout(() => reject(new Error('Local HLS playback timeout')),20_000);
                video.addEventListener('loadeddata',()=>{clearTimeout(timer);resolve();},{once:true});
                player.on(Player.Events.ERROR,(_event,data)=>{if(data.fatal){clearTimeout(timer);reject(new Error(data.details));}});
            });
            player.attachMedia(video); player.loadSource('http://127.0.0.1:' + address.port + '/clip.m3u8'); void video.play().catch(()=>{});
            await decoded;
            const firstFrameMs = performance.now() - load;
            const root = document.body.createDiv(); root.style.cssText = 'position:fixed;right:8px;bottom:8px;width:320px;z-index:9999';
            const url = 'http://127.0.0.1:' + address.port + '/clip.m3u8';
            const stop = renderGalleryTrailers(root, [{ title: 'Local HLS fixture', url, playback: { kind: 'hls', url } }]);
            let stopped = false; const cleanup = (): void => { if (!stopped) { stopped = true; stop(); } };
            let galleryFirstFrameMs: number, galleryStopped: boolean;
            try {
                const start = performance.now(); root.querySelector<HTMLButtonElement>('.lorebase-poster-gallery-play')!.click();
                const galleryVideo = root.querySelector('video')!; galleryVideo.muted = true;
                await until(() => galleryVideo.readyState >= 2, 20_000); galleryFirstFrameMs = performance.now() - start;
                cleanup(); galleryStopped = galleryVideo.paused && !galleryVideo.hasAttribute('src');
            } finally { cleanup(); root.remove(); }
            return { moduleMs, firstFrameMs, galleryFirstFrameMs, galleryStopped, supported: true, width: video.videoWidth, height: video.videoHeight, bytes: segment.length, version: Player.version };
        } finally { player.destroy(); video.pause(); video.removeAttribute('src'); video.load(); video.remove(); server.close(); }
    }
}
