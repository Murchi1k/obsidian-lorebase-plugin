// Creates isolated synthetic vaults; never reads the user's vault or credentials.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const esbuild=require('esbuild');
async function download(url){const response=await fetch(url,{signal:AbortSignal.timeout(20_000)});if(!response.ok)throw new Error('Fixture HTTP '+response.status);return response;}
async function main(){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'Lorebase-Benchmark-'));
 const masterUrl='https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
 const master=await (await download(masterUrl)).text();
 const lines=master.split(/\r?\n/),variants=[];
 for(let i=0;i<lines.length;i++){const match=lines[i].match(/BANDWIDTH=(\d+)/);if(match&&lines[i+1]&&!lines[i+1].startsWith('#'))variants.push({bandwidth:Number(match[1]),url:new URL(lines[i+1],masterUrl).href});}
 variants.sort((a,b)=>a.bandwidth-b.bandwidth);if(!variants.length)throw new Error('No HLS fixture variant');
 const playlist=await (await download(variants[0].url)).text();const segmentPath=playlist.split(/\r?\n/).find(line=>line&&!line.startsWith('#'));
 if(!segmentPath)throw new Error('No HLS segment');const segmentUrl=new URL(segmentPath,variants[0].url).href;
 const segment=Buffer.from(await (await download(segmentUrl)).arrayBuffer());if(segment.length>8*1024*1024)throw new Error('Fixture is unexpectedly large');
 const settings=JSON.parse(fs.readFileSync('docs/служебное/данные/default-settings.json','utf8'));
 settings.games.folderPath='Games';settings.onlineExtrasEnabled=false;settings.lastSeenReleaseVersion='4.0.0';
 settings.enabledMedia={games:true,anime:false,movies:false,series:false,books:false,manga:false,music:false};
 settings.steamSync.autoSyncPlaytimeOnStartup=false;settings.anilistSync.autoSyncOnStartup=false;settings.traktSync.autoSyncOnStartup=false;settings.playstationSync.autoSyncOnStartup=false;
 const helper=esbuild.buildSync({entryPoints:['scripts/benchmarks/obsidian-benchmark.ts'],bundle:true,platform:'node',format:'cjs',target:'es2020',external:['obsidian','electron'],write:false,minify:false});
 const vaults=[];
 for(const count of [100,1000,10000]){
  const dir=path.join(base,'Lorebase-'+count),config=path.join(dir,'.obsidian'),plugin=path.join(config,'plugins/lorebase'),bench=path.join(config,'plugins/lorebase-benchmark');
  fs.mkdirSync(plugin,{recursive:true});fs.mkdirSync(bench,{recursive:true});fs.mkdirSync(path.join(dir,'Games'),{recursive:true});fs.mkdirSync(path.join(dir,'BenchMedia'),{recursive:true});
  fs.writeFileSync(path.join(dir,'.lorebase-benchmark-owned'),'Synthetic test vault only\n');
  for(const name of ['main.js','styles.css','manifest.json'])fs.copyFileSync(name,path.join(plugin,name));
  fs.writeFileSync(path.join(plugin,'data.json'),JSON.stringify(settings));fs.writeFileSync(path.join(config,'community-plugins.json'),JSON.stringify(['lorebase-benchmark']));
  fs.writeFileSync(path.join(config,'app.json'),'{}');
  fs.writeFileSync(path.join(bench,'manifest.json'),JSON.stringify({id:'lorebase-benchmark',name:'Lorebase Benchmark',version:'1.0.0',minAppVersion:'1.7.0',isDesktopOnly:true,description:'Synthetic test-vault measurements',author:'Local development'}));
  fs.writeFileSync(path.join(bench,'main.js'),helper.outputFiles[0].contents);fs.writeFileSync(path.join(bench,'config.json'),JSON.stringify({count}));
  fs.writeFileSync(path.join(dir,'BenchMedia/segment.ts'),segment);
  for(let i=1;i<=count;i++){const title='Fixture '+String(i).padStart(5,'0');fs.writeFileSync(path.join(dir,'Games',title+'.md'),'---\ntype: game\nname: '+title+'\nstatus: '+(i%3?'not_started':'completed')+'\nrating: '+(i%6)+'\nyear: '+(2000+i%25)+'\ngenres: [RPG, Adventure]\ntags: [benchmark]\nplatforms: [PC]\nplot: Synthetic benchmark record with fixed metadata.\n---\n\n## My Notes\n\nLocal synthetic data only.\n');}
  vaults.push({count,path:dir,results:path.join(bench,'results.json')});
 }
 const run={base,vaults,hlsFixture:{source:masterUrl,segmentUrl,bytes:segment.length,sha256:crypto.createHash('sha256').update(segment).digest('hex')}};
 fs.writeFileSync('docs/служебное/данные/benchmark-run.json',JSON.stringify(run,null,2));console.log(JSON.stringify(run,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1});
