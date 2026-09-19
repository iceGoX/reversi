import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const files=['index.html','style.css','game.js','engine.js','package.json','server/app.js','assets/guava-v2.jpg','assets/grape.jpg'];
fs.rmSync('dist',{recursive:true,force:true});fs.mkdirSync('dist',{recursive:true});const hashes={};
for(const file of files){const data=fs.readFileSync(file);hashes[file]=crypto.createHash('sha256').update(data).digest('hex');fs.mkdirSync(path.dirname('dist/'+file),{recursive:true});fs.writeFileSync('dist/'+file,data);}
const release=crypto.createHash('sha256').update(JSON.stringify(hashes)).digest('hex').slice(0,16);
fs.writeFileSync('dist/release.json',JSON.stringify({release,files:hashes},null,2)+'\n');console.log('Release '+release+' / '+files.length+' runtime files');
