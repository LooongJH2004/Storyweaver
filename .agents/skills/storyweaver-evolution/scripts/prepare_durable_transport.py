"""Construct fixed trusted wrappers; all host paths are transport metadata."""
import json
import pathlib


def durable_wrapper(config_path, capture_path, owner, transport_id, launcher_sha256, operation):
    scripts = pathlib.Path(__file__).resolve().parent
    command = "python '{}' '{}' '__CONFIG_SHA256__' '{}' '{}' '{}'".format(
        (scripts / 'durable_transport.py').as_posix(), config_path.as_posix(), launcher_sha256, operation, owner)
    directory = capture_path.as_posix()
    promoter = (scripts / 'bootstrap_capture.py').as_posix()
    return ('// @exec: {"max_output_tokens": 10000}\n'
        'const r=await tools.exec_command(' + json.dumps({'cmd': command, 'workdir': scripts.parents[3].as_posix(), 'max_output_tokens': 8000}) + ');'
        'let p;try{p=JSON.parse(r.output);}catch{}'
        'const valid=p&&p.transportId===' + json.dumps(transport_id) + '&&p.owner===' + json.dumps(owner)
        + '&&(p.sequence==="bootstrap"||Number.isInteger(p.sequence)&&p.sequence>=0)&&typeof p.body==="string";'
        'const stem=' + json.dumps(directory + '/actual-return-') + '+(valid?p.sequence:"error");'
        'const staged=stem+".staged.json",dest=stem+".json";'
        'const a=await tools.apply_patch("*** Begin Patch\\n*** Add File: "+staged+"\\n+"+JSON.stringify(r)+"\\n*** End Patch");'
        'if(a?.isError)throw Error("transport actual return staging failed");'
        'const saved=await tools.exec_command({cmd:' + json.dumps("python '" + promoter + "' promote '")
        + '+staged+"\' \'"+dest+"\'",workdir:' + json.dumps(scripts.parents[3].as_posix()) + ',max_output_tokens:1000});'
        'if(saved.exit_code!==0||saved.session_id!=null)throw Error("transport actual return persistence failed");'
        'if(r.exit_code!==0||r.session_id!=null||!valid)throw Error("transport durable host return failed");'
        'text(p.body);')
