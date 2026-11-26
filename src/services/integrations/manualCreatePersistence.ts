import { discoveryFrontmatter } from '../../utils/discovery';
import type { ManualCreateDraft } from '../../modals/ManualCreateModal';
import type { AnimeStatus, MediaType } from '../../types';
import { normalizeCountry } from '../../utils/mediaWorkType';
import { normalizeRepeatCount, totalPlatformRepeats } from '../../utils/repeatTracking';
import { upsertMarkdownSection } from '../markdownSections';
import { parseTemplateFieldAliases } from '../media/templateFieldAliases';
import { formatTemplateWikilinks, getWikilinkTemplateKeys } from './templateValues';
import { readRootYamlKey } from './templateSchema';
import { toAnimePartsFrontmatter, toMangaPartsFrontmatter, toVideoPartsFrontmatter } from './enrichment';

/** Manual fields must survive reduced/custom templates as well as the default template. */
export function completeManualContent(content: string, draft: ManualCreateDraft, template: string): string {
    const media = ({ games: 'game', anime: 'anime', movies: 'movie', series: 'series', books: 'book', manga: 'manga' } as const)[draft.kind] as MediaType;
    const aliases = parseTemplateFieldAliases(media, template);
    const wikilinkKeys = getWikilinkTemplateKeys(template);
    const fields: Record<string, unknown> = {
        type: media, [media === 'game' ? 'name' : 'title']: draft.title,
        [media === 'anime' ? 'image' : 'poster']: draft.poster,
        [media === 'anime' ? 'image_b' : 'poster_b']: draft.posterHorizontal || draft.poster,
        year: Number(draft.year) || null, released: draft.released || null,
        plot: draft.description ?? '', genres: draft.genres, tags: draft.tags,
        status: draft.status, [media === 'game' ? 'userRating' : 'rating']: draft.rating,
        favorite: draft.favorite ?? false, started: draft.started || null, finished: draft.finished || null,
        url: draft.url,
    };
    if (['games', 'movies', 'series', 'manga'].includes(draft.kind)) fields.work_type = draft.workType;
    if (draft.kind === 'anime') fields.country_of_origin = normalizeCountry(draft.countryOfOrigin);
    if (draft.discovery) fields.discovery_context = discoveryFrontmatter(draft.discovery);
    if (draft.detailedRatings !== undefined) fields.detailed_ratings = draft.detailedRatings;
    if (draft.relatedMedia?.length) fields.related_media = draft.relatedMedia.map(({ type, path, title }) => ({ type, path, title }));
    if (draft.kind !== 'books') fields.repeat_count = normalizeRepeatCount(draft.repeatCount) + (draft.kind === 'games' ? totalPlatformRepeats(draft.platformPlaythroughs ?? []) : 0);
    if (['games', 'anime', 'manga'].includes(draft.kind)) fields.Sex18 = draft.isAdult ?? false;
    if (draft.kind === 'games') Object.assign(fields, {
        gameSeries: draft.gameSeries, platforms: draft.platforms ?? [], developers: draft.developers ?? [], publishers: draft.publishers ?? [],
        platform_playthroughs: (draft.platformPlaythroughs ?? []).map(entry => ({ platform: entry.platform, selected: entry.selected, repeat_count: entry.repeatCount })),
        played_on: draft.platformPlaythroughs?.find(entry => entry.selected)?.platform ?? '',
    });
    if (draft.kind === 'anime' || draft.kind === 'series') fields.studios = draft.studios ?? [];
    if (draft.kind === 'anime') {
        const part = draft.animeParts.find(part => part.id === draft.activeAnimePartId) ?? draft.animeParts[0];
        Object.assign(fields, { anime_parts: toAnimePartsFrontmatter(draft.animeParts), active_part_id: part?.id ?? '', format: part?.kind ?? draft.format,
            season_current: part?.seasonNumber ?? draft.seasonNumber, episode_current: part?.episodeCurrent ?? draft.episodeCurrent, episode_total: part?.episodeTotal ?? draft.episodeTotal });
    }
    if (draft.kind === 'series' || draft.kind === 'movies') {
        const parts = draft.videoParts?.length ? draft.videoParts : [{ id: draft.kind === 'series' ? 'season-1' : 'movie-1', kind: draft.kind === 'series' ? 'season' as const : 'movie' as const, title: draft.title, seasonNumber: draft.kind === 'series' ? draft.seasonNumber ?? 1 : null,
            episodeCurrent: draft.episodeCurrent, episodeTotal: draft.episodeTotal, status: draft.status as AnimeStatus }];
        const part = parts.find(part => part.id === draft.activeVideoPartId) ?? parts[0];
        Object.assign(fields, { [draft.kind === 'series' ? 'series_parts' : 'movie_parts']: toVideoPartsFrontmatter(parts), active_part_id: part.id,
            episode_current: part.episodeCurrent, episode_total: part.episodeTotal });
        if (draft.kind === 'series') fields.seasons = Math.max(1, ...parts.map(part => part.seasonNumber ?? 0));
    }
    if (draft.kind === 'movies' || draft.kind === 'series') Object.assign(fields, {
        director: draft.directors ?? [], actors: draft.actors ?? [], runtime: draft.runtime ?? '',
        ...(draft.kind === 'series' ? { networks: draft.networks ?? [] } : {}),
    });
    if (draft.kind === 'books' || draft.kind === 'manga') Object.assign(fields, {
        authors: draft.authors ?? [], chapter_current: draft.chapterCurrent, chapter_total: draft.chapterTotal,
        ...(draft.kind === 'books' ? { publisher: draft.publisher ?? '', page_current: draft.pageCurrent, page_total: draft.pageTotal }
            : { artists: draft.artists ?? [], volume_current: draft.volumeCurrent, volume_total: draft.volumeTotal }),
    });
    if (draft.kind === 'manga') {
        const number = draft.volumeCurrent ?? 1;
        fields.active_part_id = `volume-${number}`;
        fields.manga_parts = toMangaPartsFrontmatter([{ id: `volume-${number}`, kind: 'volume', title: `Volume ${number}`, volumeNumber: number, chapterCurrent: draft.chapterCurrent, chapterTotal: draft.chapterTotal, status: draft.status as AnimeStatus }]);
    }
    // JSON scalars/arrays are valid YAML. Replacing only matching top-level blocks preserves
    // custom template fields, comments, and the Markdown body without a YAML round trip.
    const match = content.match(/^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n---)(?=\r?\n|$)/);
    if (!match) return content;
    let yaml = match[2];
    for (const [canonical, value] of Object.entries(fields)) {
        const key = aliases[canonical] || canonical;
        const yamlKey = /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : JSON.stringify(key);
        const formatted = wikilinkKeys.has(key) ? formatTemplateWikilinks(value) : value;
        const line = `${yamlKey}: ${JSON.stringify(formatted ?? null)}`;
        const lines = yaml.split(/\r?\n/);
        const index = lines.findIndex(line => readRootYamlKey(line) === key);
        if (index < 0) lines.push(line);
        else {
            let end = index + 1;
            while (end < lines.length && (/^[ \t]+/.test(lines[end]) || !lines[end].trim() || /^-\s/.test(lines[end]))) end++;
            lines.splice(index, end - index, line);
        }
        yaml = lines.join('\n');
    }
    content = match[1] + yaml + match[3] + content.slice(match[0].length);
    return draft.myNotes?.trim() ? upsertMarkdownSection(content, undefined, draft.myNotes) : content;
}
