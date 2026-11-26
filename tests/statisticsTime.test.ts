import { describe, expect, it } from 'vitest';
import { statisticsTimeByMedia } from '../src/services/media/statisticsTime';
import { makeStatRecord } from '../src/services/media/statistics';
import type { MediaItem, MediaType } from '../src/types';

function record(type: MediaType, patch: Record<string, unknown> = {}) {
    return makeStatRecord({ type, filePath: type + '.md', displayName: type, status: 'completed', genres: [], tags: [], favorite: false, userRating: null, rawFields: {}, parts: [], tracks: [], artist: '', musicKind: 'album', ...patch } as unknown as MediaItem);
}
describe('time separated by media and data source', () => {
    it('keeps game minutes, anime, series and film estimates separate, using sparse episodes and exact runtimes', () => {
        const groups=statisticsTimeByMedia([
            record('game',{playtimeMinutes:123}),
            record('anime',{parts:[{episodeCurrent:99,episodeTotal:3,watchedEpisodes:[1,3],episodeDuration:20,episodeDetails:[{number:1,duration:10},{number:3,duration:40}]}]}),
            record('series',{episodeCurrent:2,episodeTotal:10,runtime:'45'}),
            record('movie',{runtime:'120'}),
        ]);
        expect(groups.map(group=>[group.type,group.minutes])).toEqual([['game',123],['anime',50],['movie',120],['series',90]]);
        expect(groups.find(group=>group.type==='anime')?.episodeCount).toBe(2);
        expect(groups.find(group=>group.type==='series')?.remaining).toBe(0);
    });
    it('keeps missing time unknown, and reading progress in pages instead of fabricated hours', () => {
        const groups=statisticsTimeByMedia([record('game'),record('book',{pageCurrent:30,pageTotal:300}),record('manga',{chapterCurrent:10,chapterTotal:null})]);
        expect(groups[0]).toMatchObject({minutes:null,known:0,unknown:1});
        expect(groups.find(group=>group.type==='book')).toMatchObject({minutes:null,current:30,total:300,reading:true});
        expect(groups.find(group=>group.type==='manga')).toMatchObject({minutes:null,current:10,total:null,unknown:1});
    });
    it('does not double-count a listened album track extracted into a separate note', () => {
        const track={id:'one',title:'Song',duration:180,listened:true,artist:'A',favorite:false,userRating:null,disc:1};
        const groups=statisticsTimeByMedia([record('music',{filePath:'album.md',tracks:[track]}),record('music',{filePath:'song.md',musicKind:'track',duration:180,parentAlbum:'album.md',parentTrackId:'one'})]);
        expect(groups[0].minutes).toBe(3);
        expect(groups[0].trackCount).toBe(1);
    });
});
