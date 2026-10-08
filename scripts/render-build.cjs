// Render reads only the public customer bundle from the existing Site.
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const ORIGIN = 'https://chic-mafia.redgunsnroses16.chatgpt.site';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function read(url, maxBytes) {
  const response = await fetch(url, {redirect:'error',signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw Error('Customer bundle download failed: '+response.status);
  const chunks=[]; let size=0;
  for await (const chunk of response.body) {
    size+=chunk.byteLength;
    if(size>maxBytes) throw Error('Customer bundle exceeds size limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function main() {
  const expected=process.argv[2];
  if(!/^[a-f0-9]{64}$/.test(expected||'')) throw Error('A pinned manifest hash is required');
  const bytes=await read(ORIGIN+'/render-manifest.json?v='+expected,65536);
  if(digest(bytes)!==expected) throw Error('Manifest does not match the reviewed deployment');
  const manifest=JSON.parse(bytes.toString('utf8'));
  if(!Array.isArray(manifest.files)||manifest.files.length<4||manifest.files.length>100) throw Error('Invalid customer manifest');
  const seen=new Set();
  const root=path.resolve('render-public');
  for(const file of manifest.files) {
    if(!file||typeof file.path!=='string'||! /^(?:index\.html|menu\.json|customer\.(?:css|js)|assets\/[a-z0-9-]+\.(?:webp|woff2))$/.test(file.path)||seen.has(file.path)||!/^[a-f0-9]{64}$/.test(file.sha256)) throw Error('Invalid customer asset');
    seen.add(file.path);
    const output=path.resolve(root,file.path);
    if(!output.startsWith(root+path.sep)) throw Error('Invalid output path');
    const asset=await read(ORIGIN+'/'+file.path+'?v='+expected,8*1024*1024);
    if(digest(asset)!==file.sha256) throw Error('Customer asset hash mismatch: '+file.path);
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,asset);
  }
  for(const required of ['index.html','menu.json','customer.css','customer.js']) if(!seen.has(required)) throw Error('Missing required customer asset');
  console.log('Verified customer bundle deployed: '+manifest.version);
}
main().catch(error=>{console.error(error.message);process.exitCode=1});

