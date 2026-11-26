// Complements the primitive UI inventory with project-specific factories and defaults.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'../..');
const evidenceDir=process.env.LOREBASE_EVIDENCE_DIR||'docs/служебное/данные';
const inventory=JSON.parse(fs.readFileSync(path.join(root,evidenceDir,'source-inventory.json'),'utf8'));
const helpers=new Set(['button','iconButton','peopleButton','peopleElement','el','node','input','check','toggle','field','choice','action','createLorebaseDropdown','renderChoiceButtons','renderMediaSwitch','renderSyncButton','createManualDate','createManualNotes','createManualToggle','createManualTracking','createManualInput','createManualText','createManualNumber']);
const escape=s=>s.replace(/`/g,'&#96;').replace(/\|/g,'\\|').replace(/</g,'&lt;').replace(/>/g,'&gt;');
let count=0,doc='# Реестр UI-фабрик и общих контролов\n\nДополнение к AST createEl/setName и HTML-шаблонам: специализированные фабрики button/iconButton/peopleButton, DOM helpers el/node и фабрики dropdown/toggle/manual form. Это вызовы, а не число уникальных кнопок; строки el/node могут описывать контейнеры и подписи. Их аргументы нужны для трассировки динамического интерфейса статистики, эпизодов, музыки и online panels.\n\n';
for(const file of inventory.files.filter(x=>x.file.endsWith('.ts'))){
 const source=fs.readFileSync(path.join(root,file.file),'utf8'),ast=ts.createSourceFile(file.file,source,ts.ScriptTarget.Latest,true),rows=[];
 function visit(n){if(ts.isCallExpression(n)){const method=ts.isPropertyAccessExpression(n.expression)?n.expression.name.text:n.expression.getText(ast);if(helpers.has(method))rows.push({line:ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1,call:n.getText(ast).replace(/\s+/g,' ').slice(0,1600)});}ts.forEachChild(n,visit);}visit(ast);
 if(!rows.length)continue;count+=rows.length;
 doc+='## '+file.file+'\n\n| Строка | Вызов фабрики |\n|---:|---|\n'+rows.map(x=>'| ['+x.line+'](../../'+file.file+'#L'+x.line+') | '+escape(x.call)+' |').join('\n')+'\n\n';
}
fs.writeFileSync(path.join(root,'docs/служебное/ФАБРИКИ_ИНТЕРФЕЙСА.md'),doc);
const defaults=JSON.parse(fs.readFileSync(path.join(root,evidenceDir,'default-settings.json'),'utf8'));
doc='# Полный справочник настроек по умолчанию\n\nСнимок DEFAULT_SETTINGS на 15.11.2026. Это технический справочник, а не утверждение, что каждый ключ имеет отдельную видимую кнопку. Здесь есть legacy/migration поля, snapshots и параметры внутренних алгоритмов. Пользовательская навигация — [Настройки](../руководство/09-Настройки.md). Полные значения без сокращений — [default-settings.json](данные/default-settings.json). Секреты в этом встроенном снимке пустые; реальные пользовательские credentials не читались.\n\n';
let leaves=0;
for(const [section,value] of Object.entries(defaults)){
 const rows=[];
 function flatten(key,value){if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length){for(const [name,item] of Object.entries(value))flatten(key+'.'+name,item);}else {leaves++;const rendered=typeof value==='string'&&/template/i.test(key)&&value.includes('\n')?'Содержимое шаблона: см. ШАБЛОНЫ.md и полный JSON':JSON.stringify(value);rows.push('| `'+escape(key)+'` | '+escape(rendered)+' |');}}
 flatten(section,value);
 doc+='## '+section+'\n\n| Ключ | Значение |\n|---|---|\n'+rows.join('\n')+'\n\n';
}
fs.writeFileSync(path.join(root,'docs/служебное/НАСТРОЙКИ.md'),doc);
fs.writeFileSync(path.join(root,evidenceDir,'reference-summary.json'),JSON.stringify({factoryCalls:count,settingsLeaves:leaves},null,2));
console.log(JSON.stringify({factoryCalls:count,settingsLeaves:leaves}));
