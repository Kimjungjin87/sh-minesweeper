// server/Code.template.js + ranklib.js → server/Code.gs (Apps Script 에 붙여 넣을 한 파일)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const lib = fs.readFileSync(path.join(root, 'ranklib.js'), 'utf8').replace(/\nif \(typeof module[\s\S]*$/, '\n');
const tpl = fs.readFileSync(path.join(root, 'server/Code.template.js'), 'utf8');
fs.writeFileSync(path.join(root, 'server/Code.gs'), tpl.replace('/*__RANKLIB__*/', lib.trim()));
console.log('server/Code.gs written');
