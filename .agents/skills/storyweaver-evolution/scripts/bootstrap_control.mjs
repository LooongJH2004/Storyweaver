/** Generate a short loader for coordinator-frozen transport code, never Actor data. */
export function controlLoader(command, workdir, expectedSourceSha256, audit) {
  return '// @exec: {"max_output_tokens": 10000}\n'
    + 'const r=await tools.exec_command(' + JSON.stringify({ cmd: command, workdir, max_output_tokens: 15000 }) + ');'
    + 'const p=await tools.apply_patch("*** Begin Patch\\n*** Add File: "+' + JSON.stringify(audit.stagingPath) + '+"\\n+"+JSON.stringify(r)+"\\n*** End Patch");if(p?.isError)throw Error("transport control return staging failed");'
    + 'const saved=await tools.exec_command(' + JSON.stringify({cmd:audit.promoteCommand,workdir,max_output_tokens:1000}) + ');if(saved.exit_code!==0||saved.session_id!=null)throw Error("transport control return persistence failed");'
    + 'if(r.exit_code!==0||r.session_id!=null)throw Error("transport control load failed");'
    + 'const c=JSON.parse(r.output);if(!c||typeof c!=="object"||Array.isArray(c)||c.kind!=="verified-transport-control"||typeof c.source!=="string"||c.sourceSha256!==' + JSON.stringify(expectedSourceSha256) + ')throw Error("transport control identity failed");'
    + 'const A=Object.getPrototypeOf(async function(){}).constructor;'
    + 'await new A("tools","store","load","text",c.source)(tools,store,load,text);';
}

/** Generate a short next loader whose only executable input is the cached trusted handler. */
export function cachedHandlerLoader(handlerKey) {
  return '// @exec: {"max_output_tokens": 10000}\n'
    + 'const h=load(' + JSON.stringify(handlerKey) + ');if(typeof h!=="string")throw Error("transport handler lost");'
    + 'const A=Object.getPrototypeOf(async function(){}).constructor;'
    + 'await new A("tools","store","load","text",h)(tools,store,load,text);';
}
