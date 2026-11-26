import { CatalogReferenceError } from '../../localization/catalogReference';
import type { ProviderId, TemplateKind } from './types';
import type { MusicKind } from '../../types';
import type { MusicProvider } from './providers/music';
import { comicVineIdFromPath, normalizeComicVineId } from './providers/comicvine';

export type ReferenceProvider = Exclude<ProviderId, 'jikan'> | MusicProvider;
export interface CatalogReference {
    provider: ReferenceProvider;
    id: string;
    media?: TemplateKind;
    videoKind?: 'movie' | 'series';
    musicKind?: MusicKind;
    slug?: boolean;
    artist?: string;
    title?: string;
}
export interface ReferenceContext { kind: TemplateKind; provider?: string; musicKind?: MusicKind }
const aliases: Record<string, ReferenceProvider> = {
    steam: 'steam', rawg: 'rawg', igdb: 'igdb', vndb: 'vndb', anilist: 'anilist', kitsu: 'kitsu',
    shikimori: 'shikimori', shiki: 'shikimori', tmdb: 'tmdb', tvmaze: 'tvmaze', imdb: 'omdb', omdb: 'omdb',
    hardcover: 'hardcover', googlebooks: 'googlebooks', openlibrary: 'openlibrary', ol: 'openlibrary', gbooks: 'googlebooks', mangaupdates: 'mangaupdates', mu: 'mangaupdates',
    mangadex: 'mangadex', md: 'mangadex', musicbrainz: 'musicbrainz', mb: 'musicbrainz', deezer: 'deezer', lastfm: 'lastfm',
    comicvine: 'comicvine',
};
const numeric = /^[1-9]\d{0,19}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slug = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/i;
const videoTypes: Record<string, 'movie' | 'series'> = { movie: 'movie', movies: 'movie', film: 'movie', tv: 'series', series: 'series' };
const musicTypes: Record<string, MusicKind> = { album: 'album', release: 'album', track: 'track', recording: 'track' };
const providerMedia: Record<ReferenceProvider, TemplateKind[]> = {
    steam: ['games'], rawg: ['games'], igdb: ['games'], vndb: ['games'],
    anilist: ['anime', 'manga'], kitsu: ['anime'], shikimori: ['anime', 'manga'],
    tmdb: ['movies', 'series', 'anime'], tvmaze: ['series', 'anime'], omdb: ['movies', 'series', 'anime'],
    hardcover: ['books'], googlebooks: ['books'], openlibrary: ['books'], mangaupdates: ['manga'], mangadex: ['manga'],
    comicvine: ['manga'],
    musicbrainz: ['music'], deezer: ['music'], lastfm: ['music'],
};

function check(ref: CatalogReference, context: ReferenceContext): CatalogReference {
    if (!providerMedia[ref.provider].includes(context.kind) || ref.media && ref.media !== context.kind) throw new CatalogReferenceError('wrongMedia');
    if (ref.videoKind && context.kind !== 'anime' && (ref.videoKind === 'movie' ? context.kind !== 'movies' : context.kind !== 'series')) throw new CatalogReferenceError('wrongMedia');
    if (context.kind === 'music' && ref.musicKind && ref.musicKind !== (context.musicKind ?? 'album')) throw new CatalogReferenceError('musicKind');
    if (ref.provider === 'tmdb' && !ref.videoKind) {
        if (context.kind === 'anime') throw new CatalogReferenceError('videoKind');
        ref.videoKind = context.kind === 'movies' ? 'movie' : 'series';
    }
    if (ref.provider === 'tvmaze') ref.videoKind = 'series';
    if (context.kind === 'music') ref.musicKind ??= context.musicKind ?? 'album';
    return ref;
}
function byId(provider: ReferenceProvider, raw: string, context: ReferenceContext, hints: Partial<CatalogReference> = {}): CatalogReference {
    const id = raw.trim();
    if (!id || id.length > 200) throw new CatalogReferenceError('invalid');
    if (provider === 'comicvine') {
        const comicId = normalizeComicVineId(id);
        if (!comicId) throw new CatalogReferenceError('invalid');
        return check({ provider, id: comicId }, context);
    }
    const valid = provider === 'mangadex' || provider === 'musicbrainz' ? uuid.test(id)
        : provider === 'omdb' ? /^tt\d{5,12}$/i.test(id)
            : provider === 'vndb' ? /^v[1-9]\d*$/i.test(id)
                : provider === 'openlibrary' ? /^OL[1-9]\d*[WM]$/i.test(id)
                : provider === 'googlebooks' ? /^[\w-]+$/.test(id)
                    : hints.slug ? slug.test(id) : numeric.test(id);
    if (!valid) throw new CatalogReferenceError('invalid');
    return check({ provider, id: provider === 'openlibrary' ? id.toUpperCase() : ['mangadex', 'musicbrainz', 'omdb', 'vndb'].includes(provider) ? id.toLowerCase() : id, ...hints }, context);
}
function lastfm(artist: string, title: string, kind: MusicKind, context: ReferenceContext): CatalogReference {
    if (!artist.trim() || !title.trim() || artist.length > 500 || title.length > 500) throw new CatalogReferenceError('invalid');
    return check({ provider: 'lastfm', id: JSON.stringify([artist, title]), artist, title, musicKind: kind }, context);
}
function base36(value: string): string {
    if (!/^[a-z0-9]{1,13}$/i.test(value)) throw new CatalogReferenceError('invalid');
    // Decimal string arithmetic keeps catalog identities intact beyond Number.MAX_SAFE_INTEGER.
    let digits = [0];
    for (const char of value.toLowerCase()) {
        let carry = parseInt(char, 36);
        digits = digits.map(digit => { const next = digit * 36 + carry; carry = Math.floor(next / 10); return next % 10; });
        while (carry) { digits.push(carry % 10); carry = Math.floor(carry / 10); }
    }
    return digits.reverse().join('').replace(/^0+(?=\d)/, '');
}

/** Pure parsing only. Pasted hosts are never fetched; callers use their existing catalog APIs. */
export function parseCatalogReference(input: string, context: ReferenceContext): CatalogReference | null {
    const value = input.trim();
    if (!value) return null;
    if (/^title:/i.test(value)) return null;
    if (/^https?:\/\//i.test(value) || /^(?:www\.)?[\w-]+\.[a-z]{2,}(?:\/|\?)/i.test(value)) {
        let url: URL;
        try { url = new URL(/^https?:\/\//i.test(value) ? value : 'https://' + value); }
        catch { throw new CatalogReferenceError('invalid'); }
        if (url.username || url.password || url.port) throw new CatalogReferenceError('unsupported');
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        let parts: string[];
        try { parts = url.pathname.split('/').filter(Boolean).map(part => decodeURIComponent(host === 'last.fm' ? part.replace(/\+/g, ' ') : part)); }
        catch { throw new CatalogReferenceError('invalid'); }
        const [type, id] = parts;
        if ((host === 'store.steampowered.com' || host === 'steamcommunity.com') && type === 'app') return byId('steam', id ?? '', context);
        if (host === 'themoviedb.org' && (type === 'movie' || type === 'tv')) return byId('tmdb', (id ?? '').split('-')[0], context, { videoKind: type === 'movie' ? 'movie' : 'series' });
        if (host === 'anilist.co' && (type === 'anime' || type === 'manga')) return byId('anilist', id ?? '', context, { media: type });
        if (['shikimori.one', 'shikimori.me', 'shikimori.org'].includes(host) && (type === 'animes' || type === 'mangas')) {
            return byId('shikimori', (id ?? '').match(/^[a-z]*([1-9]\d*)(?:-|$)/i)?.[1] ?? '', context, { media: type === 'animes' ? 'anime' : 'manga' });
        }
        if (host === 'tvmaze.com' && type === 'shows') return byId('tvmaze', id ?? '', context);
        if (host === 'imdb.com' && type === 'title') return byId('omdb', id ?? '', context);
        if (host === 'rawg.io' && type === 'games') return byId('rawg', id ?? '', context, { slug: !numeric.test(id ?? '') });
        if (host === 'igdb.com' && type === 'games') return byId('igdb', id ?? '', context, { slug: !numeric.test(id ?? '') });
        if (host === 'openlibrary.org' && (type === 'works' || type === 'books')) return byId('openlibrary', id ?? '', context);
        if (host === 'hardcover.app' && type === 'books') return byId('hardcover', id ?? '', context, { slug: !numeric.test(id ?? '') });
        if (['kitsu.io', 'kitsu.app'].includes(host) && type === 'anime') return byId('kitsu', id ?? '', context, { media: 'anime', slug: !numeric.test(id ?? '') });
        if (host === 'vndb.org' && /^v\d+$/i.test(type ?? '')) return byId('vndb', type, context);
        if (/^books\.google\.(?:com|[a-z]{2}|com\.[a-z]{2}|co\.[a-z]{2})$/.test(host)) {
            const volume = url.searchParams.get('id') ?? (parts[0] === 'books' && parts[1] === 'edition' ? parts[3] : '');
            return byId('googlebooks', volume ?? '', context);
        }
        if (host === 'mangadex.org' && type === 'title') return byId('mangadex', id ?? '', context);
        if (host === 'comicvine.gamespot.com' || host === 'comicvine.com') {
            return byId('comicvine', comicVineIdFromPath(url.pathname) ?? '', context);
        }
        if (host === 'mangaupdates.com') {
            if (type === 'series.html') throw new CatalogReferenceError('legacyMu');
            if (type === 'series') return byId('mangaupdates', base36(id ?? ''), context);
        }
        if (host === 'musicbrainz.org' && (type === 'release' || type === 'recording')) return byId('musicbrainz', id ?? '', context, { musicKind: type === 'release' ? 'album' : 'track' });
        if (host === 'deezer.com') {
            const offset = /^[a-z]{2}(?:-[a-z]{2})?$/i.test(type ?? '') ? 1 : 0;
            const entity = parts[offset];
            if (entity === 'album' || entity === 'track') return byId('deezer', parts[offset + 1] ?? '', context, { musicKind: entity });
        }
        if (host === 'last.fm' && type === 'music' && parts.length >= 3) {
            if (parts[2] === '_' && parts.length === 4) return lastfm(parts[1], parts[3], 'track', context);
            if (parts.length === 3 && !parts[2].startsWith('+')) return lastfm(parts[1], parts[2], 'album', context);
        }
        throw new CatalogReferenceError('unsupported');
    }
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) throw new CatalogReferenceError('unsupported');
    const prefixed = /^([a-z]+):\s*(.*)$/i.exec(value);
    const provider = prefixed && aliases[prefixed[1].toLowerCase()];
    if (provider && prefixed) {
        let id = prefixed[2].trim(); const hints: Partial<CatalogReference> = {};
        const typed = /^([a-z]+):(.+)$/i.exec(id);
        if (typed && (provider === 'tmdb' || provider === 'omdb') && videoTypes[typed[1].toLowerCase()]) {
            hints.videoKind = videoTypes[typed[1].toLowerCase()]; id = typed[2];
        } else if (typed && (provider === 'anilist' || provider === 'shikimori') && ['anime', 'manga'].includes(typed[1].toLowerCase())) {
            hints.media = typed[1].toLowerCase() as 'anime' | 'manga'; id = typed[2];
        } else if (typed && ['musicbrainz', 'deezer'].includes(provider) && musicTypes[typed[1].toLowerCase()]) {
            hints.musicKind = musicTypes[typed[1].toLowerCase()]; id = typed[2];
        }
        if (provider === 'lastfm') { const pair = id.split('|'); if (pair.length !== 2) throw new CatalogReferenceError('invalid'); return lastfm(pair[0].trim(), pair[1].trim(), context.musicKind ?? 'album', context); }
        if (provider === 'omdb' && /^\d+$/.test(id)) id = 'tt' + id;
        if (provider === 'vndb' && numeric.test(id)) id = 'v' + id;
        if (['rawg', 'igdb', 'hardcover', 'kitsu'].includes(provider) && !numeric.test(id)) hints.slug = true;
        return byId(provider, id, context, hints);
    }
    if (/^OL[1-9]\d*[WM]$/i.test(value)) return byId('openlibrary', value.toUpperCase(), context);
    if (/^tt\d{5,12}$/i.test(value)) return byId('omdb', value, context);
    if (/^v[1-9]\d*$/i.test(value) && context.kind === 'games') return byId('vndb', value, context);
    if (context.provider === 'comicvine' && /^40(?:00|50)-\d+$/.test(value)) return byId('comicvine', value, context);
    if (/^\d+$/.test(value) || uuid.test(value) && ['mangadex', 'musicbrainz'].includes(context.provider ?? '')) {
        const selected = context.provider && aliases[context.provider];
        if (!selected) throw new CatalogReferenceError('invalid');
        return byId(selected, selected === 'omdb' ? 'tt' + value : selected === 'vndb' ? 'v' + value : value, context);
    }
    return null;
}
