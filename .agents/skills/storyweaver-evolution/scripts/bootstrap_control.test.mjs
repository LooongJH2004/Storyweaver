import test from 'node:test';
import assert from 'node:assert/strict';
import { controlLoader, cachedHandlerLoader } from './bootstrap_control.mjs';
const Async = Object.getPrototypeOf(async function(){}).constructor;
const audit = {stagingPath:'fixed.staged.json',promoteCommand:'fixed promotion'};

test('thin bootstrap executes only the registered control source with explicit globals', async () => {
  const state = new Map(); const output = [];
  const actual={exit_code:0,output:JSON.stringify({kind:'verified-transport-control',source:'store("trusted",1);text("ready");',sourceSha256:'sha'})};let calls=0;let record;
  const tools = {exec_command:async()=>calls++===0?actual:{exit_code:0},apply_patch:async p=>{record=JSON.parse(p.split('\n')[2].slice(1));return {};}};
  await new Async('tools','store','load','text',controlLoader('fixed-command','fixed-cwd','sha',audit))(tools,(k,v)=>state.set(k,v),k=>state.get(k),v=>output.push(v));
  assert.equal(state.get('trusted'),1); assert.deepEqual(output,['ready']);
  assert.deepEqual(record,actual);
  for(const result of [{exit_code:1},{exit_code:0,session_id:3},{exit_code:0,output:'{}'},{exit_code:0,output:'[]'}]) {
    let count=0;
    await assert.rejects(new Async('tools','store','load','text',controlLoader('fixed','cwd','sha',audit))({exec_command:async()=>count++===0?result:{exit_code:0},apply_patch:async()=>({})},()=>{},()=>{},()=>{}));
  }
  await assert.rejects(new Async('tools','store','load','text',controlLoader('fixed','cwd','sha',audit))({exec_command:async()=>actual,apply_patch:async()=>({isError:true})},()=>{},()=>{},()=>{}),/staging failed/);
});
test('cached loader runs a fixed trusted handler; actor payload remains data', async () => {
  const actor = 'throw Error("actor data must not execute")'; const state = new Map([['actor',actor],['handler','text(load("actor"));']]);const output=[];
  await new Async('tools','store','load','text',cachedHandlerLoader('handler'))({},(k,v)=>state.set(k,v),k=>state.get(k),v=>output.push(v));
  assert.deepEqual(output,[actor]);
  await assert.rejects(new Async('tools','store','load','text',cachedHandlerLoader('missing'))({},()=>{},()=>null,()=>{}),/handler lost/);
});
