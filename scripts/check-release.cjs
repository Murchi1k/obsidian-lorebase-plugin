const fs = require('node:fs');
const packageInfo = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const versions = JSON.parse(fs.readFileSync('versions.json', 'utf8'));
const tag = process.argv[2] || process.env.LOREBASE_RELEASE_TAG;
if (packageInfo.version !== manifest.version) throw new Error('package.json and manifest.json versions differ.');
if (versions[manifest.version] !== manifest.minAppVersion) throw new Error('versions.json does not match the current minimum Obsidian version.');
if (tag && tag.replace(/^v/, '') !== manifest.version) throw new Error('The release tag does not match manifest.json.');
console.log(`Validated Lorebase ${manifest.version}; minimum Obsidian ${manifest.minAppVersion}.`);
