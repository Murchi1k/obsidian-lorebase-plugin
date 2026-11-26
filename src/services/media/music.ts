import type { MusicItem, MusicStatus, MusicTrack } from '../../types';
import { isCustomStatus } from '../../statusPresentation';

/** Preserve band names; split guest lists only after an explicit feature marker. */
export function trackArtistNames(track: Pick<MusicTrack, 'artist' | 'artists' | 'title'>, albumArtist = ''): string[] {
    const feature = /\s+(?:feat\.?|ft\.?|featuring|при\s+уч\.)\s+/i;
    const split = (value: string) => value.split(/\s*[,;]\s*/).map(name => name.trim()).filter(Boolean);
    const guestNames = (value: string) => value.split(/\s*[,;]\s*|\s+(?:&|and|и|x)\s+/i);
    const parts = (track.artist || albumArtist).split(feature);
    const names = track.artists?.length ? [...track.artists] : split(parts[0]);
    names.push(...parts.slice(1).flatMap(guestNames));
    const titleGuests = track.title.match(/(?:\(|\[|\s[-–—]\s|\s)(?:feat\.?|ft\.?|featuring|при\s+уч\.)\s+([^\)\]]+)/i);
    if (titleGuests) names.push(...guestNames(titleGuests[1]));
    return [...new Map(names.map(name => name.trim()).filter(Boolean).map(name => [name.normalize('NFKC').toLocaleLowerCase(), name])).values()];
}

/** The inline feat. credit lists guests, without repeating the album's main artist. */
export function trackGuestNames(track: Pick<MusicTrack, 'artist' | 'artists' | 'title'>, albumArtist = ''): string[] {
    const mainCredit = (albumArtist.trim() || track.artist).split(/\s+(?:feat\.?|ft\.?|featuring|при\s+уч\.)\s+/i)[0];
    const identity = (name: string) => name.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
    const main = new Set(mainCredit.split(/\s*[,;]\s*/).map(identity));
    return trackArtistNames(track, albumArtist).filter(name => !main.has(identity(name)));
}

/** Derive filter choices from stored artist credits, including album track credits. */
export function musicCredits(item: { artist?: string; musicKind?: string; tracks?: { artist: string }[] }): { artists: string[]; guests: string[] } {
    const split = (value: string): string[] => value.split(/\s*[,;]\s*|\s+(?:&|x)\s+/i).map(v => v.trim()).filter(Boolean);
    const parse = (value: string): { main: string[]; guests: string[] } => {
        const [main, ...guests] = value.split(/\s+(?:feat\.?|ft\.?|featuring|при уч\.)\s+/i);
        return { main: split(main), guests: guests.flatMap(split) };
    };
    const unique = (values: string[]): string[] => [...new Map(values.map(value => [value.toLocaleLowerCase(), value])).values()];
    const own = parse(item.artist || '');
    const tracks = item.musicKind === 'album' ? (item.tracks || []).map(track => parse(track.artist)) : [];
    const primary = new Set(own.main.map(value => value.toLocaleLowerCase()));
    return {
        artists: unique([...own.main, ...own.guests, ...tracks.flatMap(track => [...track.main, ...track.guests])]),
        guests: unique([...own.guests, ...tracks.flatMap(track => [...track.guests,
            ...track.main.filter(value => primary.size > 0 && !primary.has(value.toLocaleLowerCase()))])]),
    };
}

export const MUSIC_STATUSES: MusicStatus[] = ['planned', 'listening', 'completed', 'paused', 'dropped', 'on_repeat', 'to_be_released'];
export function musicStatus(value: unknown): MusicStatus {
    return MUSIC_STATUSES.includes(value as MusicStatus) || isCustomStatus(value) ? value as MusicStatus : 'planned';
}
export function durationSeconds(value: unknown): number | null {
    if (value === '' || value == null) return null;
    const text = String(value).trim();
    if (/^\d+:\d{2}$/.test(text)) {
        const [minutes, seconds] = text.split(':').map(Number);
        return seconds < 60 ? minutes * 60 + seconds : null;
    }
    const number = Number(text);
    return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}
export function formatDuration(value: number | null): string {
    if (value == null || !Number.isFinite(value)) return '';
    return `${Math.floor(value / 60)}:${String(Math.round(value) % 60).padStart(2, '0')}`;
}
/** Album totals are reading time, while individual songs retain m:ss. */
export function formatMusicTotal(value: number | null, locale = 'en'): string {
    if (value === null || !Number.isFinite(value) || value < 0) return '';
    const minutes = Math.max(value > 0 ? 1 : 0, Math.floor(value / 60));
    const unit = (n: number, name: 'hour' | 'minute') => new Intl.NumberFormat(locale, { style: 'unit', unit: name, unitDisplay: 'short' }).format(n);
    return minutes >= 60 ? `${unit(Math.floor(minutes / 60), 'hour')} ${unit(minutes % 60, 'minute')}` : unit(minutes, 'minute');
}
export function normalizeMusicTracks(value: unknown): MusicTrack[] {
    if (!Array.isArray(value)) return [];
    const ids = new Set<string>();
    return value.filter((v) => v && typeof v === 'object' && !Array.isArray(v)).map((v, index) => {
        let id = String(v.id || `track-${index + 1}`);
        while (ids.has(id)) id += `-${index + 1}`;
        ids.add(id);
        const rating = Number(v.userRating);
        return {
            id, title: String(v.title ?? ''), artist: String(v.artist ?? ''),
            artists: Array.isArray(v.artists) ? [...new Set<string>(v.artists.filter((name: unknown): name is string => typeof name === 'string' && !!name.trim()).map((name: string) => name.trim()))] : undefined,
            deezerArtistIds: v.deezerArtistIds && typeof v.deezerArtistIds === 'object' && !Array.isArray(v.deezerArtistIds)
                ? Object.fromEntries(Object.entries(v.deezerArtistIds).filter(([name, id]) => name.trim() && typeof id === 'string' && /^\d+$/.test(id))) as Record<string, string> : undefined,
            duration: durationSeconds(v.duration ?? v.length), disc: Math.max(1, Math.floor(Number(v.disc) || 1)),
            listened: v.listened === true, favorite: v.favorite === true,
            userRating: v.userRating != null && Number.isFinite(rating) && rating >= 1 && rating <= 10 ? rating : null,
            recordingId: typeof v.recordingId === 'string' ? v.recordingId : undefined,
            deezerId: typeof v.deezerId === 'string' && /^\d+$/.test(v.deezerId) ? v.deezerId : undefined,
        };
    });
}
/** Auto-complete an album without replacing the user's explicit repeat state. */
export function statusAfterTrackChange(status: MusicStatus, tracks: MusicTrack[]): MusicStatus {
    if (isCustomStatus(status) || status === 'on_repeat' || !tracks.length) return status;
    if (tracks.length > 0 && tracks.every((track) => track.listened)) return 'completed';
    if (status === 'completed') return tracks.some((track) => track.listened) ? 'listening' : 'planned';
    if (status === 'planned' && tracks.some((track) => track.listened)) return 'listening';
    return status;
}
export function musicProgress(item: MusicItem): string {
    return item.musicKind === 'album' && item.tracks.length
        ? `${item.tracks.filter((track) => track.listened).length} / ${item.tracks.length}` : '';
}

/** Keep track order within each disc; ids, rather than positions, identify songs. */
export function musicTrackGroups(tracks: readonly MusicTrack[]): { disc: number; tracks: MusicTrack[] }[] {
    const groups = new Map<number, MusicTrack[]>();
    for (const track of tracks) {
        const group = groups.get(track.disc) ?? [];
        group.push(track);
        groups.set(track.disc, group);
    }
    return Array.from(groups, ([disc, tracks]) => ({ disc, tracks })).sort((a, b) => a.disc - b.disc);
}

export function musicTrackSummary(tracks: readonly MusicTrack[]) {
    return {
        total: tracks.length,
        listened: tracks.filter(track => track.listened).length,
        duration: tracks.length && tracks.every(track => track.duration !== null)
            ? tracks.reduce((total, track) => total + (track.duration ?? 0), 0) : null,
    };
}
