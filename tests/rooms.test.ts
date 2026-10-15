import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { Rooms, type Room, RoomError } from '../server/rooms.ts';
import { MemoryStore, FileStore, Conflict } from '../server/store.ts';
import { handler } from '../server/http.ts';
import { emptyHand, total, RESOURCES, type Command } from '../src/engine.ts';
import type { RoomView } from '../src/online/types.ts';
const token=()=>randomBytes(32).toString('hex');
async function fixture(party=false){const store=new MemoryStore(),service=new Rooms(store),host=token(),one=party?token():host,two=token(),code='ABCD234';await service.create({code,token:host,name:'Lucía',capacity:3,mode:party?'party':'online'});if(party)await service.join(code,one,'Lucía');await service.join(code,two,'Mateo');return{store,service,host,one,two,code};}
async function started(party=false){const f=await fixture(party);await f.service.update(f.code,f.one,{op:'ready',ready:true});await f.service.update(f.code,f.two,{op:'ready',ready:true});const view=await f.service.update(f.code,f.host,{op:'start'});return{...f,view};}
function command(view:RoomView,cmd:Command,id=randomUUID()){return{op:'command',gameVersion:view.gameVersion,requestId:id,command:cmd};}
async function alter(f:Awaited<ReturnType<typeof fixture>>,fn:(room:Room)=>void){const r=(await f.store.read<Room>(f.code))!;fn(r.value);await f.store.write(f.code,r.value,r.etag);}

test('rooms are private, names validated and join codes do not grant existing seats',async()=>{
  const f=await fixture();await assert.rejects(()=>f.service.sync(f.code,token()),(e:RoomError)=>e.status===401);
  await assert.rejects(()=>f.service.create({code:'../evil',token:token(),name:'A',capacity:3,mode:'online'}));
  await assert.rejects(()=>f.service.join(f.code,token(),' '));await assert.rejects(()=>f.service.create({code:'NEWC234',token:token(),name:'A',capacity:9,mode:'online'}));
  const view=await f.service.sync(f.code,f.one);assert.equal(view.self,0);assert(!JSON.stringify(view).includes(f.one));assert(!JSON.stringify(view).includes('hostHash'));assert(!JSON.stringify(view).includes('"hash"'));
});
test('room creation and joining retry idempotently with the original session',async()=>{
  const f=await fixture();const again=await f.service.create({code:f.code,token:f.host,name:'Lucía',capacity:3,mode:'online'});assert.equal(again.seats.length,2);
  const joined=await f.service.join(f.code,f.two,'Otro nombre');assert.equal(joined.seats.length,2);assert.equal(joined.seats[1].name,'Mateo');await assert.rejects(()=>f.service.create({code:f.code,token:token(),name:'Intruso',capacity:3,mode:'online'}));
});
test('only the host can start, everyone must be ready and free seats become AI',async()=>{
  const f=await fixture();await assert.rejects(()=>f.service.update(f.code,f.host,{op:'start'}));await f.service.update(f.code,f.one,{op:'ready',ready:true});await f.service.update(f.code,f.two,{op:'ready',ready:true});await assert.rejects(()=>f.service.update(f.code,f.two,{op:'start'}),(e:RoomError)=>e.status===403);
  const v=await f.service.update(f.code,f.host,{op:'start'});assert.equal(v.game!.players.length,3);assert.equal(v.game!.players[2].bot,true);assert.equal(v.game!.players[0].bot,false);await assert.rejects(()=>f.service.join(f.code,token(),'Tardío'));
  const repeated=await f.service.update(f.code,f.host,{op:'start'});assert.equal(repeated.gameVersion,v.gameVersion);assert.deepEqual(repeated.game,v.game);
});
test('concurrent lobby joins and readiness updates preserve every seat',async()=>{
  const store=new MemoryStore(),s=new Rooms(store),host=token();await s.create({code:'RACE234',token:host,name:'Host',capacity:4,mode:'online'});
  const others=[token(),token(),token()];await Promise.all(others.map((t,i)=>s.join('RACE234',t,'Amigo '+i)));await Promise.all([host,...others].map(t=>s.update('RACE234',t,{op:'ready',ready:true})));const v=await s.sync('RACE234',host);assert.equal(v.seats.length,4);assert(v.seats.every(p=>p.ready));await assert.rejects(()=>s.join('RACE234',token(),'Quinto'));
});
test('Party television occupies no player seat and never receives private hands or deck order',async()=>{
  const f=await started(true);await alter(f,r=>{const g=r.game!;g.players[0].hand.ore=2;g.bank.ore-=2;g.players[1].hand.wood=3;g.bank.wood-=3;g.players[0].dev=[{type:'victory',turn:0}];});
  const tv=await f.service.sync(f.code,f.host),one=await f.service.sync(f.code,f.one),two=await f.service.sync(f.code,f.two);
  assert.equal(tv.screen,true);assert.equal(tv.self,null);assert(tv.game!.players.every(p=>total(p.hand)===0&&p.dev.length===0));assert.equal(tv.game!.deck.length,0);assert.equal(tv.deckCount,25);assert.deepEqual(tv.cardCounts,[2,3,0]);assert.equal(tv.scores[0],0);
  assert.equal(one.game!.players[0].hand.ore,2);assert.equal(one.game!.players[0].dev[0].type,'victory');assert.equal(one.scores[0],1);assert.equal(total(one.game!.players[1].hand),0);assert.equal(two.game!.players[1].hand.wood,3);assert.equal(two.game!.players[0].dev.length,0);
});
test('neither spectators nor other players can play the active player’s turn',async()=>{
  const f=await started(true);await assert.rejects(()=>f.service.update(f.code,f.host,command(f.view,{type:'settlement',id:0})),(e:RoomError)=>e.status===403);await assert.rejects(()=>f.service.update(f.code,f.two,command(f.view,{type:'settlement',id:0})),(e:RoomError)=>e.status===403);const g=await f.service.sync(f.code,f.one);assert.equal(g.game!.vertices.filter(v=>v.owner!==null).length,0);
});
test('commands are idempotent and stale versions cannot spend cards twice',async()=>{
  const f=await started();const input=command(f.view,{type:'settlement',id:0});const first=await f.service.update(f.code,f.one,input),duplicate=await f.service.update(f.code,f.one,input);assert.equal(first.gameVersion,duplicate.gameVersion);assert.equal(duplicate.game!.vertices.filter(v=>v.owner===0).length,1);
  await assert.rejects(()=>f.service.update(f.code,f.one,command(f.view,{type:'road',id:0})),(e:RoomError)=>e.status===409);
});
test('two concurrent commands from the same version commit at most once',async()=>{
  const f=await started();const results=await Promise.allSettled([f.service.update(f.code,f.one,command(f.view,{type:'settlement',id:0})),f.service.update(f.code,f.one,command(f.view,{type:'settlement',id:1}))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const v=await f.service.sync(f.code,f.one);assert.equal(v.game!.vertices.filter(x=>x.owner===0).length,1);
});
test('original participants reconnect after the start but code-only newcomers cannot impersonate them',async()=>{
  const f=await started();const v=await f.service.join(f.code,f.two,'Mateo');assert.equal(v.self,1);await assert.rejects(()=>f.service.join(f.code,token(),'Mateo'));await assert.rejects(()=>f.service.sync(f.code,'bad-token'));
});
test('a trade can be answered only by its recipient, outside their own turn',async()=>{
  const f=await started();await alter(f,r=>{const g=r.game!;g.phase='action';g.players[0].hand.wood=2;g.bank.wood-=2;g.players[1].hand.ore=1;g.bank.ore--;});let v=await f.service.sync(f.code,f.one);
  v=await f.service.update(f.code,f.one,command(v,{type:'offer',player:1,give:{...emptyHand(),wood:1},receive:{...emptyHand(),ore:1}}));await assert.rejects(()=>f.service.update(f.code,f.one,command(v,{type:'respond',player:1,accept:true})),(e:RoomError)=>e.status===403);
  const accepted=await f.service.update(f.code,f.two,command(v,{type:'respond',player:1,accept:true}));assert.equal(accepted.game!.players[1].hand.wood,1);assert.equal(total(accepted.game!.players[0].hand),0);const me=await f.service.sync(f.code,f.one);assert.equal(me.game!.players[0].hand.ore,1);assert.equal(me.game!.pendingTrade,null);
});
test('discard authorization permits own cards outside the active turn and rejects forged player indices',async()=>{
  const f=await started();await alter(f,r=>{const g=r.game!;g.phase='discard';g.discards=[0,4,0];g.players[1].hand.wood=8;g.bank.wood-=8;});const v=await f.service.sync(f.code,f.one);await assert.rejects(()=>f.service.update(f.code,f.one,command(v,{type:'discard',player:1,cards:{...emptyHand(),wood:4}})),(e:RoomError)=>e.status===403);
  const own=await f.service.update(f.code,f.two,command(v,{type:'discard',player:1,cards:{...emptyHand(),wood:4}}));assert.equal(own.game!.players[1].hand.wood,4);assert.equal(own.game!.phase,'robber');assert.equal(own.game!.bank.wood,15);
});
test('server draws hidden resources without ever returning the victim’s hand to the thief or TV',async()=>{
  const f=await started(true);await alter(f,r=>{const g=r.game!;g.phase='robber';g.robber=0;g.resume='action';g.vertices[g.tiles[9].vertices[0]].owner=1;g.players[1].hand.ore=2;g.players[1].hand.wheat=1;g.bank.ore-=2;g.bank.wheat--;});let v=await f.service.sync(f.code,f.one);v=await f.service.update(f.code,f.one,command(v,{type:'robber',tile:9}));assert.equal(v.cardCounts[1],3);assert.equal(total(v.game!.players[1].hand),0);const stolen=await f.service.update(f.code,f.one,command(v,{type:'steal',player:1,card:1}));assert.equal(total(stolen.game!.players[0].hand),1);assert.equal(total(stolen.game!.players[1].hand),0);assert.equal(stolen.cardCounts[1],2);const tv=await f.service.sync(f.code,f.host);assert(tv.game!.players.every(p=>total(p.hand)===0));
});
test('server rejects malformed commands and cannot be asked to import a fabricated game',async()=>{
  const f=await started();for(const cmd of [{type:'import',game:{}},{type:'settlement',id:-1},{type:'steal',player:1,card:'ore'},{type:'dev',card:'constructor'}])await assert.rejects(()=>f.service.update(f.code,f.one,{...command(f.view,{type:'roll'}),command:cmd}));
});
test('expired rooms deny reads, joins and actions',async()=>{const f=await fixture();await alter(f,r=>r.expiresAt=Date.now()-1);await assert.rejects(()=>f.service.sync(f.code,f.one),(e:RoomError)=>e.status===410);await assert.rejects(()=>f.service.join(f.code,token(),'Late'));});
test('local store persists across instances and refuses conflicting writes',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'isla-rooms-test-'));try{const one=new FileStore(dir),two=new FileStore(dir);await one.write('FILE234',{value:1},null);const a=await one.read<{value:number}>('FILE234');assert.equal((await two.read<{value:number}>('FILE234'))!.value.value,1);await two.write('FILE234',{value:2},a!.etag);await assert.rejects(()=>one.write('FILE234',{value:3},a!.etag),Conflict);assert.equal((await one.read<{value:number}>('FILE234'))!.value.value,2);}finally{await rm(dir,{recursive:true,force:true});}
});
test('HTTP rejects unauthenticated and oversized requests and marks responses private',async()=>{
  const f=await fixture(),route=handler(f.service);
  async function request(method:string,url:string,body?:string,authorization?:string){const req=Object.assign(Readable.from(body?[body]:[]),{method,url,headers:{'content-type':'application/json',...(authorization?{authorization:'Bearer '+authorization}:{})},socket:{remoteAddress:'test'}});const headers:Record<string,string>={},response={statusCode:200,setHeader(k:string,v:string){headers[k]=v;},end(text:string){(this as any).text=text;}};await route(req as any,response as any);return{status:response.statusCode,headers,body:JSON.parse((response as any).text)};}
  const denied=await request('GET','/api/rooms?code='+f.code);assert.equal(denied.status,401);assert.equal(denied.headers['Cache-Control'],'no-store, private');const huge=await request('POST','/api/rooms','x'.repeat(9000));assert.equal(huge.status,413);const malformed=await request('POST','/api/rooms','{');assert.equal(malformed.status,400);const good=await request('GET','/api/rooms?code='+f.code,undefined,f.one);assert.equal(good.status,200);assert.equal(good.body.self,0);
});
