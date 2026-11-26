import { mergeProviderMetadata } from '../src/services/integrations/enrichment';
import { describe, expect, it, vi } from 'vitest';
import { inspectPartCatalog, applyContinuations, catalogSource } from '../src/services/media/partCatalog';
import { IntegrationService } from '../src/services/IntegrationService';
import { DEFAULT_SETTINGS } from '../src/constants';
import { createMockApp } from './helpers/testHelpers';
import type { AnimePart, AnimeItem } from '../src/types';
const season = (id:string, extra:Partial<AnimePart>={}):AnimePart => ({id,kind:'tv',title:id,seasonNumber:null,episodeTotal:12,episodeCurrent:0,status:'planned',...extra});
const source='anilist:154587:anime';
const all=[season('anilist-1'),season('anilist-2'),season('anilist-3',{kind:'ona'}),season('anilist-4',{kind:'special'}),season('anilist-5',{kind:'ona'})];
const old=all.slice(0,2).map(part=>({...part,status:'completed' as const,episodeCurrent:12,watchedEpisodes:Array.from({length:12},(_,i)=>i+1),userRating:8}));
const baseline=inspectPartCatalog(source,all,old).catalog;
describe('continuation history',()=>{
    it('does not label three previously excluded Frieren extras as new on subsequent scans or auto-fill',async()=>{
        expect(inspectPartCatalog(source,all,old,baseline).candidates).toEqual([]);
        const service=new IntegrationService(createMockApp({}),()=>structuredClone(DEFAULT_SETTINGS));
        const review=vi.spyOn(service as any,'reviewAnimeParts');
        const item={type:'anime',integrationProvider:'anilist',integrationId:'154587',status:'completed',parts:old,activePartId:old[0].id,partCatalog:baseline} as AnimeItem;
        const result=await service.reviewAnimePartsForItem(item,all,true);
        expect(result?.parts.map(part=>part.id)).toEqual(old.map(part=>part.id));expect(result?.status).toBe('completed');expect(result?.continuations).toBeUndefined();expect(review).not.toHaveBeenCalled();
    });
    it('detects only genuinely new IDs and preserves old progress and completion until explicit choice',async()=>{
        const next=season('anilist-6',{releaseDate:'2027-04',year:2027,episodeTotal:8});
        const scan=inspectPartCatalog(source,[...all,next],old,baseline);
        expect(scan.candidates.map(candidate=>candidate.part.id)).toEqual([next.id]);
        const service=new IntegrationService(createMockApp({}),()=>structuredClone(DEFAULT_SETTINGS));
        const item={type:'anime',integrationProvider:'anilist',integrationId:'154587',status:'completed',parts:old,activePartId:old[0].id,partCatalog:baseline} as AnimeItem;
        const result=await service.reviewAnimePartsForItem(item,[...all,next]);
        expect(result?.parts).toEqual(old.map(part=>expect.objectContaining(part)));expect(result?.continuations).toHaveLength(1);expect(item.partCatalog).toEqual(baseline);
        const added=applyContinuations(old,scan.candidates,[next.id],false);expect(added.activeId).toBeUndefined();expect(added.parts[2]).toMatchObject({episodeCurrent:0,watchedEpisodes:[],status:'planned'});expect(added.parts[0]).toMatchObject(old[0]);
        const resumed=applyContinuations(old,scan.candidates,[next.id],true);expect(resumed.activeId).toBe(next.id);expect(resumed.parts[2].status).toBe('watching');expect(old).toHaveLength(2);
    });
    it('remembers declined additions and episode increases, including after an incomplete response',()=>{
        const newSeason=season('anilist-6'),increased={...all[0],episodeTotal:13};
        const scan=inspectPartCatalog(source,[increased,...all.slice(1),newSeason],old,baseline);
        expect(scan.candidates.map(candidate=>[candidate.part.id,candidate.existing])).toEqual([[all[0].id,true],[newSeason.id,false]]);
        expect(applyContinuations(old,scan.candidates,[],false).parts).toEqual(old);
        const partial=inspectPartCatalog(source,[all[0]],old,scan.catalog);
        expect(inspectPartCatalog(source,[increased,...all.slice(1),newSeason],old,partial.catalog).candidates).toEqual([]);
        const later=inspectPartCatalog(source,[{...increased,episodeTotal:14},...all.slice(1),newSeason],old,partial.catalog);
        expect(later.candidates).toHaveLength(1);expect(later.candidates[0].previousTotal).toBe(13);
    });
    it('does not repeatedly suggest an increased count on an excluded special',()=>{
        expect(inspectPartCatalog(source,[...all.slice(0,2),{...all[2],episodeTotal:40},...all.slice(3)],old,baseline).candidates).toEqual([]);
    });
    it('treats a source change as a baseline instead of proof of new seasons',()=>{
        const scan=inspectPartCatalog('kitsu:1:anime',all,old,baseline);expect(scan.baseline).toBe(true);expect(scan.catalog.source).toBe('kitsu:1:anime');
        expect(catalogSource({type:'anime',integrationProvider:'tmdb',integrationId:'10',integrationSourceKind:'tv'})).not.toBe(catalogSource({type:'anime',integrationProvider:'tmdb',integrationId:'10',integrationSourceKind:'movie'}));
    });
    it('identifies added episodes even on the first scan, without inventing a watched date or marking them watched',async()=>{
        const service=new IntegrationService(createMockApp({}),()=>structuredClone(DEFAULT_SETTINGS));
        const item={type:'anime',integrationProvider:'anilist',integrationId:'154587',status:'completed',parts:[old[0]],activePartId:old[0].id} as AnimeItem;
        const result=await service.reviewAnimePartsForItem(item,[{...all[0],episodeTotal:13}]);
        expect(result?.continuations?.[0]).toMatchObject({existing:true,previousTotal:12});expect(result?.parts[0].episodeTotal).toBe(12);
        const applied=applyContinuations(result!.parts,result!.continuations!,[old[0].id],true);
        expect(applied.parts[0]).toMatchObject({episodeCurrent:12,episodeTotal:13,watchedEpisodes:old[0].watchedEpisodes,userRating:8,status:'watching'});
    });
    it('keeps a source metadata refresh from restoring excluded seasons or silently consuming new episodes',()=>{
        const current={status:'completed',part_catalog:baseline,anime_parts:old.map(part=>({id:part.id,title:part.title,kind:part.kind,season:part.seasonNumber,episode_total:12,episode_current:12,status:'completed',user_rating:8}))};
        const incoming={integration_provider:'anilist',integration_id:'154587',anime_parts:[...all,season('anilist-6')].map(part=>({id:part.id,title:part.title,kind:part.kind,episode_total:part.id===all[0].id?13:12,episode_current:0,status:'planned'}))};
        const result=mergeProviderMetadata(current,incoming,[],{forceProviderFields:true,overwriteProviderFields:true});
        expect(result.values.anime_parts).toHaveLength(2);expect((result.values.anime_parts as any[])[0]).toMatchObject({episode_total:12,episode_current:12,user_rating:8,status:'completed'});
        expect(inspectPartCatalog(source,[{...all[0],episodeTotal:13},...all.slice(1)],old,result.values.part_catalog as any).candidates).toHaveLength(1);
    });

});
