// Refresh technical references without changing the user guide or task list.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const { execFileSync } = require('node:child_process');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '../..');
process.chdir(root);
const evidence = 'docs/служебное/данные';
fs.mkdirSync(evidence, { recursive: true });
const compiled = esbuild.buildSync({
    stdin: { contents: "export { DEFAULT_SETTINGS } from './src/constants'; export { buildSimpleTemplate, getDefaultTemplateFields } from './src/services/integrations/templateUtils';", resolveDir: root },
    bundle: true, platform: 'node', format: 'cjs', write: false,
    alias: { obsidian: path.join(root, 'tests/mocks/obsidian.ts') },
});
const loaded = new Module(path.join(root, 'reference.generated.cjs'), module);
loaded.filename = path.join(root, 'reference.generated.cjs'); loaded.paths = module.paths;
loaded._compile(compiled.outputFiles[0].text, loaded.filename);
const { DEFAULT_SETTINGS, buildSimpleTemplate, getDefaultTemplateFields } = loaded.exports;
fs.writeFileSync(path.join(evidence, 'default-settings.json'), JSON.stringify(DEFAULT_SETTINGS, null, 2));
const templates = Object.fromEntries(['games','anime','movies','series','books','manga','music'].map(kind => [kind, {
    fields: getDefaultTemplateFields(kind), template: buildSimpleTemplate(kind, getDefaultTemplateFields(kind)),
}]));
fs.writeFileSync(path.join(evidence, 'default-templates.json'), JSON.stringify(templates, null, 2));
let doc = '# Полный справочник полей шаблонов\n\n[← Служебные материалы](README.md)\n\nВстроенные шаблоны семи медиа. Пользовательские псевдонимы могут менять имена YAML. Маркеры `{{VALUE:...}}` заменяются при создании заметки.\n\n';
for (const [kind, value] of Object.entries(templates)) doc += '## ' + kind + '\n\nПоля редактора: ' + value.fields.map(field => '`' + field + '`').join(', ') + '.\n\n```yaml\n' + value.template + '\n```\n\n';
fs.writeFileSync('docs/служебное/ШАБЛОНЫ.md', doc);
const env = { ...process.env, LOREBASE_EVIDENCE_DIR: evidence };
for (const script of ['inventory.cjs', 'reference.cjs']) {
    const output = execFileSync(process.execPath, ['scripts/docs/' + script], { cwd: root, env, encoding: 'utf8' });
    fs.writeFileSync(path.join(evidence, script.replace('.cjs', '.log')), output);
}
console.log('Updated current defaults, templates, source map and UI catalogs.');
