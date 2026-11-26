// @vitest-environment happy-dom
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { AnimeEditModal } from '../src/modals/AnimeEditModal';
import { VideoEditModal } from '../src/modals/VideoEditModal';
import { IntegrationService } from '../src/services/IntegrationService';
import { inspectPartCatalog,catalogSource } from '../src/services/media/partCatalog';
import { DEFAULT_SETTINGS } from '../src/constants';
import { createMockApp } from './helpers/testHelpers';
import { installStatisticsDom } from './helpers/statisticsDom';
beforeEach(()=>{installStatisticsDom();Object.assign(HTMLElement.prototype,{setAttr(k:string,v:string){this.setAttribute(k,v)},setText(v:string){this.textContent=v}});vi.stubGlobal('createFragment',()=>document.createDocumentFragment());vi.stubGlobal('createEl',(tag:string)=>document.createElement(tag));vi.stubGlobal('createDiv',()=>document.createElement('div'));vi.stubGlobal('createSpan',()=>document.createElement('span'));});
afterEach(()=>{document.body.replaceChildren();vi.unstubAllGlobals();});
function fixture(type:'anime'|'series',action:'new'|'extension'='new',overrides:any={}){
 const provider=Array.from({length:5},(_,i)=>({id:type==='anime'?`anilist-${i+1}`:`season-${i+1}`,kind:type==='anime'?'tv':'season',title:`Part ${i+1}`,seasonNumber:i+1,year:2020,episodeCurrent:0,episodeTotal:12,status:'planned'}));
 const old=provider.slice(0,2).map(part=>({...part,status:'completed',episodeCurrent:12,userRating:8,watchedEpisodes:Array.from({length:12},(_,i)=>i+1)}));
 const item:any={type,filePath:'Example.md',displayName:'Example',format:'tv',year:2020,status:'completed',finished:'2019',userRating:9,favorite:false,isAdult:false,tags:[],genres:[],parts:old,activePartId:old[0].id,integrationProvider:type==='anime'?'anilist':'tmdb',integrationId:'154587',...overrides};
 item.partCatalog??=inspectPartCatalog(catalogSource(item),provider,old).catalog;
 const next=action==='new'?[...provider,{...provider[0],id:type==='anime'?'anilist-6':'season-6',seasonNumber:6,title:'New season',episodeTotal:8,releaseDate:'2027-04'}]:[{...provider[0],episodeTotal:13},...provider.slice(1)];
 const service=new IntegrationService(createMockApp({}),()=>structuredClone(DEFAULT_SETTINGS));const save=vi.fn(async(_updates:any)=>{});
 const refresh=vi.fn(async(request:any)=>type==='anime'?service.reviewAnimePartsForItem({...item,...request},next as any,true):{parts:next,partial:false});
 const modal:any=type==='anime'?new AnimeEditModal(createMockApp({}),item,save,undefined,refresh as any,undefined,[],undefined,undefined,undefined,undefined,undefined,true):new VideoEditModal(createMockApp({}),item,save,()=>{},undefined,[],[],undefined,undefined,undefined,undefined,undefined,undefined,undefined,true,refresh as any);
 modal.modalEl=document.body.appendChild(document.createElement('div'));modal.contentEl=modal.modalEl.appendChild(document.createElement('div'));vi.spyOn(modal,'close').mockImplementation(()=>{modal.onClose();modal.modalEl.remove()});modal.onOpen();
 return{item,provider,next,modal,save,refresh,root:modal.contentEl as HTMLElement};
}
describe('continuations in real editors',()=>{
 it.each(['anime','series'] as const)('offers explicit decisions for %s while preserving completed status until a choice',async type=>{
    const f=fixture(type);f.root.querySelector<HTMLButtonElement>('[data-action="refresh-parts"]')!.click();
    await vi.waitFor(()=>expect(f.root.querySelectorAll('[data-continuation-id]')).toHaveLength(1));
    expect(f.root.querySelector('.lorebase-continuations')?.textContent).toContain('2027-04');expect(f.save).not.toHaveBeenCalled();
    f.root.querySelector<HTMLButtonElement>('[data-continuation-action="add"]')!.click();
    expect(await f.modal.saveBeforeSourceRefresh()).toBe(true);
    const saved=f.save.mock.calls[0][0];expect(saved.status).toBe('completed');expect(saved.finished).toBe('2019');expect(saved.parts).toHaveLength(3);
    expect(saved.parts[0]).toMatchObject({status:'completed',episodeCurrent:12,userRating:8});expect(saved.parts[2]).toMatchObject({status:'planned',episodeCurrent:0,watchedEpisodes:[]});
 });
 it.each(['anime','series'] as const)('resumes %s only on Add and watch, with the new season active',async type=>{
    const f=fixture(type);f.root.querySelector<HTMLButtonElement>('[data-action="refresh-parts"]')!.click();await vi.waitFor(()=>expect(f.root.querySelector('[data-continuation-id]')).not.toBeNull());
    f.root.querySelector<HTMLButtonElement>('[data-continuation-action="watch"]')!.click();await f.modal.saveBeforeSourceRefresh();
    const saved=f.save.mock.calls[0][0];expect(saved.status).toBe('watching');expect(saved.activePartId).toBe(f.next[5].id);expect(saved.parts[2]).toMatchObject({status:'watching',episodeCurrent:0});expect(saved.parts[0].episodeCurrent).toBe(12);
 });
 it.each(['anime','series'] as const)('does not re-offer ignored %s continuations after Save and reopen',async type=>{
    const f=fixture(type);f.root.querySelector<HTMLButtonElement>('[data-action="refresh-parts"]')!.click();await vi.waitFor(()=>expect(f.root.querySelector('[data-continuation-id]')).not.toBeNull());
    f.root.querySelector<HTMLButtonElement>('[data-continuation-action="ignore"]')!.click();await f.modal.saveBeforeSourceRefresh();const saved=f.save.mock.calls[0][0];expect(saved.parts).toHaveLength(2);
    const reopened=fixture(type,'new',{...f.item,...saved});reopened.root.querySelector<HTMLButtonElement>('[data-action="refresh-parts"]')!.click();await vi.waitFor(()=>expect(reopened.root.querySelector<HTMLButtonElement>('[data-action="refresh-parts"]')!.disabled).toBe(false));
    expect(reopened.root.querySelector('.lorebase-continuations')).toBeNull();await reopened.modal.saveBeforeSourceRefresh();expect(reopened.save.mock.calls[0][0].parts).toHaveLength(2);
 });
 it.each(['anime','series'] as const)('keeps a declined extra episode out of %s progress and does not repeat the suggestion',async type=>{
    const f=fixture(type,'extension');f.root.querySelector<HTMLButtonElement>('[data-action="refresh-parts"]')!.click();await vi.waitFor(()=>expect(f.root.querySelector('[data-continuation-id]')).not.toBeNull());
    f.root.querySelector<HTMLButtonElement>('[data-continuation-action="ignore"]')!.click();await f.modal.saveBeforeSourceRefresh();const saved=f.save.mock.calls[0][0];expect(saved.parts[0].episodeTotal).toBe(12);
    const reopened=fixture(type,'extension',{...f.item,...saved});reopened.root.querySelector<HTMLButtonElement>('[data-action="refresh-parts"]')!.click();await vi.waitFor(()=>expect(reopened.root.querySelector<HTMLButtonElement>('[data-action="refresh-parts"]')!.disabled).toBe(false));expect(reopened.root.querySelector('.lorebase-continuations')).toBeNull();await reopened.modal.saveBeforeSourceRefresh();expect(reopened.save.mock.calls[0][0].parts[0]).toMatchObject({episodeTotal:12,episodeCurrent:12});
 });
});
