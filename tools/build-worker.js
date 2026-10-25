// server-worker/worker.template.js + ranklib.js → server-worker/worker.js (Cloudflare 에 붙여 넣을 한 파일)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const lib = fs.readFileSync(path.join(root, 'ranklib.js'), 'utf8').replace(/\nif \(typeof module[\s\S]*$/, '\n');
const tpl = fs.readFileSync(path.join(root, 'server-worker/worker.template.js'), 'utf8');
fs.writeFileSync(path.join(root, 'server-worker/worker.js'), tpl.replace('/*__RANKLIB__*/', lib.trim()));
console.log('server-worker/worker.js written');
