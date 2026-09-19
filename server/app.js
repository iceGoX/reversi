import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {initialState,play,score} from '../engine.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const id=()=>crypto.randomBytes(24).toString('base64url');
function fail(message,status=400){const e=new Error(message);e.status=status;throw e;}
function name(value){if(typeof value!=='string')fail('请填写昵称');const s=value.normalize('NFKC').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').trim();if(!s||[...s].length>12)fail('昵称需要 1～12 个字');return s;}
async function body(req){if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))fail('请求格式不正确',415);let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>4096)fail('请求内容过大',413);}try{const o=JSON.parse(text);if(!o||Array.isArray(o)||typeof o!=='object')throw Error();return o;}catch{fail('请求内容无法读取');}}
export function createApp({root=ROOT,dataDir=process.env.DATA_DIR||path.join(ROOT,'.data'),persist=true,maxRooms=120}={}){
 const rooms=new Map(),rates=new Map(),store=path.join(dataDir,'rooms.json');
 const ttl=r=>r.status==='waiting'?2*3600000:r.status==='finished'?3600000:24*3600000;
 if(persist&&fs.existsSync(store)){const rows=JSON.parse(fs.readFileSync(store,'utf8'));if(!Array.isArray(rows))throw Error('Invalid room store');for(const r of rows){if(/^[A-Z0-9]{6}$/.test(r.code)&&Array.isArray(r.members)&&Date.now()-r.updated<ttl(r))rooms.set(r.code,r);}}
 function save(){if(!persist)return;fs.mkdirSync(dataDir,{recursive:true,mode:0o700});fs.writeFileSync(store+'.tmp',JSON.stringify([...rooms.values()]),{mode:0o600});fs.renameSync(store+'.tmp',store);}
 function clean(){let changed=false;for(const [code,r]of rooms)if(Date.now()-r.updated>ttl(r)){rooms.delete(code);changed=true;}for(const [k,v]of rates)if(Date.now()-v.start>60000)rates.delete(k);if(changed)save();}
 const cleanup=setInterval(clean,60000);cleanup.unref();
 const snapshot=(r,m)=>({code:r.code,status:r.status,version:r.version,selfId:m.id,hostId:r.members[0]?.id,side:m.side,members:r.members.map(({id,name,side,left})=>({id,name,side,left})),game:r.game,gameMembers:r.gameMembers||r.members.map(({id,name,side})=>({id,name,side})),swapRequest:r.swapRequest||null,votes:r.votes,winner:r.winner??null,reason:r.reason??null});
 function member(n,side){const token=id();return{token,m:{id:id(),name:name(n),side,tokenHash:hash(token),left:false}};}
 function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');
  try{
   let url=new URL(req.url,'http://localhost'),p=url.pathname;
   if(p==='/heibaiqi'){res.writeHead(308,{Location:'/heibaiqi/'});return res.end();}
   if(p.startsWith('/heibaiqi/'))p=p.slice('/heibaiqi'.length);
   if(!p.startsWith('/api/')){
    if(!['GET','HEAD'].includes(req.method))fail('方法不支持',405);
    const f=decodeURIComponent(p).slice(1)||'index.html';
    const iconFiles=new Set(["assets/icons/favicon-32-v1.png", "assets/icons/apple-touch-icon-v1.png", "assets/icons/favicon-v1.svg"]);
    if(!/^(index\.html|game\.js|engine\.js|style\.css|release\.json|assets\/[a-zA-Z0-9_-]+\.jpg)$/.test(f)&&!iconFiles.has(f))fail('页面不存在',404);
    const full=path.join(root,f);if(!fs.existsSync(full))fail('页面不存在',404);
    const types={'.png':'image/png','.svg':'image/svg+xml','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.json':'application/json'};
    res.setHeader('Content-Type',types[path.extname(full)]);res.setHeader('Cache-Control','no-cache');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
    if(req.method==='HEAD')return res.end();return fs.createReadStream(full).pipe(res);
   }
   if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)fail('请求来源不正确',403);
   const remote=req.socket.remoteAddress||'',ip=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote)?String(req.headers['x-real-ip']||remote).slice(0,64):remote;
   const now=Date.now();if(!rates.has(ip)||now-rates.get(ip).start>60000){if(rates.size>10000)clean();rates.set(ip,{start:now,read:0,write:0});}
   const rate=rates.get(ip),kind=req.method==='GET'?'read':'write';if(++rate[kind]>(kind==='read'?360:90))fail('操作太频繁，请稍后再试',429);
   if(p==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,service:'reversi',release:process.env.RELEASE_ID||'development'});
   if(p==='/api/rooms'&&req.method==='POST'){
    clean();if(rooms.size>=maxRooms)fail('房间暂时已满，请稍后再试',503);if([...rooms.values()].filter(r=>r.ip===ip).length>=10)fail('创建的房间较多，请先离开不用的房间',429);
    const b=await body(req),{token,m}=member(b.nickname,1),alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let code;do{code=Array.from({length:6},()=>alphabet[crypto.randomInt(alphabet.length)]).join('');}while(rooms.has(code));
    const r={code,ip,status:'waiting',members:[m],version:1,updated:now,game:null,votes:[],requests:[]};rooms.set(code,r);save();return json(res,201,{token,room:snapshot(r,m)});
   }
   const match=p.match(/^\/api\/rooms\/([A-Za-z0-9]{6})(?:\/(join|action|leave))?$/);if(!match)fail('接口不存在',404);
   const r=rooms.get(match[1].toUpperCase()),op=match[2];if(!r||now-r.updated>ttl(r))fail('房间不存在或已过期',404);
   if(op==='join'&&req.method==='POST'){
    if(r.status!=='waiting'||r.members.length>=2)fail('房间已满或已经开始',409);const b=await body(req),{token,m}=member(b.nickname,-r.members[0].side);r.members.push(m);r.version++;r.updated=now;save();return json(res,200,{token,room:snapshot(r,m)});
   }
   const token=req.headers.authorization?.replace(/^Bearer /,'')||'';if(token.length<20||token.length>100)fail('房间身份已失效，请重新加入',401);
   const m=r.members.find(x=>x.tokenHash===hash(token)&&!x.left);if(!m)fail('房间身份已失效，请重新加入',401);
   if(!op&&req.method==='GET')return json(res,200,{room:snapshot(r,m)});
   if(req.method!=='POST')fail('方法不支持',405);
   if(op==='leave'){
    r.swapRequest=null;r.votes=[];
    if(r.status==='waiting'){r.members=r.members.filter(x=>x!==m);if(r.members.length)r.members[0].side=1;else rooms.delete(r.code);}
    else{m.left=true;if(r.status==='playing'){r.status='finished';r.game={...r.game,over:true};r.winner=-m.side;r.reason='left';}if(r.members.every(x=>x.left))rooms.delete(r.code);}
    r.version++;r.updated=now;save();return json(res,200,{ok:true});
   }
   if(op!=='action')fail('接口不存在',404);
   const b=await body(req);if(typeof b.requestId!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(b.requestId))fail('动作编号不正确');
   const key=m.id+':'+b.requestId,fingerprint=JSON.stringify([b.type,b.index]);const prior=r.requests.find(x=>x.key===key);
   if(prior){if(prior.fingerprint!==fingerprint)fail('动作编号重复',409);return json(res,200,{room:snapshot(r,m)});}
   if(b.expectedVersion!==r.version)fail('棋局已更新，请重试',409);
   if(b.type==='start'){
    if(m!==r.members[0]||r.status!=='waiting'||r.members.length!==2)fail('请等待两位玩家到齐，由房主开始',409);if(r.swapRequest)fail('请先处理交换申请',409);r.gameMembers=r.members.map(({id,name,side})=>({id,name,side}));r.game=initialState();r.status='playing';
   }else if(b.type==='move'){
    if(r.status!=='playing'||r.game.turn!==m.side)fail('还没轮到你落子',409);const next=play(r.game,b.index);if(!next)fail('这里不能落子',409);r.game=next;
    if(next.over){r.status='finished';const s=score(next.board);r.winner=Math.sign(s.guava-s.grape);}
   }else if(b.type==='resign'){
    if(r.status!=='playing')fail('本局已经结束',409);r.game={...r.game,over:true};r.status='finished';r.winner=-m.side;r.reason='resigned';
   }else if(['swap-request','swap-accept','swap-decline','swap-cancel'].includes(b.type)){
    if(!['waiting','finished'].includes(r.status)||r.members.some(x=>x.left))fail('只能在候场或完整对局结束后交换',409);
    if(b.type==='swap-request'){
     if(r.swapRequest)fail('已有交换申请，请先处理',409);
     if(r.members.length===1){m.side=-m.side;}else{r.swapRequest=m.id;}r.votes=[];
    }else{
     if(!r.swapRequest)fail('交换申请已结束',409);
     if(b.type==='swap-cancel'){if(r.swapRequest!==m.id)fail('只能取消自己的申请',403);}
     else{if(r.swapRequest===m.id)fail('需要由对方确认',403);if(b.type==='swap-accept'){
      if(r.game&&!r.gameMembers)r.gameMembers=r.members.map(({id,name,side})=>({id,name,side}));
      r.members.forEach(x=>{x.side=-x.side;});
     }}r.swapRequest=null;r.votes=[];
    }
   }else if(b.type==='replay'){
    if(r.swapRequest)fail('请先处理交换申请',409);
    if(r.status!=='finished'||r.members.some(x=>x.left))fail('请重新创建房间邀请朋友',409);if(!r.votes.includes(m.id))r.votes.push(m.id);
    if(r.votes.length===2){if(r.swapRequest)fail('请先处理交换申请',409);r.gameMembers=r.members.map(({id,name,side})=>({id,name,side}));r.game=initialState();r.status='playing';r.votes=[];r.winner=null;r.reason=null;}
   }else fail('不支持的动作');
   r.requests.push({key,fingerprint});r.requests=r.requests.slice(-64);r.version++;r.updated=now;save();return json(res,200,{room:snapshot(r,m)});
  }catch(e){if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'服务暂时不可用，请稍后重试'});else res.end();}
 });
 server.on('close',()=>clearInterval(cleanup));return server;
}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1];};const port=Number(arg('--port',process.env.PORT||4188)),host=arg('--host',process.env.HOST||'127.0.0.1');createApp().listen(port,host,()=>console.log(`Reversi listening on port ${port}`));
}
