import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, execute, RESOURCES, total, emptyHand, legalSettlements, legalRoads, points, longestLength, tradeRatio, COSTS, type Game, type Resource } from '../src/engine.ts';
import { botCommand } from '../src/bot.ts';

function seeded(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function fresh(n = 3, seed = 4) { return newGame(Array.from({ length: n }, (_, i) => ({ name: `Player ${i}`, bot: true })), seeded(seed)); }
function started(seed = 4) { let g = fresh(3, seed); while (g.phase.startsWith('setup')) g = execute(g, botCommand(g), seeded(1)); return g; }
function grant(g: Game, r: Resource, n: number, p = g.current) { g.players[p].hand[r] += n; g.bank[r] -= n; }
function balance(g: Game) { for (const r of RESOURCES) { assert.equal(g.bank[r] + g.players.reduce((n, p) => n + p.hand[r], 0), 19, r); assert(g.bank[r] >= 0); for (const p of g.players) assert(p.hand[r] >= 0 && Number.isInteger(p.hand[r])); } }

test('standard board topology, terrain, token distribution and ports', () => {
  for (let seed = 0; seed < 30; seed++) {
    const g = fresh(3, seed); assert.equal(g.tiles.length, 19); assert.equal(g.vertices.length, 54); assert.equal(g.edges.length, 72);
    assert.equal(g.edges.filter(e => e.tiles.length === 1).length, 30);
    assert.equal(g.vertices.filter(v => v.port).length, 18);
    assert.equal(g.tiles.filter(t => t.resource === 'desert').length, 1);
    assert.deepEqual(g.tiles.filter(t => t.number).map(t => t.number).sort((a,b) => a-b), [2,3,3,4,4,5,5,6,6,8,8,9,9,10,10,11,11,12]);
    for (const t of g.tiles.filter(t => t.number === 6 || t.number === 8)) for (const o of g.tiles.filter(o => o.id !== t.id && (o.number === 6 || o.number === 8))) assert(Math.max(Math.abs(t.q-o.q),Math.abs(t.r-o.r),Math.abs(t.q+t.r-o.q-o.r)) > 1);
    assert.equal(g.deck.length, 25); balance(g);
  }
});
test('snake setup, free initial pieces, second settlement resources and distance rule', () => {
  let g = fresh(); const order: number[] = [];
  while (g.phase.startsWith('setup')) { if (g.phase === 'setup-settlement') order.push(g.current); g = execute(g, botCommand(g)); balance(g); }
  assert.deepEqual(order, [0,1,2,2,1,0]); assert.equal(g.phase, 'roll'); assert.equal(g.turn, 1);
  for (let p = 0; p < 3; p++) { assert.equal(points(g,p),2); assert.equal(g.edges.filter(e => e.owner === p).length,2); assert(total(g.players[p].hand) >= 1); }
  for (const v of g.vertices.filter(v => v.owner !== null)) for (const e of v.edges.map(i => g.edges[i])) assert.equal(g.vertices[e.a === v.id ? e.b : e.a].owner,null);
  const bad = structuredClone(g); bad.phase = 'action'; assert.throws(() => execute(bad,{type:'settlement',id:g.vertices.find(v => v.owner !== null)!.id}));
});
test('rolling produces resources for all owners, cities double and robber blocks', () => {
  let g = started(); const tile = g.tiles.find(t => t.number === 6)!; g.robber = g.tiles.find(t => t.resource === 'desert')!.id;
  g.vertices.forEach(v => {v.owner=null;v.city=false;}); const v = g.vertices[tile.vertices[0]]; v.owner=0;v.city=true;
  g.players.forEach(p=>p.hand=emptyHand()); g.bank={wood:19,brick:19,sheep:19,wheat:19,ore:19};
  const next = execute(g,{type:'roll'},()=>.34); assert.deepEqual(next.dice,[3,3]); assert.equal(next.players[0].hand[tile.resource as Resource],2); balance(next);
  g.robber=tile.id; const blocked=execute(g,{type:'roll'},()=>.34); assert.equal(blocked.players[0].hand[tile.resource as Resource],0);
  assert.throws(()=>execute(next,{type:'roll'}));
});
test('seven requires exact discards and robber relocation before continuing', () => {
  let g=started(); const current=g.players[0].hand.wood; grant(g,'wood',10-current); g=execute(g,{type:'roll'},(()=>{let n=0;return()=>n++===0?.34:.51;})());
  assert.equal(g.phase,'discard'); const count=g.discards[0]; assert(count>=5);
  assert.throws(()=>execute(g,{type:'discard',player:0,cards:emptyHand()}));
  while(g.phase==='discard') g=execute(g,botCommand(g)); assert.equal(g.phase,'robber'); assert.throws(()=>execute(g,{type:'robber',tile:g.robber}));
  g=execute(g,botCommand(g)); if(g.phase==='steal')g=execute(g,botCommand(g));assert.equal(g.phase,'action');balance(g);
});
test('bank trade honors port ratios and rejects invalid or unavailable trades', () => {
  let g=started();g.phase='action'; for(const r of RESOURCES){g.bank[r]+=g.players[0].hand[r];g.players[0].hand[r]=0;}
  g.vertices.filter(v=>v.owner===0).forEach(v=>delete v.port); grant(g,'wood',4);assert.equal(tradeRatio(g,'wood'),4);
  g=execute(g,{type:'trade',give:'wood',receive:'ore'});assert.equal(g.players[0].hand.wood,0);assert.equal(g.players[0].hand.ore,1);balance(g);
  assert.throws(()=>execute(g,{type:'trade',give:'wood',receive:'ore'}));
  const v=g.vertices.find(v=>v.owner===0)!;v.port='any';assert.equal(tradeRatio(g,'wood'),3);v.port='wood';assert.equal(tradeRatio(g,'wood'),2);assert.equal(tradeRatio(g,'ore'),4);
});
test('development card age, once per turn, plenty, monopoly and free roads', () => {
  let g=started();g.phase='action';g.turn=5;g.players[0].dev=[{type:'roads',turn:5}];
  assert.throws(()=>execute(g,{type:'dev',card:'roads'}));g.players[0].dev[0].turn=4;
  const before=structuredClone(g.players[0].hand);g=execute(g,{type:'dev',card:'roads'});assert.equal(g.freeRoads,2);
  while(g.freeRoads)g=execute(g,{type:'road',id:legalRoads(g)[0]});assert.deepEqual(g.players[0].hand,before);assert(g.players[0].played);
  g.players[0].dev.push({type:'knight',turn:1});assert.throws(()=>execute(g,{type:'dev',card:'knight'}));
  g.players[0].played=false;g.players[0].dev.push({type:'plenty',turn:1});const sheep=g.players[0].hand.sheep;g=execute(g,{type:'dev',card:'plenty',resources:['sheep','sheep']});assert.equal(g.players[0].hand.sheep,sheep+2);balance(g);
  g.players[0].played=false;g.players[0].dev.push({type:'monopoly',turn:1});grant(g,'ore',3,1);const ores=g.players.reduce((n,p)=>n+p.hand.ore,0);g=execute(g,{type:'dev',card:'monopoly',resources:['ore']});assert.equal(g.players[0].hand.ore,ores);assert.equal(g.players[1].hand.ore,0);balance(g);
});
test('city upgrade costs, piece inventory and scoring', () => {
  let g=started();g.phase='action'; const v=g.vertices.find(v=>v.owner===0)!;for(const r of RESOURCES){g.bank[r]+=g.players[0].hand[r];g.players[0].hand[r]=0;}grant(g,'wheat',2);grant(g,'ore',3);
  g=execute(g,{type:'city',id:v.id});assert(g.vertices[v.id].city);assert.equal(points(g,0),3);assert.equal(total(g.players[0].hand),0);balance(g);assert.throws(()=>execute(g,{type:'city',id:v.id}));
});
test('road building before rolling restores the required dice phase', () => {
  let g=started();g.turn=4;g.players[0].dev=[{type:'roads',turn:1}];
  g=execute(g,{type:'dev',card:'roads'});assert.equal(g.phase,'action');assert.equal(g.freeRoads,2);
  while(g.freeRoads)g=execute(g,{type:'road',id:legalRoads(g)[0]});assert.equal(g.phase,'roll');
  assert.throws(()=>execute(g,{type:'end'}));g=execute(g,{type:'roll'},()=>.2);assert.equal(g.phase,'action');
});
test('longest road counts continuous trails and is interrupted by rival settlements', () => {
  const g=fresh();const path:number[]=[];const seen=new Set<number>();
  function find(v:number):boolean{if(path.length===6)return true;seen.add(v);for(const id of g.vertices[v].edges){const e=g.edges[id],next=e.a===v?e.b:e.a;if(seen.has(next))continue;path.push(id);if(find(next))return true;path.pop();}seen.delete(v);return false;}
  assert(find(0));path.forEach(id=>g.edges[id].owner=0);assert.equal(longestLength(g,0),6);
  const middleA=g.edges[path[2]],middleB=g.edges[path[3]];const mid=[middleA.a,middleA.b].find(id=>id===middleB.a||id===middleB.b)!;g.vertices[mid].owner=1;assert.equal(longestLength(g,0),3);
});
test('winner is detected with secret victory cards on their own turn', () => {
  let g=started();g.phase='action';g.players[0].dev=Array.from({length:8},()=>({type:'victory' as const,turn:0}));grant(g,'wood',1);grant(g,'brick',1);
  g=execute(g,{type:'road',id:legalRoads(g)[0]});assert.equal(g.phase,'finished');assert.equal(g.winner,0);assert.equal(points(g,0),10);assert.equal(points(g,0,false),2);
});
test('player trade conserves resources and rejects impossible offers', () => {
  let g=started();g.phase='action';grant(g,'wood',1);grant(g,'ore',1,1);const give=emptyHand(),receive=emptyHand();give.wood=1;receive.ore=1;g=execute(g,{type:'offer',player:1,give,receive});balance(g);give.wood=20;assert.throws(()=>execute(g,{type:'offer',player:1,give,receive}));
});
test('complete 3- and 4-player bot games reach victory while conserving all resources', () => {
  for(const [seed,n] of [[12,3],[41,3],[7,4],[28,4]]) {
    const rng=seeded(seed);let g=newGame(Array.from({length:n},(_,i)=>({name:`AI ${i}`,bot:true})),rng),actions=0;
    while(g.phase!=='finished'&&actions<12000){g=execute(g,botCommand(g),rng);balance(g);actions++;}
    assert.equal(g.phase,'finished',`seed ${seed}, turn ${g.turn}, actions ${actions}`);assert(points(g,g.winner!)>=10);
    console.log(`Simulation: ${n} players, seed ${seed}, ${g.turn} turns, ${actions} actions, winner ${g.winner}`);
  }
});
