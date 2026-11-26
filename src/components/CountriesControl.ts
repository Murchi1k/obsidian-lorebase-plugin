
import type { MediaItem } from '../types';
import { i18n } from '../localization';
import { st } from '../localization/statistics';
import { statisticsCountryCodes, statisticsCountryLabel, statisticsCountryOptions, resolveStatisticsCountry } from '../services/media/statisticsCountries';
import { getCountryFlag } from '../assets/countryFlags';
import { createDropdownLifecycle } from './dropdownLifecycle';
let nextId = 0;
export function countryFlag(parent: HTMLElement, code: string): void {
    const image = parent.ownerDocument.createElement('img'); image.className = 'lorebase-country-flag'; image.alt = ''; image.width = 24; image.height = 18; image.setAttribute('aria-hidden', 'true');
    const flag = getCountryFlag(code);
    if (flag) { image.src = flag; parent.appendChild(image); }
}
/** Draft-only, searchable country picker. The scrollable menu is outside the editor's clipping column. */
export function renderCountriesControl(root: HTMLElement, item: MediaItem, onChange: (codes: string[]) => void): void {
    const extra = root.querySelector<HTMLElement>('.lorebase-editmode-advanced'); if (!extra) return;
    const compactSlot = extra.querySelector<HTMLElement>('[data-role="compact-countries"]');
    const parent = compactSlot ?? extra.querySelector<HTMLElement>('.lorebase-editmode-advanced-grid, .lorebase-editmode-kv-list') ?? extra, doc = parent.ownerDocument;
    const field = doc.createElement('div'); field.className = 'lorebase-country-field lorebase-editmode-field'; parent.appendChild(field);
    const label = doc.createElement('label'); label.className = 'lorebase-editmode-field-label'; label.textContent = st('countries'); field.appendChild(label);
    const chips = doc.createElement('div'); chips.className = 'lorebase-country-chips'; field.appendChild(chips);
    const input = doc.createElement('input'); input.className = 'lorebase-editmode-input'; input.placeholder = st('addCountry'); input.setAttribute('aria-label', st('addCountry')); input.id = 'lb-country-input-' + ++nextId; label.htmlFor = input.id; field.appendChild(input);
    input.setAttribute('role','combobox'); input.setAttribute('aria-autocomplete','list'); input.setAttribute('aria-expanded','false'); input.autocomplete = 'off';
    const panel = doc.createElement('div'); panel.className = 'lorebase-country-menu'; panel.classList.toggle('lorebase-compact-country-menu', Boolean(compactSlot)); panel.id = 'lb-country-menu-' + nextId; panel.setAttribute('role','listbox'); panel.setAttribute('aria-label', st('countries')); input.setAttribute('aria-controls',panel.id);
    let values = statisticsCountryCodes(item), opened = false, restoring = false;
    const options = statisticsCountryOptions(i18n.getLanguage());
    const position = () => { const r = input.getBoundingClientRect(), view = doc.defaultView!, width = Math.min(330, Math.max(230,r.width),view.innerWidth-20), below = view.innerHeight-r.bottom-12, above = r.top-12; const height = Math.min(panel.scrollHeight + 2 || 290,290,Math.max(100,below >= 170 ? below : above));
        Object.assign(panel.style,{width:width+'px',left:Math.max(8,Math.min(r.left,view.innerWidth-width-8))+'px',maxHeight:height+'px',top:(below >= 170 ? r.bottom+5 : Math.max(8,r.top-height-5))+'px'}); };
    const close = () => { opened=false; lifecycle.stop(); panel.remove(); input.setAttribute('aria-expanded','false'); };
    const lifecycle = createDropdownLifecycle(input,panel,close,position);
    const render = () => { chips.replaceChildren(); for (const code of values) { const chip=doc.createElement('button'); chip.type='button'; chip.className='lorebase-country-chip'; chip.title=statisticsCountryLabel(code,i18n.getLanguage()); chip.setAttribute('aria-label',st('removeCountry')+': '+chip.title); countryFlag(chip,code); const name=doc.createElement('strong'); name.textContent=code; chip.appendChild(name); const x=doc.createElement('span');x.textContent='×';chip.appendChild(x);chips.appendChild(chip);
        chip.addEventListener('click',()=>{values=values.filter(value=>value!==code);onChange([...values]);render();if(opened)renderOptions();}); } };
    const restore = () => { restoring=true;input.focus({preventScroll:true});restoring=false; };
    const addCode = (code:string) => { if(!values.includes(code)){values.push(code);onChange([...values]);render();}input.value='';input.setCustomValidity('');close(); };
    const add = () => {const code=resolveStatisticsCountry(input.value);if(code)addCode(code);else input.setCustomValidity(input.value.trim()?st('addCountry'):'');};
    const renderOptions = () => { panel.replaceChildren();const query=input.value.trim().toLocaleLowerCase(),matches=options.filter(option=>!values.includes(option.code)&&(!query||option.code.toLowerCase().includes(query)||option.label.toLocaleLowerCase().includes(query)||resolveStatisticsCountry(query)===option.code));
        for(const option of matches){const row=doc.createElement('button');row.type='button';row.className='lorebase-country-option';row.setAttribute('role','option');row.setAttribute('aria-selected','false');countryFlag(row,option.code);const code=doc.createElement('strong');code.textContent=option.code;row.appendChild(code);const name=doc.createElement('span');name.textContent=option.label;row.appendChild(name);panel.appendChild(row);row.addEventListener('click',()=>{addCode(option.code);restore();});}
        if(!matches.length){const empty=doc.createElement('p');empty.textContent=st('noData');panel.appendChild(empty);}panel.scrollTop=0; };
    const open=()=>{if(restoring)return;opened=true;renderOptions();doc.body.appendChild(panel);input.setAttribute('aria-expanded','true');position();lifecycle.start();};
    input.addEventListener('focus',open);input.addEventListener('click',()=>{if(!opened)open();});input.addEventListener('input',()=>{input.setCustomValidity('');open();});input.addEventListener('change',add);
    input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();add();}if(event.key==='ArrowDown'){event.preventDefault();if(!opened)open();panel.querySelector<HTMLButtonElement>('button')?.focus();}if(event.key==='Escape'){event.stopPropagation();close();}});
    panel.addEventListener('keydown',event=>{const rows=Array.from(panel.querySelectorAll<HTMLButtonElement>('button')),index=rows.indexOf(doc.activeElement as HTMLButtonElement);if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();rows[(index+(event.key==='ArrowDown'?1:-1)+rows.length)%rows.length]?.focus();}if(event.key==='Escape'){event.stopPropagation();close();restore();}});render();
}
/** Commit input that has not blurred yet, including a Save keyboard shortcut. */
export function validateCountriesControl(root: HTMLElement): boolean {
    const input = root.querySelector<HTMLInputElement>('.lorebase-country-field input'); if (!input) return true;
    input.dispatchEvent(new Event('change')); if(input.checkValidity())return true;
    const details=input.closest('details');if(details)details.open=true;const pane=input.closest<HTMLElement>('[data-mobile-pane]')?.dataset.mobilePane;if(pane)root.querySelector<HTMLButtonElement>('[data-mobile-tab-target="'+pane+'"]')?.click();input.reportValidity();input.focus();return false;
}
