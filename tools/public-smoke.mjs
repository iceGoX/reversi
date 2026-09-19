import fs from 'node:fs';
import crypto from 'node:crypto';
const target=process.argv[2];if(!target)throw Error('Pass the explicit site URL');const base=new URL(target);if(!base.pathname.endsWith('/'))throw Error('Use a trailing slash');
const local=JSON.parse(fs.readFileSync('dist/release.json','utf8'));
async function get(file){const r=await fetch(new URL(file,base),{signal:AbortSignal.timeout(15000),cache:'no-store'});if(!r.ok)throw Error('GET '+file+' '+r.status);return r;}
const remote=await (await get('release.json')).json();if(JSON.stringify(remote)!==JSON.stringify(local))throw Error('Release manifest mismatch');
for(const file of ['index.html','style.css','game.js','engine.js','assets/guava-v2.jpg','assets/grape.jpg']){const data=Buffer.from(await(await get(file)).arrayBuffer());if(crypto.createHash('sha256').update(data).digest('hex')!==local.files[file])throw Error('Public hash mismatch: '+file);}
console.log('PASS public frontend and asset hashes: '+local.release);
const health=await(await get('api/health')).json();if(!health.ok||health.release!==local.release)throw Error('Backend release mismatch');
async function api(path,data,token){const r=await fetch(new URL('api/'+path,base),{method:data?'POST':'GET',headers:{...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(15000)});const out=await r.json();if(!r.ok)throw Error('API '+r.status+' '+out.error);return out;}
let a,b,code;try{
 a=await api('rooms',{nickname:'验收甲'});code=a.room.code;b=await api('rooms/'+code+'/join',{nickname:'验收乙'});let room=b.room;
 const action=async(token,type,index)=>{const out=await api('rooms/'+code+'/action',{type,index,expectedVersion:room.version,requestId:crypto.randomUUID()},token);room=out.room;return room;};
 await action(a.token,'start');await action(a.token,'move',19);const other=(await api('rooms/'+code,undefined,b.token)).room;if(other.game.board[27]!==1||other.game.moves!==1)throw Error('Players out of sync');
 await action(b.token,'resign');if(room.winner!==1||room.reason!=='resigned')throw Error('Resignation incorrect');
 const finished=JSON.stringify(room.game);await action(a.token,'swap-request');await action(b.token,'swap-accept');if(JSON.stringify(room.game)!==finished||room.members[0].side!==-1)throw Error('Seat swap changed finished game');
 await action(a.token,'replay');await action(b.token,'replay');if(room.game.moves!==0||room.status!=='playing')throw Error('Rematch incorrect');
 await action(b.token,'move',19);console.log('PASS online create / join / move / sync / resign / seat swap / rematch');
}finally{for(const member of[a,b])if(member)await api('rooms/'+code+'/leave',{},member.token).catch(()=>{});}
console.log('PUBLIC_RELEASE_VERIFIED '+local.release);
