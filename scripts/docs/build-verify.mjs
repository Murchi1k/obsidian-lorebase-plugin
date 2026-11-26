// Executes the current production esbuild config with writes disabled.
// This preserves pre-existing, uncommitted main.js/styles.css byte for byte.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
const original = fs.readFileSync('esbuild.config.mjs','utf8');
const evidence = process.env.LOREBASE_EVIDENCE_DIR || 'docs/служебное/данные';
fs.mkdirSync(evidence, { recursive: true });
const probe = original.replaceAll('outfile:', 'write: false,\n    metafile: true,\n    outfile:')
    .replace('scriptContext.rebuild(),', 'scriptContext.rebuild().then(r => globalThis.__auditBuild.js = r),')
    .replace('styleContext.rebuild()','styleContext.rebuild().then(r => globalThis.__auditBuild.css = r)')
    .replace('process.exit(0);', '');
const temporary = 'scripts/docs/build-probe.generated.mjs';
globalThis.__auditBuild = {};
process.argv[2] = 'production';
try {
    fs.writeFileSync(temporary,probe);
    await import(pathToFileURL(process.cwd()+'/'+temporary).href);
    const summary = Object.fromEntries(Object.entries(globalThis.__auditBuild).map(([kind,result]) => [kind, {
        outputs:result.outputFiles.map(file=>({path:file.path.split(/[\\/]/).pop(),bytes:file.contents.length,sha256:crypto.createHash('sha256').update(file.contents).digest('hex'),matchesExisting:fs.existsSync(file.path)&&Buffer.from(file.contents).equals(fs.readFileSync(file.path))})),
        contributions:Object.entries(result.metafile.outputs).flatMap(([output,value])=>Object.entries(value.inputs).map(([file,data])=>({output,file,bytesInOutput:data.bytesInOutput}))).sort((a,b)=>b.bytesInOutput-a.bytesInOutput),
        inputs:Object.entries(result.metafile.inputs).map(([file,data])=>({file,bytes:data.bytes})).sort((a,b)=>b.bytes-a.bytes),
        warnings:result.warnings
    }]));
    fs.writeFileSync(evidence+'/build-summary.json',JSON.stringify(summary,null,2));
    console.log(JSON.stringify(Object.fromEntries(Object.entries(summary).map(([kind,value])=>[kind,{outputs:value.outputs,largestInputs:value.inputs.slice(0,8),warnings:value.warnings} ])),null,2));
} finally {
    if(fs.existsSync(temporary)) fs.unlinkSync(temporary);
}
