import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.js';
test('two seats, authoritative turns, duplicate actions, resignation and rematch',async t=>{
 const app=createApp({persist:false});await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>{app.closeAllConnections();app.close();});const base='http://127.0.0.1:'+app.address().port+'/api/';
 const call=async(p,data,token)=>{const res=await fetch(base+p,{method:data?'POST':'GET',headers:{...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined});return {status:res.status,...await res.json()};};
 const a=await call('rooms',{nickname:'测试甲'});assert.equal(a.status,201);const code=a.room.code;
 const b=await call('rooms/'+code+'/join',{nickname:'测试乙'});assert.equal(b.room.members.length,2);assert.equal((await call('rooms/'+code+'/join',{nickname:'第三人'})).status,409);
 let room=b.room;const act=async(token,type,index,requestId=crypto.randomUUID())=>call('rooms/'+code+'/action',{type,index,requestId,expectedVersion:room.version},token);
 assert.equal((await act(b.token,'start')).status,409);room=(await act(a.token,'start')).room;
 assert.equal((await act(b.token,'move',19)).status,409);
 const req={type:'move',index:19,requestId:crypto.randomUUID(),expectedVersion:room.version};let r=await call('rooms/'+code+'/action',req,a.token);assert.equal(r.room.game.moves,1);room=r.room;
 assert.equal((await call('rooms/'+code+'/action',req,a.token)).room.game.moves,1);
 assert.equal((await call('rooms/'+code,undefined,b.token)).room.game.board[27],1);
 room=(await act(a.token,'resign')).room;assert.equal(room.status,'finished');assert.equal(room.winner,-1);assert.equal(room.reason,'resigned');assert.equal((await act(b.token,'move',18)).status,409);
 room=(await act(a.token,'replay')).room;assert.equal(room.status,'finished');room=(await act(b.token,'replay')).room;assert.equal(room.status,'playing');assert.equal(room.game.moves,0);
 await call('rooms/'+code+'/leave',{},a.token);room=(await call('rooms/'+code,undefined,b.token)).room;assert.equal(room.status,'finished');assert.equal(room.winner,-1);
 assert.equal((await call('rooms/'+code)).status,401);
});
test('release symlink starts the real server entry point',async()=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path'),{spawn}=await import('node:child_process');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'reversi-entry-'));const root=path.resolve(new URL('..',import.meta.url).pathname);await fs.symlink(root,path.join(dir,'current'),'dir');
 const child=spawn(process.execPath,[path.join(dir,'current/server/app.js'),'--port','0'],{env:{...process.env,DATA_DIR:path.join(dir,'data')},stdio:['ignore','pipe','pipe']});
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('entry did not listen')),3000);child.stdout.once('data',data=>{clearTimeout(timer);assert.match(String(data),/Reversi listening/);resolve();});child.once('exit',()=>{clearTimeout(timer);reject(Error('entry exited without listening'));});});}
 finally{child.kill();await new Promise(r=>child.once('close',r));await fs.rm(dir,{recursive:true,force:true});}
});
test('swap seats in waiting and after finish, preserving the completed game',async t=>{
 const app=createApp({persist:false});await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>{app.closeAllConnections();app.close();});const base='http://127.0.0.1:'+app.address().port+'/api/';
 const call=async(p,data,token)=>{const r=await fetch(base+p,{method:data?'POST':'GET',headers:{...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined});return{status:r.status,...await r.json()};};
 const a=await call('rooms',{nickname:'甲'}),code=a.room.code;let room=a.room;
 const act=async(token,type,index)=>{const r=await call('rooms/'+code+'/action',{type,index,requestId:crypto.randomUUID(),expectedVersion:room.version},token);if(r.room)room=r.room;return r;};
 await act(a.token,'swap-request');assert.equal(room.side,-1);
 const b=await call('rooms/'+code+'/join',{nickname:'乙'});room=b.room;assert.equal(room.side,1);
 await act(a.token,'swap-request');assert.ok(room.swapRequest);assert.equal((await act(a.token,'swap-accept')).status,403);assert.equal((await act(a.token,'start')).status,409);
 await act(b.token,'swap-decline');assert.equal(room.swapRequest,null);
 await act(a.token,'swap-request');await act(b.token,'swap-accept');assert.equal(room.members.find(x=>x.id===a.room.selfId).side,1);
 await act(a.token,'start');assert.equal((await act(a.token,'swap-request')).status,409);await act(a.token,'move',19);await act(b.token,'resign');
 const old=JSON.stringify(room.game),players=JSON.stringify(room.gameMembers),winner=room.winner;
 await act(a.token,'replay');await act(a.token,'swap-request');assert.equal(room.votes.length,0);assert.equal((await act(b.token,'replay')).status,409);await act(b.token,'swap-accept');
 assert.equal(JSON.stringify(room.game),old);assert.equal(JSON.stringify(room.gameMembers),players);assert.equal(room.winner,winner);assert.equal(room.members.find(x=>x.id===a.room.selfId).side,-1);
 await act(a.token,'replay');await act(b.token,'replay');assert.equal(room.status,'playing');assert.equal((await act(a.token,'move',19)).status,409);assert.equal((await act(b.token,'move',19)).status,200);
});
