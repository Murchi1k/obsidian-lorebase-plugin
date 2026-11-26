import { collectRecommenders } from '../src/utils/recommenders';
import { IntegrationService } from '../src/services/IntegrationService';
// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mountDiscovery, renderDiscoveryMark } from '../src/components/DiscoveryContext';
import { normalizeDiscovery, discoveryFrontmatter, withPersonalFields } from '../src/utils/discovery';
import { GameService } from '../src/services/GameService';
import { AnimeService } from '../src/services/AnimeService';
import { VideoService } from '../src/services/VideoService';
import { ReadingService } from '../src/services/ReadingService';
import { MusicService } from '../src/services/MusicService';
import { MetadataService } from '../src/services/MetadataService';
import { DEFAULT_SETTINGS } from '../src/constants';
import { completeManualContent } from '../src/services/integrations/manualCreatePersistence';
import { mergeProviderMetadata } from '../src/services/integrations/enrichment';
import { installStatisticsDom } from './helpers/statisticsDom';
import { createMockApp, createMockFile } from './helpers/testHelpers';
beforeEach(()=>installStatisticsDom());
afterEach(()=>{document.body.replaceChildren();vi.restoreAllMocks();});
const discovery={reason:'Похоже на Outer Wilds',recommendedBy:'Андрей'};
describe('discovery context',()=>{
    it('keeps one collapsed block inside Description and notes and edits a draft without touching the initial object',()=>{
        const root=document.body.createDiv();root.innerHTML='<aside><section class="lorebase-editmode-quick-settings"></section><section class="lorebase-priority-control"></section></aside><aside><section class="lorebase-editmode-notes"></section></aside><section class="lorebase-editmode-notes"></section>';
        const changed=vi.fn();mountDiscovery(root,discovery,changed);
        const block=root.querySelector<HTMLElement>('.lorebase-discovery')!;
        expect(block.querySelector('button')!.getAttribute('aria-expanded')).toBe('false');expect(block.closest('.lorebase-editmode-notes')).not.toBeNull();expect(block.closest('.lorebase-editmode-advanced')).toBeNull();
        expect([...block.querySelectorAll<HTMLElement>('[data-discovery-field]')].map(field=>field.dataset.discoveryField)).toEqual(['recommendedBy','reason']);
        expect(block.querySelector('[data-discovery-field="url"]')).toBeNull();
        expect(block.dataset.mobilePane).toBeUndefined();
        const input=block.querySelector<HTMLTextAreaElement>('[data-discovery-field="reason"]')!;
        input.value='Другой повод';input.dispatchEvent(new Event('input'));
        expect(changed).toHaveBeenLastCalledWith({...discovery,reason:'Другой повод'});expect(discovery.reason).toBe('Похоже на Outer Wilds');
        mountDiscovery(root,discovery,changed);expect(root.querySelectorAll('.lorebase-discovery')).toHaveLength(1);
        renderDiscoveryMark(root,{discovery});expect(root.querySelector('.lorebase-discovery-mark')?.textContent).toBe('');
        renderDiscoveryMark(root,{});expect(root.querySelector('.lorebase-discovery-mark')).toBeNull();
    });
    it.each(['game','anime','movie','series','book','manga','music'] as const)('round-trips %s personal context and does not mix it with provider URL or my notes',async type=>{
        const file=createMockFile('Media/Example.md','Example');
        const fm:Record<string,unknown>={type,title:'Example',name:'Example',status:'planned',personal_priority:'normal',rating:4,userRating:4,favorite:false,url:'https://catalog.example/title',discovery_context:discoveryFrontmatter(discovery)};
        const app=createMockApp({[file.path]:{frontmatter:fm}});app.vault.getAbstractFileByPath=()=>file;app.fileManager.processFrontMatter=async(_file,handler)=>handler(fm);
        const metadata=new MetadataService(app,()=>structuredClone(DEFAULT_SETTINGS));
        const service:any=type==='game'?new GameService(app,metadata):type==='anime'?new AnimeService(app,metadata):type==='book'||type==='manga'?new ReadingService(app,type,'Media',metadata):type==='music'?new MusicService(app,'Media',metadata):new VideoService(app,type,'Media',metadata);
        const parse=()=>type==='game'?service.parseGameFromCache(file):type==='anime'?service.parseAnimeFromCache(file):service.parseFromCache(file);
        const item=parse();expect(item.discovery).toEqual(discovery);
        const patch={discovery:{...discovery,reason:'Обновлённая причина'}};
        const update=(value:any)=>type==='game'?service.updateGame(item,value):type==='anime'?service.updateAnime(item,value):service.updateItem(item,value);
        await update(patch);expect(parse().discovery).toEqual(patch.discovery);expect(fm.url).toBe('https://catalog.example/title');
        if(type==='anime'||type==='series'){
            const partCatalog={source:'anilist:1:anime',parts:{first:12,excluded:6}};
            await update({partCatalog});expect(parse().partCatalog).toEqual(partCatalog);
        }
        if(type==='music'){
            vi.spyOn(metadata,'getNoteTemplate').mockReturnValue('---\ntitle: "{{VALUE:name}}"\n---\n');
            expect(service.renderMusicNote({...parse(),discovery})).toContain('discovery_context:');
        }
        await update({discovery:undefined});expect(parse().discovery).toBeUndefined();
        // Reopen the form from the saved note, then save another change.
        const root=document.body.createDiv();root.innerHTML='<section class="lorebase-editmode-notes"></section>';
        let reopenedDiscovery=parse().discovery;
        mountDiscovery(root,reopenedDiscovery,value=>reopenedDiscovery=value,app);
        expect(root.querySelector<HTMLInputElement>('[data-discovery-field="recommendedBy"]')!.value).toBe('');
        expect(root.querySelector<HTMLTextAreaElement>('[data-discovery-field="reason"]')!.value).toBe('');
        await update({favorite:true,discovery:reopenedDiscovery});expect(parse().discovery).toBeUndefined();
    });
    it('writes the complete block through reduced/manual templates and preserves neighbouring notes and fields',()=>{
        const content='---\ntitle: Example\ncustom: keep\n---\n\n## My Notes\n\nOther notes';
        const result=withPersonalFields(content,{discovery_context:discoveryFrontmatter(discovery)});
        expect(result).toContain('custom: keep');expect(result).toContain('Other notes');expect(result).toContain('recommended_by');
        const manual=completeManualContent(content,{kind:'books',title:'Example',year:'',released:'',poster:'',posterHorizontal:'',description:'',tags:[],genres:[],status:'planned',rating:null,url:'',discovery} as any,'');
        expect(manual).toContain('discovery_context:');expect(manual).toContain('Other notes');
        const refreshed=mergeProviderMetadata({discovery_context:discoveryFrontmatter(discovery),part_catalog:{source:'x',parts:{old:12}}},{discovery_context:{reason:'provider'},part_catalog:{source:'y',parts:{}}},[],{forceProviderFields:true,overwriteProviderFields:true});
        expect(refreshed.values.discovery_context).toEqual(discoveryFrontmatter(discovery));expect(refreshed.values.part_catalog).toEqual({source:'x',parts:{old:12}});
        expect(normalizeDiscovery({reason:123})).toBeUndefined();
    });
    it('keeps a reason when creating a provider book through an advanced template',async()=>{
        const settings=structuredClone(DEFAULT_SETTINGS);settings.integrations!.enabled=true;settings.integrations!.providers.openlibrary.enabled=true;
        settings.integrations!.media.books.templateEnabled=true;settings.integrations!.media.books.templateMode='advanced';settings.integrations!.media.books.template='---\ntitle: "{{VALUE:name}}"\ncustom: keep\n---\n';
        const app=createMockApp({});app.vault.createFolder=vi.fn(async()=>{});const write=vi.fn(async(path:string,_content:string)=>createMockFile(path,'Example'));app.vault.create=write;
        const service=new IntegrationService(app,()=>settings);vi.spyOn(service as any,'fetchDetails').mockResolvedValue({kind:'book',name:'Example',poster:'',authors:[],genres:[],description:'',year:'',released:'',url:'https://openlibrary.org/works/OL1W',pages:'',publisher:'',rating:''});
        const result=await service.createProviderSelection('books',{id:'OL1W',provider:'openlibrary',title:'Example',discovery},{openAfterCreate:false});
        expect(result).not.toBeNull();expect(write).toHaveBeenCalledTimes(1);expect(write.mock.calls[0][1]).toContain('discovery_context:');expect(write.mock.calls[0][1]).toContain('Андрей');expect(write.mock.calls[0][1]).toContain('custom: keep');
    });

    it('suggests saved names without duplication and supports keyboard selection or a new name',()=>{
        const files=[createMockFile('A.md','A'),createMockFile('B.md','B'),createMockFile('C.md','C')];
        const app=createMockApp({'A.md':{frontmatter:{discovery_context:{recommended_by:'Андрей'}}},'B.md':{frontmatter:{discovery_context:{recommended_by:'  андрей  '}}},'C.md':{frontmatter:{discovery_context:{recommendedBy:'Анна'}}}});
        app.vault.getMarkdownFiles=()=>files;app.vault.cachedRead=vi.fn();
        expect(collectRecommenders(app)).toEqual(['Андрей','Анна']);
        const root=document.body.createDiv();root.innerHTML='<section class="lorebase-editmode-notes"></section>';
        const changed=vi.fn();mountDiscovery(root,undefined,changed,app);
        const block=root.querySelector<HTMLElement>('.lorebase-discovery')!;
        block.querySelector<HTMLButtonElement>('.lorebase-personal-note-trigger')!.click();const input=block.querySelector<HTMLInputElement>('[data-discovery-field="recommendedBy"]')!;
        input.focus();expect(changed).not.toHaveBeenCalled();expect(block.querySelectorAll('[role="option"]')).toHaveLength(2);
        input.value='Анд';input.dispatchEvent(new Event('input'));expect(block.querySelectorAll('[role="option"]')).toHaveLength(1);
        input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
        expect(input.value).toBe('Андрей');expect(changed).toHaveBeenLastCalledWith({recommendedBy:'Андрей',reason:''});expect(input.getAttribute('aria-expanded')).toBe('false');
        input.value='Новый человек';input.dispatchEvent(new Event('input'));expect(changed).toHaveBeenLastCalledWith({recommendedBy:'Новый человек',reason:''});
        expect(input.getAttribute('aria-expanded')).toBe('false');expect(app.vault.cachedRead).not.toHaveBeenCalled();
        input.value='';input.dispatchEvent(new Event('input'));
        const option=block.querySelector<HTMLButtonElement>('[role="option"]')!;option.focus();option.click();
        expect(input.value).toBe('Андрей');expect(input.getAttribute('aria-expanded')).toBe('false');

    });
    it('starts collapsed when remounted inside Notes without changing Additional',()=>{
        const root=document.body.createDiv();root.innerHTML='<details class="lorebase-editmode-advanced" open></details><section class="lorebase-editmode-notes"></section>';
        mountDiscovery(root,discovery,vi.fn());
        let block=root.querySelector<HTMLElement>('.lorebase-discovery')!;
        expect(block.querySelector('button')!.getAttribute('aria-expanded')).toBe('false');block.querySelector<HTMLButtonElement>('button')!.click();block.remove();
        mountDiscovery(root,discovery,vi.fn());block=root.querySelector<HTMLElement>('.lorebase-discovery')!;
        expect(block.querySelector('button')!.getAttribute('aria-expanded')).toBe('false');expect(root.querySelector<HTMLDetailsElement>('.lorebase-editmode-advanced')!.open).toBe(true);
    });
    it('drops the removed recommendation URL when reading and saving the block',()=>{
        const legacy={recommended_by:'Андрей',reason:'Совет',url:'https://old.example/review'};
        expect(normalizeDiscovery(legacy)).toEqual({recommendedBy:'Андрей',reason:'Совет'});
        expect(discoveryFrontmatter(legacy)).toEqual({recommended_by:'Андрей',reason:'Совет'});
        expect(normalizeDiscovery({url:'https://old.example/review'})).toBeUndefined();
    });

});
