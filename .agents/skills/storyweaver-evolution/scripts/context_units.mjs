/** Preserve ordered JSON fields as typed containers and original scalar text units. */
export function unitize(value) {
  const units=[];
  const visit=(v,path)=>{
    const tool=path.length===3&&path[0].key==='input'&&path[1].key==='tools'&&Number.isInteger(path[2].index);
    const kind=tool?'json':v===null?'null':Array.isArray(v)?'array':typeof v;
    if(!['json','null','array','object','string','boolean','number'].includes(kind)||kind==='number'&&!Number.isFinite(v))throw Error('context unsupported JSON value');
    const payload=kind==='string'?v:kind==='object'?JSON.stringify(Object.keys(v)):kind==='array'?String(v.length):JSON.stringify(v);
    units.push({unitIndex:units.length,fieldPath:path,unitKind:kind,encoding:kind==='string'?'decoded-string':'json',payload});
    if(kind==='object')for(const key of Object.keys(v))visit(v[key],[...path,{key}]);
    if(kind==='array')for(let index=0;index<v.length;index++)visit(v[index],[...path,{index}]);
  };
  visit(value,[]);return units;
}

/** Decode the complete ordered view, rejecting missing, repeated or conflicting paths. */
export function decodeUnits(units) {
  let cursor=0;
  const read=path=>{
    const u=units[cursor];if(!u||u.unitIndex!==cursor||JSON.stringify(u.fieldPath)!==JSON.stringify(path))throw Error('context unit order/path mismatch');cursor++;
    if(u.encoding!==(u.unitKind==='string'?'decoded-string':'json')||typeof u.payload!=='string')throw Error('context unit encoding mismatch');
    if(u.unitKind==='string')return u.payload;
    const v=JSON.parse(u.payload);
    if(u.unitKind==='object'){
      if(!Array.isArray(v)||v.some(k=>typeof k!=='string')||new Set(v).size!==v.length)throw Error('context object keys invalid');
      const result={};for(const key of v)Object.defineProperty(result,key,{value:read([...path,{key}]),enumerable:true,writable:true,configurable:true});return result;
    }
    if(u.unitKind==='array'){
      if(!Number.isInteger(v)||v<0)throw Error('context array length invalid');
      return Array.from({length:v},(_,index)=>read([...path,{index}]));
    }
    if(u.unitKind==='json')return v;
    if(u.unitKind==='null'?v!==null:typeof v!==u.unitKind||!['number','boolean'].includes(u.unitKind))throw Error('context scalar type mismatch');
    return v;
  };
  const value=read([]);if(cursor!==units.length)throw Error('context extra units');return value;
}

/** Encode a deterministic lossless view separately from original raw JSON bytes. */
export function encodeUnits(units){return JSON.stringify(units);}

/** Build bounded field-aware frames with original decoded string payloads. */
export function createContextState(value,transportId,envelopeCodeUnits) {
  if(typeof transportId!=='string'||transportId.length===0||!Number.isInteger(envelopeCodeUnits)||envelopeCodeUnits<1)throw Error('context invalid framing configuration');
  const units=unitize(value);const decoded=decodeUnits(units);
  if(JSON.stringify(decoded)!==JSON.stringify(value))throw Error('context initial full-value mismatch');
  const frames=[];let globalOffset=0;const bound=encodeUnits(units).length+units.length;
  for(const unit of units){
    let offset=0;
    do{
      let end=offset,payload='';
      const envelope=()=>({kind:'frame',transportId,seq:frames.length,total:bound,start:globalOffset,end:globalOffset+payload.length,payload,frameComplete:true,fieldPath:unit.fieldPath,unitIndex:unit.unitIndex,unitKind:unit.unitKind,encoding:unit.encoding,unitStart:offset,unitEnd:end,unitLength:unit.payload.length});
      while(end<unit.payload.length){const point=String.fromCodePoint(unit.payload.codePointAt(end));payload+=point;end+=point.length;if(JSON.stringify(envelope()).length>envelopeCodeUnits||renderContextEnvelope(envelope()).length>envelopeCodeUnits){payload=payload.slice(0,-point.length);end-=point.length;break;}}
      if(end===offset&&offset<unit.payload.length||JSON.stringify(envelope()).length>envelopeCodeUnits||renderContextEnvelope(envelope()).length>envelopeCodeUnits)throw Error('context envelope buffer too small');
      frames.push(envelope());globalOffset+=payload.length;offset=end;
    }while(offset<unit.payload.length);
  }
  for(const frame of frames)frame.total=frames.length;
  return {version:1,transportId,body:units.map(u=>u.payload).join(''),units,viewEncoding:encodeUnits(units),frames,cursor:0,pending:null,acknowledged:0,status:'ready',envelopeCodeUnits,viewMode:'typed-fields'};
}

/** Reconstruct every unit from complete continuous field frames and decode all values. */
export function decodeContextFrames(frames) {
  const units=[];let globalOffset=0;
  for(let index=0;index<frames.length;index++){
    const f=frames[index];if(f.seq!==index||f.total!==frames.length||f.frameComplete!==true||f.start!==globalOffset||f.end!==f.start+f.payload.length)throw Error('context frame sequence/offset mismatch');
    if(f.unitIndex===units.length){if(f.unitStart!==0)throw Error('context unit offset gap');units.push({unitIndex:f.unitIndex,fieldPath:f.fieldPath,unitKind:f.unitKind,encoding:f.encoding,payload:'',length:f.unitLength});}
    const u=units.at(-1);if(f.unitIndex!==u.unitIndex||JSON.stringify(f.fieldPath)!==JSON.stringify(u.fieldPath)||f.unitKind!==u.unitKind||f.encoding!==u.encoding||f.unitLength!==u.length||f.unitStart!==u.payload.length||f.unitEnd!==f.unitStart+f.payload.length)throw Error('context frame field mismatch');
    u.payload+=f.payload;globalOffset=f.end;
  }
  if(units.some(u=>u.payload.length!==u.length))throw Error('context incomplete unit');
  return decodeUnits(units);
}

/** Display string units directly after metadata without changing their original characters. */
export function renderContextEnvelope(envelope){if(envelope.kind!=='frame')return JSON.stringify(envelope);const {payload,...metadata}=envelope;return JSON.stringify(metadata)+'\n'+payload;}

/** Generate frozen transport code from explicit function implementations, never Actor data. */
export function contextCode(){return [unitize,decodeUnits,encodeUnits,createContextState,decodeContextFrames,renderContextEnvelope].map(f=>f.toString()).join('\n');}
