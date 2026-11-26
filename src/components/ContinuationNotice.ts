import type { Continuation } from '../services/media/partCatalog';
import { ct } from '../localization/continuations';
import { isFutureReleaseDate } from '../services/media/releaseStatus';
function node<K extends keyof HTMLElementTagNameMap>(parent:HTMLElement,tag:K,cls:string,text?:string):HTMLElementTagNameMap[K]{const element=parent.ownerDocument.createElement(tag);element.className=cls;if(text)element.textContent=text;parent.append(element);return element;}
/** No status or progress changes occur until one of the explicit actions is selected. */
export function renderContinuationNotice(root:HTMLElement,candidates:Continuation[],baseline:boolean,commit:(selected:string[],resume:boolean)=>void):void {
    root.querySelector('.lorebase-continuations')?.remove(); if(!candidates.length)return;
    const composition=root.querySelector<HTMLElement>('.lorebase-editmode-anime-parts');if(!composition)return;
    const panel=node(composition,'section','lorebase-continuations');composition.querySelector('.lorebase-part-heading')?.after(panel);
    node(panel,'strong','',ct(baseline?'baseline':'found'));node(panel,'p','lorebase-continuations-hint',ct('hint'));
    const selected=new Set(candidates.map(candidate=>candidate.part.id));
    const buttons:HTMLButtonElement[]=[];
    for(const candidate of candidates){
        const row=node(panel,'label','lorebase-continuation-row'),input=node(row,'input','');input.type='checkbox';input.checked=true;input.dataset.continuationId=candidate.part.id;
        const text=node(row,'span','lorebase-continuation-text');node(text,'span','',candidate.part.title);
        const count=candidate.existing?`${ct('extra')}: +${(candidate.part.episodeTotal??0)-(candidate.previousTotal??0)}`:`${candidate.part.episodeTotal??'—'} ${ct('episodes')}`;
        const date=candidate.part.releaseDate||String(candidate.part.year||'')||ct('unknown');
        node(text,'small','',`${count} · ${ct('date')}: ${date}${isFutureReleaseDate(date)?` · ${ct('announced')}`:''}`);
        input.addEventListener('change',()=>{if(input.checked)selected.add(candidate.part.id);else selected.delete(candidate.part.id);buttons.forEach(button=>button.disabled=!selected.size);});
    }
    const actions=node(panel,'div','lorebase-continuation-actions');
    for(const [key,resume]of [['add',false],['watch',true]] as const){const button=node(actions,'button','',ct(key));button.type='button';button.dataset.continuationAction=key;button.addEventListener('click',()=>commit([...selected],resume));buttons.push(button);}
    const ignore=node(actions,'button','',ct('ignore'));ignore.type='button';ignore.dataset.continuationAction='ignore';ignore.addEventListener('click',()=>commit([],false));
}
