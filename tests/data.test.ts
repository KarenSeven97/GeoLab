import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DataService} from '../src/data.ts';
test('coordinate search works without contacting a geocoder',async()=>{
  const result=await new DataService().search('40.7533, -73.9837',new AbortController().signal);
  assert.equal(result[0].lat,40.7533);assert.equal(result[0].lng,-73.9837);
});
test('partial Overpass responses never count as an empty region',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({remark:'Query timed out',elements:[]}),{status:200});
  try {const s=new DataService();await assert.rejects(s.buildings(0,0,new AbortController().signal),/未完整返回/);assert.equal(s.cache.length,0);}finally{globalThis.fetch=original;}
});
test('empty areas are valid and repeated viewport queries reuse cached data',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({elements:[]}),{status:200});};
  try {const s=new DataService();const signal=new AbortController().signal;const a=await s.buildings(0,0,signal);const b=await s.buildings(0,0,signal);assert.equal(a.buildings.length,0);assert.equal(a,b);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
test('an already cancelled query never reaches the network',async()=>{
  const s=new DataService();const abort=new AbortController();abort.abort();await assert.rejects(s.buildings(0,0,abort.signal),{name:'AbortError'});assert.equal(s.requests,0);
});
