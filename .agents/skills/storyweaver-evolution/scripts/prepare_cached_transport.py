"""Build transport control records only from a frozen coordinator template."""
import hashlib
import json
import pathlib
import subprocess


def source_digest(source):
    return hashlib.sha256(source.encode('utf8')).hexdigest()


def loader_sources(command, workdir, expected_sha, handler_key, audit=None):
    """Generate short loaders with fixed code-record identity and explicit globals."""
    module = pathlib.Path(__file__).with_name('bootstrap_control.mjs').as_uri()
    code = ('import {controlLoader,cachedHandlerLoader} from ' + json.dumps(module) + ';'
            'console.log(JSON.stringify({bootstrap:controlLoader(...' + json.dumps([command, workdir, expected_sha, audit or {'stagingPath': '', 'promoteCommand': ''}])
            + '),next:cachedHandlerLoader(' + json.dumps(handler_key) + ')}));')
    return json.loads(subprocess.check_output(['node', '--input-type=module', '-e', code]).decode('utf8'))


def cached_control(template, transport_id, input_path, capture_path, mode='raw-json'):
    """Replace only frozen path/identity fields, keeping Actor content out of source."""
    old_prefix, old_id = template['storeKey'].rsplit('-', 1)
    new_prefix, identifier = transport_id.rsplit('-', 1)
    def rewrite(source):
        return source.replace(old_id, identifier).replace(old_prefix + '-', new_prefix + '-')
    handler = rewrite(template['nextCode'])
    control = rewrite(template['bootstrapCode'])
    if mode not in ['raw-json', 'typed-fields']:
        raise ValueError('Unknown transport view mode')
    if mode == 'typed-fields':
        context_module = pathlib.Path(__file__).with_name('context_units.mjs').as_uri()
        frames_module = pathlib.Path(__file__).with_name('bootstrap_frames.mjs').as_uri()
        sources = json.loads(subprocess.check_output(['node','--input-type=module','-e',
            'import {contextCode} from '+json.dumps(context_module)+';import {frameCode} from '+json.dumps(frames_module)+';console.log(JSON.stringify({context:contextCode(),create:frameCode().create}));']).decode('utf8'))
        original_state = 'const state=(' + sources['create'] + ')(r.output,K,3000);'
        if control.count(original_state) != 1 or handler.count('text(JSON.stringify(e));') != 1 or handler.count('output:JSON.stringify(envelope)') != 1 or handler.count('try {const e=') != 1:
            raise ValueError('Frozen framing source does not match explicit typed-fields integration points')
        handler = sources['context'] + '\n' + handler.replace('output:JSON.stringify(envelope)','output:renderContextEnvelope(envelope)').replace('text(JSON.stringify(e));','text(renderContextEnvelope(e));').replace('try {const e=', 'try {if(s.cursor===s.frames.length&&JSON.stringify(decodeContextFrames(s.frames))!==JSON.stringify(JSON.parse(s.originalRawOutput)))throw Error("context final full-value mismatch");const e=')
        # Replace the original handler literal before switching the state constructor.
        control = control.replace(json.dumps(rewrite(template['nextCode'])),json.dumps(handler))
        control = control.replace(original_state,sources['context']+'\nconst state=createContextState(JSON.parse(r.output),K,3000);state.originalRawOutput=r.output;await persist("view",{kind:"typed-field-view",rawOutput:r.output,units:state.units,viewEncoding:state.viewEncoding,assemblyRepresentation:"unit-payload-concat",rawByteEqualityClaim:false});')
    # The generated names already follow the frozen input/capture naming convention.
    assert pathlib.Path(input_path).name in control and pathlib.Path(capture_path).name in control
    handler_key = transport_id + '-handler'
    loader = loader_sources('', '', '', handler_key)['next']
    control = control.replace(json.dumps(handler), json.dumps(loader))
    insertion = ('const handlerSource=' + json.dumps(handler) + ';'
        'await persist("handler",{kind:"sender-handler",transportId:K,source:handlerSource});'
        'store(' + json.dumps(handler_key) + ',handlerSource);')
    control = control.replace('const ready=', insertion + 'const ready=')
    if json.dumps(loader) not in control:
        raise ValueError('Frozen template ready.nextCode replacement failed')
    return {'controlSource': control, 'handlerSource': handler, 'nextCode': loader,
            'handlerKey': handler_key, 'controlSha256': source_digest(control),
            'handlerSha256': source_digest(handler), 'loaderSha256': source_digest(loader)}
