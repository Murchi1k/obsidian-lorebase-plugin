// @vitest-environment happy-dom
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/constants';
import { i18n } from '../src/localization';
import { mountStatusReason,syncStatusReason } from '../src/components/StatusReasonField';
import { mountDiscovery } from '../src/components/DiscoveryContext';
import { mountReleaseDate } from '../src/components/ReleaseDateField';
import { GameService } from '../src/services/GameService';
import { AnimeService } from '../src/services/AnimeService';
import { ReadingService } from '../src/services/ReadingService';
import { VideoService } from '../src/services/VideoService';
import { MusicService } from '../src/services/MusicService';
import { MetadataService } from '../src/services/MetadataService';
import { ReadingEditModal } from '../src/modals/ReadingEditModal';
import { AnimeEditModal } from '../src/modals/AnimeEditModal';
import { EditModal } from '../src/modals/EditModal';
import { VideoEditModal } from '../src/modals/VideoEditModal';
import { MusicEditModal } from '../src/modals/MusicEditModal';
import { MusicSearchModal } from '../src/modals/MusicSearchModal';
import { MultiSelectSearchModal } from '../src/modals/IntegrationModals';
import { stepChapterPosition } from '../src/utils/mangaChapters';
import { incrementMangaChapter } from '../src/views/library/progressActions';
import { mergeProviderMetadata } from '../src/services/integrations/enrichment';
import { createMockApp,createMockFile } from './helpers/testHelpers';
import { installStatisticsDom } from './helpers/statisticsDom';
beforeEach(()=>{
    installStatisticsDom();i18n.setLanguage('en');
    Object.assign(HTMLElement.prototype,{setAttr(name:string,value:string){this.setAttribute(name,value);},setText(value:string){this.textContent=value;}});
    vi.stubGlobal('createFragment',()=>document.createDocumentFragment());
    for(const [name,tag] of [['createEl',''],['createDiv','div'],['createSpan','span']]) vi.stubGlobal(name,(element:string)=>document.createElement(tag||element));
});
afterEach(()=>{document.body.replaceChildren();vi.restoreAllMocks();vi.unstubAllGlobals();});
const edit=(input:HTMLInputElement,value:string)=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));};
const reason={paused:'Жду перевод',dropped:'Не понравилось'};
function fixture(type:string) {
    const file=createMockFile('Media/Test.md','Test');
    const fm:Record<string,any>={type,title:'Test',name:'Test',year:2027,status:'dropped',format:'tv',released:'2027-Q1',status_reasons:reason,chapter_current:12,chapter_total:24};
    const app=createMockApp({[file.path]:{frontmatter:fm}});
    app.vault.getAbstractFileByPath=()=>file;app.vault.getMarkdownFiles=()=>[file];
    app.vault.cachedRead=async()=>'';app.vault.read=async()=>'';app.vault.process=async()=>'';
    app.fileManager.processFrontMatter=async(_file,handler)=>handler(fm);
    const settings=structuredClone(DEFAULT_SETTINGS);settings.updatedEditor=true;
    const metadata=new MetadataService(app,()=>settings);
    const service:any=type==='game'?new GameService(app,metadata):type==='anime'?new AnimeService(app,metadata):type==='book'||type==='manga'?new ReadingService(app,type,'Media',metadata):type==='music'?new MusicService(app,'Media',metadata):new VideoService(app,type as any,'Media',metadata);
    const parse=()=>type==='game'?service.parseGameFromCache(file):type==='anime'?service.parseAnimeFromCache(file):service.parseFromCache(file);
    const update=(item:any,patch:any)=>type==='game'?service.updateGame(item,patch):type==='anime'?service.updateAnime(item,patch):service.updateItem(item,patch);
    return {file,fm,app,service,settings,parse,update};
}
async function mount(modal:any):Promise<void>{
    modal.modalEl=document.body.createDiv();modal.contentEl=modal.modalEl.createDiv();
    vi.spyOn(modal,'close').mockImplementation(()=>{modal.onClose();modal.modalEl.remove();});
    await modal.onOpen();
}
describe('personal workflow fields',()=>{
    it('reviews and confirms selected items without a discovery field',async()=>{
        const f=fixture('game');
        const modal:any=new MultiSelectSearchModal(f.app,async()=>[{id:'1',title:'Cyberpunk 2077',provider:'steam'}],{
            titleText:'Add',placeholder:'Title',emptyText:'No results',doneText:'Add',cancelText:'Cancel',providerOptions:[{id:'steam',label:'Steam'}],
        });
        await mount(modal);expect(modal.contentEl.querySelector('.lorebase-discovery-add')).toBeNull();
        modal.inputEl.value='Cyberpunk';await modal.runSearch();
        modal.contentEl.querySelector('.lorebase-select-card').click();modal.doneBtn.click();
        expect(modal.contentEl.querySelector('.lorebase-discovery-add')).toBeNull();
        modal.contentEl.querySelector('.lorebase-select-footer button').click();
        expect(modal.contentEl.querySelector('.lorebase-discovery-add')).toBeNull();
        modal.doneBtn.click();expect(modal.contentEl.querySelector('.lorebase-discovery-add')).toBeNull();
        const resolve=vi.fn();modal.resolve=resolve;
        const actions=modal.contentEl.querySelectorAll('.lorebase-select-footer button');actions[actions.length-1].click();
        expect(resolve).toHaveBeenCalledWith([{id:'1',title:'Cyberpunk 2077',provider:'steam'}]);
    });
    it('reviews and adds music without a discovery field',async()=>{
        const f=fixture('music');const create=vi.spyOn(f.service,'createItem').mockResolvedValue({item:f.parse(),created:true});
        const modal:any=new MusicSearchModal(f.app,f.settings,f.service,vi.fn());
        await mount(modal);expect(modal.contentEl.querySelector('.lorebase-discovery-add')).toBeNull();
        const album={id:'album',provider:'musicbrainz',kind:'album',title:'Album',artist:'Artist',image:'',year:'2027'};
        modal.selected.set('musicbrainz:album:album',album);modal.updateSelection();
        vi.spyOn(modal.catalog,'details').mockResolvedValue(f.parse());
        modal.addButton.click();expect(modal.contentEl.querySelector('.lorebase-discovery-add')).toBeNull();
        modal.addButton.click();
        await vi.waitFor(()=>expect(create).toHaveBeenCalledOnce());
        expect(create.mock.calls[0][0]).toEqual(f.parse());
    });
    it.each(['game','anime','movie','series','book','manga','music'])('persists, reopens and clears %s date precision and reasons',async type=>{
        const f=fixture(type);const original=f.parse();
        expect(original.releaseDate).toBe('2027-Q1');expect(original.statusReasons).toEqual(reason);
        for(const releaseDate of ['2027','2027-03','2027-Q2','2027-03-18','unknown']) {
            await f.update(original,{releaseDate,statusReasons:{paused:'Другая причина'},status:type==='game'?'playing':type==='music'?'listening':'watching'});
            const reopened=f.parse();expect(reopened.releaseDate).toBe(releaseDate);expect(reopened.statusReasons).toEqual({paused:'Другая причина'});
        }
        f.fm.release_date='2020-01-01';f.fm.releaseDate='2021-01-01';
        await f.update(original,{releaseDate:null,statusReasons:undefined});
        expect(f.parse().statusReasons).toBeUndefined();expect(f.parse().releaseDate??'').toBe('');
    });
    it('shows a nonblocking reason under paused/dropped, retains both independently, and suggests saved text',()=>{
        const f=fixture('anime'),root=document.body.createDiv();root.innerHTML='<div class="lorebase-editmode-status-shell"></div><section class="lorebase-editmode-notes"></section>';
        const changed=vi.fn();mountStatusReason(root,reason,'paused',changed,f.app);
        const field=root.querySelector<HTMLElement>('.lorebase-status-reason')!,input=field.querySelector('input')!;
        const trigger=field.querySelector<HTMLButtonElement>('.lorebase-personal-note-trigger')!;
        expect(trigger.getAttribute('aria-expanded')).toBe('false');expect(field.closest('.lorebase-editmode-notes')).not.toBeNull();
        expect(input.value).toBe('Жду перевод');expect(root.querySelectorAll('datalist option')).toHaveLength(2);expect(changed).not.toHaveBeenCalled();
        trigger.click();expect(trigger.getAttribute('aria-expanded')).toBe('true');
        edit(input,'Нет времени');syncStatusReason(root,'watching');expect(field.hidden).toBe(false);
        expect(trigger.getAttribute('aria-disabled')).toBe('true');expect(input.disabled).toBe(true);
        expect(trigger.title).toContain('Dropped or On hold');trigger.click();expect(trigger.getAttribute('aria-expanded')).toBe('false');
        syncStatusReason(root,'dropped');expect(input.value).toBe('Не понравилось');
        syncStatusReason(root,'paused');expect(input.value).toBe('Нет времени');
        edit(input,'');expect(changed).toHaveBeenLastCalledWith({dropped:'Не понравилось'});
        expect(reason.paused).toBe('Жду перевод');
    });
    it('shows a disabled reason initially and enables it only after changing to a matching status',()=>{
        const root=document.body.createDiv();root.innerHTML='<section class="lorebase-editmode-notes"></section>';
        const changed=vi.fn();mountStatusReason(root,reason,'completed',changed);
        const trigger=root.querySelector<HTMLButtonElement>('.lorebase-personal-note-trigger')!;
        const input=root.querySelector<HTMLInputElement>('[data-field="status-reason"]')!;
        expect(trigger.getAttribute('aria-disabled')).toBe('true');expect(input.disabled).toBe(true);
        trigger.click();expect(trigger.getAttribute('aria-expanded')).toBe('false');expect(changed).not.toHaveBeenCalled();
        syncStatusReason(root,'paused');expect(trigger.getAttribute('aria-disabled')).toBe('false');expect(input.disabled).toBe(false);
        trigger.click();expect(trigger.getAttribute('aria-expanded')).toBe('true');expect(input.value).toBe(reason.paused);
        expect(changed).not.toHaveBeenCalled();
    });
    it('opens one personal field at a time and keeps both drafts when switching controls',()=>{
        const root=document.body.createDiv();root.innerHTML='<section class="lorebase-editmode-notes"></section>';
        const reasonChanged=vi.fn(),discoveryChanged=vi.fn();
        mountDiscovery(root,undefined,discoveryChanged);mountStatusReason(root,reason,'dropped',reasonChanged);
        const reasonButton=root.querySelector<HTMLButtonElement>('.lorebase-status-reason > button')!;
        const discoveryButton=root.querySelector<HTMLButtonElement>('.lorebase-discovery > button')!;
        reasonButton.click();edit(root.querySelector<HTMLInputElement>('[data-field="status-reason"]')!,'Не зашёл сюжет');
        discoveryButton.click();expect(reasonButton.getAttribute('aria-expanded')).toBe('false');
        edit(root.querySelector<HTMLInputElement>('[data-discovery-field="recommendedBy"]')!,'Андрей');
        reasonButton.click();expect(discoveryButton.getAttribute('aria-expanded')).toBe('false');
        expect(root.querySelector<HTMLInputElement>('[data-field="status-reason"]')!.value).toBe('Не зашёл сюжет');
        expect(root.querySelector<HTMLInputElement>('[data-discovery-field="recommendedBy"]')!.value).toBe('Андрей');
        expect(reasonChanged).toHaveBeenCalledOnce();expect(discoveryChanged).toHaveBeenCalledOnce();
    });
    it('selects quarters and unknown in the release picker without changing personal dates',()=>{
        const root=document.body.createDiv();root.innerHTML='<details class="lorebase-editmode-advanced"></details>';
        let value='2027-03';const picker=mountReleaseDate(root,()=>value,next=>value=next);
        root.querySelector<HTMLButtonElement>('[data-action="open-release-calendar"]')!.click();
        [...document.querySelectorAll<HTMLButtonElement>('.lorebase-date-precision button')].find(button=>button.textContent==='Quarter')!.click();
        const quarter=[...document.querySelectorAll<HTMLButtonElement>('.lorebase-date-picker-cell')].find(button=>button.textContent==='II Quarter')!;quarter.click();
        expect(value).toBe('2027-Q2');expect(picker.commit()).toBe(true);expect(value).toBe('2027-Q2');
        root.querySelector<HTMLButtonElement>('[data-action="open-release-calendar"]')!.click();
        [...document.querySelectorAll<HTMLButtonElement>('.lorebase-date-picker-footer button')].find(button=>button.textContent==='Date unknown')!.click();
        expect(value).toBe('unknown');picker.destroy();
    });
    it('keeps manual full dates in the language of the field',()=>{
        const root=document.body.createDiv();root.innerHTML='<details class="lorebase-editmode-advanced"></details>';
        let value='2027-03-18';const picker=mountReleaseDate(root,()=>value,next=>value=next);
        const input=root.querySelector<HTMLInputElement>('input')!;
        edit(input,'03/04/2027');expect(picker.commit()).toBe(true);expect(value).toBe('2027-03-04');
        i18n.setLanguage('ru');edit(input,'03.04.2027');expect(picker.commit()).toBe(true);expect(value).toBe('2027-04-03');
        picker.destroy();
    });
    it.each(['game','anime','movie','series','book','manga','music'])('saves the actual %s editor without turning a partial release into a day',async type=>{
        const f=fixture(type),item=f.parse(),persist=vi.fn((patch:any)=>f.update(item,patch));
        const modal:any=type==='game'?new EditModal(f.app,item,persist,[],undefined,[],undefined,undefined,[],[],undefined,undefined,undefined,undefined,undefined,true)
            :type==='anime'?new AnimeEditModal(f.app,item,persist,undefined,undefined,undefined,[],undefined,undefined,undefined,undefined,undefined,true)
            :type==='book'||type==='manga'?new ReadingEditModal(f.app,item,persist,()=>{},undefined,[],[],undefined,undefined,undefined,undefined,true)
            :type==='music'?new MusicEditModal(f.app,item,f.settings,f.service,persist)
            :new VideoEditModal(f.app,item,persist,()=>{},undefined,[],[],undefined,undefined,undefined,undefined,undefined,undefined,undefined,true);
        await mount(modal);
        const root=modal.contentEl as HTMLElement;
        for(const selector of ['.lorebase-status-reason','.lorebase-discovery']) expect(root.querySelector(selector)?.closest('.lorebase-editmode-notes')).not.toBeNull();
        expect(root.querySelector('.lorebase-editmode-status-rating .lorebase-status-reason')).toBeNull();
        const release=root.querySelector<HTMLInputElement>('[data-field="released"], [data-field="release-date"]')!;
        expect(release.value).toBe('2027-Q1');edit(release,'2027-Q3');
        edit(root.querySelector<HTMLInputElement>('[data-field="status-reason"]')!,'');
        expect(item.statusReasons).toEqual(reason);
        const description=root.querySelector<HTMLTextAreaElement>('.lorebase-editmode-notes-input')!;
        const editDescription=root.querySelector<HTMLButtonElement>('[data-action="edit-description"]')!;
        expect(description.hidden).toBe(true);editDescription.click();
        edit(description,'Updated description.\n\nKeep both paragraphs.');editDescription.click();
        expect(description.hidden).toBe(true);
        root.querySelector<HTMLButtonElement>('.lorebase-editmode-note-tab[data-mode="myNotes"]')!.click();
        expect(description.hidden).toBe(true);
        root.querySelector<HTMLButtonElement>('[data-action="add-my-notes"]')!.click();
        edit(description,'Personal notes.\n\nPreserve this paragraph.');
        root.querySelector<HTMLButtonElement>('[data-action="edit-my-notes"]')!.click();
        expect(description.hidden).toBe(true);
        if(type==='music') await modal.save();else await modal.saveBeforeSourceRefresh();
        expect(persist).toHaveBeenCalledOnce();expect(f.parse().releaseDate).toBe('2027-Q3');
        expect(f.parse().statusReasons).toEqual({paused:'Жду перевод'});
        expect(f.parse().description ?? f.parse().summary).toBe('Updated description.\n\nKeep both paragraphs.');
        expect(persist.mock.calls[0][0].myNotes).toBe('Personal notes.\n\nPreserve this paragraph.');
    });
});

describe('manga chapter numbers without bonus chapters',()=>{
    it('steps through numbered chapters and ignores legacy bonus entries',()=>{
        expect(stepChapterPosition(12,1,24)).toBe(13);
        expect(stepChapterPosition(12.5,1,24)).toBe(13);
        expect(stepChapterPosition(13,-1,24)).toBe(12);
        const f=fixture('manga'),item=f.parse();
        item.extraChapters=[{id:'half',number:12.5,title:'Legacy',read:false}];
        expect(incrementMangaChapter(item).updates.chapterCurrent).toBe(13);
    });
    it('preserves fractional progress and existing unrecognised note fields without exposing a bonus feature',async()=>{
        const f=fixture('manga');
        const legacy=[{id:'half',number:12.5,title:'Legacy bonus',read:true}];
        f.fm.extra_chapters=legacy;
        f.fm.manga_parts=[{id:'main',title:'Volume 1',volume:1,chapterCurrent:12.5,chapter_total:24,status:'watching',extra_chapters:legacy,custom_part_field:'keep'}];
        const item=f.parse(),persist=vi.fn((patch:any)=>f.update(item,patch));
        const modal=new ReadingEditModal(f.app,item,persist,()=>{},undefined,[],[],undefined,undefined,undefined,undefined,true);
        await mount(modal);
        expect(modal.contentEl.querySelector('.lorebase-manga-extras, [data-role="manga-chapter-summary"], [data-action="add-extra-chapter"]')).toBeNull();
        expect(modal.contentEl.querySelector<HTMLInputElement>('[data-field="chapter-position"]')!.value).toBe('12.5');
        edit(modal.contentEl.querySelector<HTMLInputElement>('[data-field="chapter-position"]')!,'13.5');
        await modal.saveBeforeSourceRefresh();
        expect(f.parse().chapterCurrent).toBe(13.5);
        expect(f.fm.extra_chapters).toEqual(legacy);
        expect(f.fm.manga_parts[0].extra_chapters).toEqual(legacy);
        expect(f.fm.manga_parts[0].custom_part_field).toBe('keep');
    });
    it('preserves personal reasons during a forced provider refresh',()=>{
        const merged=mergeProviderMetadata({status_reasons:reason},{status_reasons:{paused:'Provider'}},[],{forceProviderFields:true,overwriteProviderFields:true});
        expect(merged.values.status_reasons).toEqual(reason);
    });
});
