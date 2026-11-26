const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(d,x.name)):[path.join(d,x.name)]);
const rel=p=>path.relative(root,p).replace(/\\/g,'/');
const errors=[],docs=walk(path.join(root,'docs')).filter(p=>p.endsWith('.md'));
let links=0;
for(const file of docs){
 const text=fs.readFileSync(file,'utf8');
 let fence=null;
 for(const [i,line]of text.split(/\r?\n/).entries()){
  const match=line.match(/^\s*(`{3,}|~{3,})(.*)$/);
  if(match){if(!fence)fence={char:match[1][0],length:match[1].length,line:i+1};else if(match[1][0]===fence.char&&match[1].length>=fence.length&&!match[2].trim())fence=null;}
 }
 if(fence)errors.push({file:rel(file),error:'unclosed fence',line:fence.line});
 for(const m of text.matchAll(/!?\[[^\]\n]*\]\(([^\n)]+)\)/g)){
  const target=m[1].replace(/^<|>$/g,'');
  if(/^(?:https?:|mailto:|data:|#)/.test(target))continue;
  links++;
  const [plain,anchor]=target.split('#'),resolved=path.resolve(path.dirname(file),decodeURIComponent(plain));
  if(!fs.existsSync(resolved)){errors.push({file:rel(file),error:'missing link',target});continue;}
  if(anchor&&/^L\d+$/.test(anchor)&&fs.statSync(resolved).isFile()){
   const max=fs.readFileSync(resolved,'utf8').split(/\r?\n/).length;
   if(+anchor.slice(1)>max)errors.push({file:rel(file),error:'invalid source line',target,max});
  }
 }
}
const inventory=JSON.parse(fs.readFileSync(path.join(root,'docs/служебное/данные/source-inventory.json'),'utf8'));
const changedSources=[];
for(const file of inventory.files){const target=path.join(root,file.file);if(!fs.existsSync(target)||crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')!==file.sha256)changedSources.push(file.file);}
if(changedSources.length&&process.argv.includes('--strict-snapshot'))errors.push({error:'source files changed since audit inventory',files:changedSources});
const report={date:'2026-11-15',markdownFiles:docs.length,relativeLinksChecked:links,sourceHashesChecked:inventory.files.length,changedSources,errors};
const evidence='docs/служебное/данные';
fs.writeFileSync(path.join(root,evidence,'docs-validation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(errors.length)process.exitCode=1;
