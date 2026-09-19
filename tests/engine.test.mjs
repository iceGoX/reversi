import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,flipsFor,legalMoves,play,score,chooseMove,restoreGame} from '../engine.js';
test('standard opening and all four guava moves',()=>{
 const s=initialState(); assert.deepEqual(score(s.board),{guava:2,grape:2});
 assert.deepEqual(legalMoves(s.board,1),[19,26,37,44]);
 const n=play(s,19); assert.deepEqual(score(n.board),{guava:4,grape:1}); assert.equal(n.turn,-1);
 assert.deepEqual(legalMoves(n.board,-1),[18,20,34]); assert.equal(s.board[19],0);
});
test('illegal, occupied, noninteger and out of range moves rejected',()=>{
 const s=initialState(); for(const i of [-1,64,3.2,null,'19',0,27]) assert.equal(play(s,i),null);
});
test('flips every directly enclosed direction',()=>{
 const b=Array(64).fill(0), center=27; const dirs=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
 const targets=[];
 for(const [r,c] of dirs){const a=center+r*8+c; b[a]=-1; b[center+r*16+c*2]=1;targets.push(a);}
 assert.deepEqual(flipsFor(b,center,1).sort((a,b)=>a-b),targets.sort((a,b)=>a-b));
});
test('never wraps board edges, crosses gaps or own discs',()=>{
 const b=Array(64).fill(0); b[8]=-1;b[9]=1;assert.deepEqual(flipsFor(b,7,1),[]);
 b.fill(0);b[1]=-1;b[3]=1;assert.deepEqual(flipsFor(b,0,1),[]);
 b[1]=1;b[2]=-1;assert.deepEqual(flipsFor(b,0,1),[]);
});
test('newly flipped discs do not trigger chain reactions',()=>{
 const b=Array(64).fill(0);b[1]=-1;b[2]=1;b[9]=-1;b[17]=1;
 const n=play({board:b,turn:1,moves:0,over:false},0);assert.equal(n.board[1],1);assert.equal(n.board[9],-1);
});
test('pass, early finish, full finish and exact scores across reachable games',()=>{
 let seenPass=false,seenEarly=false;
 for(let seed=1;seed<=120;seed++){
   let s=initialState(), random=seed;
   while(!s.over){
     const options=legalMoves(s.board,s.turn);assert.ok(options.length);
     random=(random*1664525+1013904223)>>>0;const index=options[random%options.length];
     const prev=s;s=play(s,index);assert.equal(s.board.filter(Boolean).length,prev.board.filter(Boolean).length+1);
     assert.ok(s.moves<=60);
     if(s.passed){seenPass=true;assert.equal(legalMoves(s.board,s.passed).length,0);assert.ok(legalMoves(s.board,s.turn).length);}
   }
   assert.equal(legalMoves(s.board,1).length,0);assert.equal(legalMoves(s.board,-1).length,0);
   const points=score(s.board);assert.equal(points.guava+points.grape,s.moves+4);assert.equal(play(s,0),null);
   if(s.moves<60)seenEarly=true;
 }
 assert.ok(seenPass); assert.ok(seenEarly);
});
test('tie scores and terminal non-full board',()=>{
 const b=Array(64).fill(0);b[0]=1;b[63]=-1;assert.deepEqual(score(b),{guava:1,grape:1});
 const s={board:Array(64).fill(1),turn:1,moves:58,over:false};s.board[0]=0;s.board[1]=-1;
 const n=play(s,0);assert.equal(n.over,true);assert.deepEqual(score(n.board),{guava:64,grape:0});
});
test('save validation replays history and rejects corrupted saves',()=>{
 let s=initialState();const history=[];for(let i=0;i<12;i++){const index=legalMoves(s.board,s.turn)[0];history.push(index);s=play(s,index);}
 assert.deepEqual(restoreGame({version:1,mode:'ai',history}).state,s);
 for(const raw of [null,{}, {version:1,mode:'ai',history:[0]}, {version:1,mode:'bad',history:[]}, {version:1,mode:'local',history:[19,19]}])assert.equal(restoreGame(raw),null);
});
test('AI selects legal moves and finishes a whole game including pass turns',()=>{
 let s=initialState();while(!s.over){const choice=chooseMove(s,2);assert.ok(legalMoves(s.board,s.turn).includes(choice));s=play(s,choice);}
 assert.ok(s.moves<=60);assert.equal(chooseMove(s,2),null);
});
