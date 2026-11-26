/* Source inventory and technical UI references. Run: node scripts/docs/inventory.cjs */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const evidenceDir = process.env.LOREBASE_EVIDENCE_DIR || 'docs/служебное/данные';
const evidence = path.join(root, evidenceDir);
const walk = dir => fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)]);
const relative = file => path.relative(root,file).replace(/\\/g,'/');
const sourceFiles = walk(path.join(root,'src'));
const testFiles = walk(path.join(root,'tests')).filter(p => p.endsWith('.test.ts'));
const rows = [], controls = [], functions = [], exportedSymbols = [], edges = [], catches = [], translations = {};
const squash = s => s.replace(/\s+/g,' ').trim();
for(const file of sourceFiles) {
  const buffer = fs.readFileSync(file), content = buffer.toString('utf8'), rel = relative(file);
  const row = {file:rel,bytes:buffer.length,lines:content.split(/\r?\n/).length,sha256:crypto.createHash('sha256').update(buffer).digest('hex')};
  rows.push(row);
  if(!file.endsWith('.ts')) continue;
  const ast = ts.createSourceFile(file,content,ts.ScriptTarget.Latest,true);
  const line = n => ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1;
  const context = n => { for(let p=n.parent;p;p=p.parent) if((ts.isMethodDeclaration(p)||ts.isFunctionDeclaration(p)||ts.isClassDeclaration(p))&&p.name) return p.name.getText(ast); return 'module'; };
  function visit(n) {
    if(ts.isImportDeclaration(n)||ts.isExportDeclaration(n)) {
      const spec = n.moduleSpecifier?.text;
      if(spec?.startsWith('.')) {
        const base = path.resolve(path.dirname(file),spec);
        const resolved = [base+'.ts',path.join(base,'index.ts'),base].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
        if(resolved) edges.push({from:rel,to:relative(resolved),line:line(n),typeOnly:!!n.importClause?.isTypeOnly});
      }
    }
    if(n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)) {
      if(n.name) exportedSymbols.push({file:rel,line:line(n),name:n.name.getText(ast),kind:ts.SyntaxKind[n.kind]});
      if(ts.isVariableStatement(n)) for(const d of n.declarationList.declarations) exportedSymbols.push({file:rel,line:line(d),name:d.name.getText(ast),kind:'Variable'});
    }
    if((ts.isMethodDeclaration(n)||ts.isFunctionDeclaration(n)||ts.isArrowFunction(n)||ts.isFunctionExpression(n))&&n.body) {
      let branches=0,any=0;
      const count = c=>{if([ts.SyntaxKind.IfStatement,ts.SyntaxKind.ConditionalExpression,ts.SyntaxKind.ForStatement,ts.SyntaxKind.ForOfStatement,ts.SyntaxKind.ForInStatement,ts.SyntaxKind.WhileStatement,ts.SyntaxKind.CatchClause,ts.SyntaxKind.CaseClause].includes(c.kind))branches++; if(c.kind===ts.SyntaxKind.AnyKeyword)any++;ts.forEachChild(c,count);};
      count(n.body);
      functions.push({file:rel,line:line(n),name:n.name?.getText(ast)||context(n),lines:line(n.body)+n.body.getText(ast).split('\n').length-line(n),branches,any});
    }
    if(ts.isCatchClause(n)) catches.push({file:rel,line:line(n),empty:n.block.statements.length===0,text:squash(n.block.getText(ast)).slice(0,350)});
    if(ts.isCallExpression(n)) {
      const method = ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : n.expression.getText(ast);
      if(['setName','setDesc','setText','setTitle','setTooltip','setButtonText','setPlaceholder','addOption','addOptions','addLocalizedCommand','addRibbonIcon','addCommand','createEl','createDiv','createSpan','setAttribute','setIcon','addToggle','addText','addTextArea','addSlider','addDropdown','addButton','createInput','createButton','createToggle'].includes(method)) {
        const args = n.arguments.map(a=>squash(a.getText(ast)));
        if(!['createDiv','createSpan','createEl'].includes(method)||args.some(a=>/text:|title:|aria|button|input|select/.test(a))) controls.push({file:rel,line:line(n),context:context(n),method,args});
      }
    }
    if(rel==='src/localization/index.ts'&&ts.isVariableDeclaration(n)&&n.name.getText(ast)==='RU'&&ts.isObjectLiteralExpression(n.initializer)) for(const prop of n.initializer.properties) if(ts.isPropertyAssignment(prop)&&ts.isStringLiteralLike(prop.initializer)) translations[prop.name.getText(ast).replace(/^['"]|['"]$/g,'')]=prop.initializer.text;
    ts.forEachChild(n,visit);
  }
  visit(ast);
}
const inbound = new Map();
for(const e of edges) {if(!inbound.has(e.to))inbound.set(e.to,[]);inbound.get(e.to).push(e.from);}
const reached = new Set();
const reachable = file => {if(reached.has(file))return;reached.add(file); for(const e of edges.filter(e=>e.from===file))reachable(e.to);};
reachable('src/main.ts');
const unreachable = rows.filter(r=>r.file.endsWith('.ts')&&!reached.has(r.file)).map(r=>({...r,importedBy:inbound.get(r.file)||[]}));
const totals = {sourceFiles:rows.length,tsFiles:rows.filter(r=>r.file.endsWith('.ts')).length,cssFiles:rows.filter(r=>r.file.endsWith('.css')).length,sourceLines:rows.reduce((n,r)=>n+r.lines,0),tsLines:rows.filter(r=>r.file.endsWith('.ts')).reduce((n,r)=>n+r.lines,0),cssLines:rows.filter(r=>r.file.endsWith('.css')).reduce((n,r)=>n+r.lines,0),testFiles:testFiles.length,controls:controls.length,exportedSymbols:exportedSymbols.length,emptyCatches:catches.filter(c=>c.empty).length};
fs.mkdirSync(evidence,{recursive:true});
fs.writeFileSync(path.join(evidence,'source-inventory.json'),JSON.stringify({date:'2026-11-15',totals,files:rows,unreachable,largestFunctions:functions.sort((a,b)=>b.branches-a.branches).slice(0,100),exportedSymbols,edges,catches},null,2));
fs.writeFileSync(path.join(evidence,'ui-controls.json'),JSON.stringify(controls,null,2));
const esc = s => s.replace(/\r?\n/g,' ').replace(/`/g,'&#96;').replace(/\|/g,'\\|').replace(/</g,'&lt;').replace(/>/g,'&gt;');
let map = '# Карта исходников\n\nСнимок 15.11.2026. Строки включают пустые. SHA-256 и граф импортов: [source-inventory.json](данные/source-inventory.json). Размер не является самостоятельным доказательством плохого качества.\n\n';
map += Object.entries(totals).map(([k,v])=>`- ${k}: ${v}`).join('\n')+'\n\n## Файлы\n\n| Файл | Строк | Байт |\n|---|---:|---:|\n';
map += rows.map(r=>`| [${r.file}](../../${r.file}) | ${r.lines} | ${r.bytes} |`).join('\n');
map += '\n\n## Самые ветвистые функции\n\nПодсчёт включает вложенные функции; это индикатор для ручной проверки, а не точная cyclomatic complexity.\n\n| Файл:строка | Функция | Строк | Ветвлений |\n|---|---|---:|---:|\n';
map += functions.slice(0,60).map(r=>`| [${r.file}:${r.line}](../../${r.file}#L${r.line}) | ${r.name} | ${r.lines} | ${r.branches} |`).join('\n')+'\n';
fs.writeFileSync(path.join(root,'docs/служебное/КАРТА_КОДА.md'),map);
let catalog='# Реестр элементов интерфейса по исходному коду\n\nСнимок 15.11.2026. Это полный результат AST-поиска '+controls.length+' вызовов создания/подписи/настройки контролов, а не '+controls.length+' уникальных кнопок. Один контрол может занимать несколько строк. Динамические подписи и фабрики представлены выражениями; условия видимости и пользовательские сценарии описаны в руководстве. Реестр не подтверждает отображение в настоящем Obsidian.\n\n`setName` — заголовок настройки; `setDesc` — пояснение; `setTooltip` — подсказка; `setText`/`setButtonText` — надпись; `addOption` — вариант выбора; `addToggle/addText/addSlider` — тип поля; `createEl` — HTML-элемент. Ключи `t/mt/gt/pt/tt/...` разрешаются выбранным языком.\n\n';
for(const file of [...new Set(controls.map(r=>r.file))]) {
 catalog+=`## ${file}\n\n| Строка | Контекст | Вызов и аргументы |\n|---:|---|---|\n`;
 catalog+=controls.filter(r=>r.file===file).map(r=>`| [${r.line}](../../${r.file}#L${r.line}) | ${esc(r.context)} | ${esc(r.method+'('+r.args.join(', ')+')'+ [...r.args.join(' ').matchAll(/\bt\(['"]([^'"]+)['"]\)/g)].map(m=>translations[m[1]]?' → «'+translations[m[1]]+'»':'').join(''))} |`).join('\n')+'\n\n';
}
fs.writeFileSync(path.join(root,'docs/служебное/КНОПКИ.md'),catalog);
let markup='# Поля, кнопки и действия HTML-шаблонов\n\nДополнение к [AST-реестру](КНОПКИ.md): HTML внутри строк не является вызовом createEl. Ниже перечислены строки шаблонов и привязок с button/input/select/textarea, data-action/data-field/data-toggle. Выражения остаются исходными, поскольку часть подписей зависит от медиа и состояния. Дубликаты между макетом и обработчиком намеренно сохранены для трассировки.\n\n';
let markupCount=0;
for(const file of sourceFiles.filter(p=>p.endsWith('.ts'))) {
 const matches=fs.readFileSync(file,'utf8').split(/\r?\n/).map((value,index)=>({value:squash(value),line:index+1})).filter(r=>/<(?:button|input|select|textarea)\b|data-(?:action|field|toggle|mode|chip-kind)=/.test(r.value));
 if(!matches.length)continue;markupCount+=matches.length;
 markup+='## '+relative(file)+'\n\n| Строка | Разметка или привязка |\n|---:|---|\n'+matches.map(r=>'| ['+r.line+'](../../'+relative(file)+'#L'+r.line+') | '+esc(r.value)+' |').join('\n')+'\n\n';
}
fs.writeFileSync(path.join(root,'docs/служебное/HTML_ЭЛЕМЕНТЫ.md'),markup);
fs.writeFileSync(path.join(evidence,'ui-inventory-summary.json'),JSON.stringify({astCalls:controls.length,markupRows:markupCount},null,2));
console.log(JSON.stringify({totals,unreachable:unreachable.map(r=>r.file),largest:rows.filter(r=>/\.(ts|css)$/.test(r.file)).sort((a,b)=>b.lines-a.lines).slice(0,18),mostComplex:functions.slice(0,12)},null,2));

