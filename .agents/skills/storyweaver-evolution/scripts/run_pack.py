"""Initialize and verify immutable inputs for a Storyweaver evaluation round."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import subprocess
from pathlib import Path


SECRET_KEY = re.compile(r"(api.?key|secret|password|access.?token|auth.?token|credential)", re.I)
RUN_ID = re.compile(r"[a-z0-9][a-z0-9-]{5,63}\Z")
E2E_FLAGS = ("continuation", "laterPressure", "directorProbe", "voiceScene", "voiceSceneCue",
             "voiceSceneDirector", "voiceAuthorFocus")


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def file_set(path: Path) -> list[Path]:
    if path.is_file():
        return [path]
    if not path.is_dir():
        raise ValueError(f"Missing file or directory: {path}")
    files = sorted(p for p in path.rglob("*") if p.is_file())
    if not files:
        raise ValueError(f"Empty directory: {path}")
    return files


def fingerprint(path: Path) -> dict[str, object]:
    files = file_set(path)
    rows = [(str(p.relative_to(path) if path.is_dir() else Path(p.name)).replace("\\", "/"), digest(p)) for p in files]
    h = hashlib.sha256()
    for name, sha in rows:
        h.update(f"{name}\0{sha}\n".encode())
    return {"path": str(path.resolve()), "sha256": h.hexdigest(), "files": len(rows)}


def read_config(path: Path) -> dict[str, object]:
    config = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(config, dict):
        raise ValueError("Config must be a JSON object")
    def check(value: object, trail: str = "") -> None:
        if isinstance(value, dict):
            for key, item in value.items():
                if SECRET_KEY.search(key) and key != "credentialRefPresent":
                    raise ValueError(f"Config contains a credential-like field: {trail}{key}")
                check(item, f"{trail}{key}.")
        elif isinstance(value, list):
            for item in value:
                check(item, trail)
    check(config)
    if "credentialRefPresent" in config and type(config["credentialRefPresent"]) is not bool:
        raise ValueError("credentialRefPresent must be a boolean, never a credential reference")
    required = ("model", "provider", "reasoningEffort", "mode", "budget", "decisionRule", "resolvedE2eFlags",
                "directorInstruction", "actorFacingBeat")
    for key in required:
        if key not in config:
            raise ValueError(f"Config missing {key}")
    if config["mode"] not in ("smoke", "comparative"):
        raise ValueError("mode must be smoke or comparative")
    entrypoint = config.get("entrypoint", "longform")
    if entrypoint not in ("longform", "director-boundary"):
        raise ValueError("entrypoint must be longform or director-boundary")
    if config["provider"] != "deepseek-official":
        raise ValueError("The current longform e2e only supports provider deepseek-official")
    flags = config["resolvedE2eFlags"]
    if not isinstance(flags, dict) or set(flags) != set(E2E_FLAGS) or any(type(flags[key]) is not bool for key in E2E_FLAGS):
        raise ValueError("resolvedE2eFlags must contain exactly the seven effective boolean e2e flags")
    if (flags["laterPressure"] and not flags["continuation"]
            or flags["directorProbe"] and not flags["laterPressure"]
            or any(flags[key] for key in ("voiceSceneCue", "voiceSceneDirector", "voiceAuthorFocus"))
               and not flags["voiceScene"]):
        raise ValueError("resolvedE2eFlags contain an impossible dependent setting")
    if ((flags["laterPressure"] and not flags["continuation"])
            or (flags["directorProbe"] and not flags["laterPressure"])
            or any(flags[key] and not flags["voiceScene"] for key in
                   ("voiceSceneCue", "voiceSceneDirector", "voiceAuthorFocus"))):
        raise ValueError("resolvedE2eFlags contain an impossible effective combination")
    if any(not isinstance(config[key], str) for key in ("directorInstruction", "actorFacingBeat")):
        raise ValueError("directorInstruction and actorFacingBeat must be strings, including empty defaults")
    if entrypoint == "director-boundary" and (type(config.get("directorRuns")) is not int or config["directorRuns"] != 1
            or config["directorInstruction"] or config["actorFacingBeat"]
            or any(flags.values())):
        raise ValueError("Director boundary replay needs directorRuns=1, empty instructions and false e2e flags")
    if not isinstance(config["decisionRule"], str) or not config["decisionRule"].strip():
        raise ValueError("decisionRule must be nonempty")
    budget = config["budget"]
    budget_fields = ("maxTokens", "maxMinutes", "maxCost", "maxFailures")
    if not isinstance(budget, dict) or any(key not in budget for key in budget_fields):
        raise ValueError("budget must register maxTokens/maxMinutes/maxCost/maxFailures")
    token_budget = budget["maxTokens"]
    if token_budget is not None and (type(token_budget) not in (int, float)
                                     or not math.isfinite(token_budget) or token_budget < 0):
        raise ValueError("maxTokens must be a nonnegative number or null for no token limit")
    if any(type(budget[key]) not in (int, float) or not math.isfinite(budget[key]) or budget[key] < 0
           for key in ("maxMinutes", "maxCost", "maxFailures")):
        raise ValueError("maxMinutes/maxCost/maxFailures must be nonnegative numbers")
    replays = config.get("replays")
    if not isinstance(replays, list) or not replays:
        raise ValueError("config.replays must be a nonempty list")
    if any(not isinstance(row, dict) or not isinstance(row.get("stage"), str) for row in replays):
        raise ValueError("Each replay must have a stage string")
    if len({row["stage"] for row in replays}) != len(replays):
        raise ValueError("Replay stages must be unique")
    case_labels = [row.get("case") for row in replays]
    if any(not isinstance(case, str) or not case.strip() for case in case_labels) or len(set(case_labels)) != 1:
        raise ValueError("One run pack must use exactly one nonempty case label and frozen scenario")
    if config["mode"] == "comparative":
        if ((token_budget is not None and token_budget <= 0)
                or any(budget[key] <= 0 for key in ("maxMinutes", "maxCost"))):
            raise ValueError("Comparative numeric limits must be positive")
        if not isinstance(config.get("holdout"), str) or not config["holdout"].strip():
            raise ValueError("Comparative runs require a registered holdout")
        samples: dict[tuple[str, str], set[int]] = {}
        split = "pairedRunId" in config
        if not split:
            guidance = config.get("guidanceInputByVariant")
            if (not isinstance(guidance, dict) or set(guidance) != {"A", "B"}
                    or any(value is not None and value not in ("baseline-guidance", "candidate-guidance")
                           for value in guidance.values())
                    or guidance["A"] == guidance["B"]):
                raise ValueError("Single-pack comparison needs distinct A/B guidance input labels or null")
        if split and (not isinstance(config.get("comparisonId"), str) or not config["comparisonId"].strip()
                      or not isinstance(config["pairedRunId"], str) or not RUN_ID.fullmatch(config["pairedRunId"])
                      or config.get("variant") not in ("A", "B")):
            raise ValueError("Split comparative pack needs comparisonId, pairedRunId and variant A/B")
        for row in replays:
            if not isinstance(row.get("case"), str) or not row["case"]:
                raise ValueError("Comparative replay needs a case")
            if row.get("variant") not in ("A", "B") or type(row.get("replicate")) is not int or row["replicate"] < 1:
                raise ValueError("Comparative replay needs variant A/B and positive integer replicate")
            key = (row["case"], row["variant"])
            samples.setdefault(key, set()).add(row["replicate"])
        cases = {case for case, _ in samples}
        variants = (config["variant"],) if split else ("A", "B")
        if split and any(variant != config["variant"] for _, variant in samples):
            raise ValueError("Split pack replays must all use its registered variant")
        if any(len(samples.get((case, variant), set())) < 2 for case in cases for variant in variants):
            raise ValueError("Comparative replay needs at least two independent replicates per case and variant")
        if sum(len(replicates) for replicates in samples.values()) != len(replays):
            raise ValueError("Duplicate case/variant/replicate in replays")
    return config


def inside_repo(repo: Path, value: str) -> Path:
    path = (repo / value).resolve()
    if not path.is_relative_to(repo):
        raise ValueError(f"Path outside repository: {value}")
    return path


def initialize(args: argparse.Namespace) -> None:
    repo = Path(args.repo).resolve()
    run_dir = Path(args.run_dir).resolve()
    if not RUN_ID.fullmatch(args.run_id):
        raise ValueError("run-id must be 6–64 lowercase letters, digits or hyphens")
    if run_dir.exists():
        raise ValueError(f"Run directory already exists: {run_dir}")
    if not args.source:
        raise ValueError("At least one --source path is required")
    if not args.input or not any(item.startswith("fixture=") for item in args.input):
        raise ValueError("At least one --input fixture=PATH is required")
    config_path = inside_repo(repo, args.config)
    config = read_config(config_path)
    if config.get("pairedRunId") == args.run_id:
        raise ValueError("pairedRunId must differ from run-id")
    for row in config["replays"]:
        stage_name = row["stage"]
        if not RUN_ID.fullmatch(stage_name) or not stage_name.startswith(args.run_id + "-"):
            raise ValueError(f"Replay stage must start with {args.run_id}-: {stage_name}")
        stage = repo / ".artifacts" / "longform-performance" / stage_name
        if stage.exists():
            raise ValueError(f"E2E stage already exists: {stage}")
    sources = [fingerprint(inside_repo(repo, value)) for value in args.source]
    build = fingerprint(inside_repo(repo, args.build_path))
    inputs: dict[str, Path] = {}
    for item in args.input:
        label, sep, value = item.partition("=")
        if not sep or not re.fullmatch(r"[a-z][a-z0-9-]*", label) or label in inputs:
            raise ValueError(f"Invalid or duplicate input label: {item}")
        path = inside_repo(repo, value)
        if not path.is_file():
            raise ValueError(f"Input must be a file: {path}")
        inputs[label] = path
    if config.get("entrypoint") == "director-boundary" and "boundary" not in inputs:
        raise ValueError("Director boundary replay needs --input boundary=PATH")
    if config["mode"] == "comparative" and "pairedRunId" not in config:
        guidance = config["guidanceInputByVariant"]
        if any(label is not None and label not in inputs for label in guidance.values()):
            raise ValueError("A/B guidance input label is not frozen")
        hashes = [digest(inputs[label]) if label is not None else None for label in guidance.values()]
        if hashes[0] == hashes[1]:
            raise ValueError("A/B guidance contents are identical")
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=repo, check=True, capture_output=True, text=True).stdout.strip()
    manifest = {
        "schema": 2, "runId": args.run_id, "gitHead": head, "repo": str(repo),
        "stageRoot": str(repo / ".artifacts" / "longform-performance"), "mode": config["mode"], "configSha256": digest(config_path),
        "build": build, "sources": sources,
        "inputs": {label: {"source": str(path), "sha256": digest(path), "copy": f"inputs/{label}{path.suffix}"}
                   for label, path in sorted(inputs.items())},
    }
    run_dir.mkdir(parents=True, exist_ok=False)
    try:
        (run_dir / "inputs").mkdir()
        shutil.copyfile(config_path, run_dir / "config.json")
        for label, path in inputs.items():
            shutil.copyfile(path, run_dir / manifest["inputs"][label]["copy"])
        raw = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
        (run_dir / "manifest.json").write_bytes(raw.encode("utf-8"))
        (run_dir / "manifest.sha256").write_text(hashlib.sha256(raw.encode()).hexdigest() + "\n", encoding="ascii")
    except BaseException:
        shutil.rmtree(run_dir)
        raise
    print(f"Initialized {run_dir} ({len(config['replays'])} reserved replay stages)")


def validate(args: argparse.Namespace) -> None:
    run_dir = Path(args.run_dir).resolve()
    raw = (run_dir / "manifest.json").read_bytes()
    expected = (run_dir / "manifest.sha256").read_text(encoding="ascii").strip()
    if hashlib.sha256(raw).hexdigest() != expected:
        raise ValueError("Manifest hash mismatch")
    manifest = json.loads(raw)
    if manifest["schema"] != 2:
        raise ValueError("Unsupported manifest schema")
    config_copy = run_dir / "config.json"
    config = read_config(config_copy)
    if digest(config_copy) != manifest["configSha256"]:
        raise ValueError("Frozen config changed")
    for label, item in manifest["inputs"].items():
        copy = run_dir / item["copy"]
        if digest(copy) != item["sha256"] or digest(Path(item["source"])) != item["sha256"]:
            raise ValueError(f"Input changed: {label}")
    if "fixture" not in manifest["inputs"]:
        raise ValueError("Frozen fixture is missing")
    if config.get("entrypoint") == "director-boundary" and "boundary" not in manifest["inputs"]:
        raise ValueError("Frozen director boundary is missing")
    if config["mode"] != manifest["mode"]:
        raise ValueError("Frozen mode changed")
    if config["mode"] == "comparative" and "pairedRunId" not in config:
        guidance = config["guidanceInputByVariant"]
        hashes = [manifest["inputs"][label]["sha256"] if label is not None else None for label in guidance.values()]
        if hashes[0] == hashes[1]:
            raise ValueError("Frozen A/B guidance contents are identical")
    for name, item in [("build", manifest["build"]), *(("source", row) for row in manifest["sources"])]:
        current = fingerprint(Path(item["path"]))
        if current["sha256"] != item["sha256"] or current["files"] != item["files"]:
            raise ValueError(f"Frozen {name} changed: {item['path']}")
    print(f"Validated {run_dir} (stage {manifest['runId']})")


def compare_packs(left_dir: Path, right_dir: Path) -> None:
    if left_dir.resolve() == right_dir.resolve():
        raise ValueError("Split comparison needs two distinct run packs")
    packs = []
    for path in (left_dir, right_dir):
        validate(argparse.Namespace(run_dir=str(path)))
        packs.append((json.loads((path / "manifest.json").read_text(encoding="utf-8")), read_config(path / "config.json")))
    (left_manifest, left), (right_manifest, right) = packs
    if left.get("mode") != "comparative" or right.get("mode") != "comparative":
        raise ValueError("Both split packs must be comparative")
    if (left.get("pairedRunId") != right_manifest["runId"] or right.get("pairedRunId") != left_manifest["runId"]
            or left.get("comparisonId") != right.get("comparisonId") or left.get("variant") == right.get("variant")):
        raise ValueError("Split comparison is not reciprocal with opposite variants")
    equal_fields = ("entrypoint", "directorRuns", "model", "provider", "reasoningEffort", "resolvedE2eFlags", "budget", "decisionRule", "holdout")
    if any(left.get(key) != right.get(key) for key in equal_fields):
        raise ValueError("Split comparison settings differ")
    if left_manifest["inputs"]["fixture"]["sha256"] != right_manifest["inputs"]["fixture"]["sha256"]:
        raise ValueError("Split comparison fixtures differ")
    for label in set(left_manifest["inputs"]) | set(right_manifest["inputs"]):
        if label == "fixture":
            continue
        if left_manifest["inputs"].get(label, {}).get("sha256") != right_manifest["inputs"].get(label, {}).get("sha256"):
            raise ValueError(f"Split comparison input differs: {label}")
    schedule = lambda config: {(row["case"], row["replicate"]) for row in config["replays"]}
    if schedule(left) != schedule(right):
        raise ValueError("Split comparison case/replicate plans differ")
    changes = [left_manifest["build"]["sha256"] != right_manifest["build"]["sha256"]
               or [s["sha256"] for s in left_manifest["sources"]] != [s["sha256"] for s in right_manifest["sources"]],
               left["directorInstruction"] != right["directorInstruction"],
               left["actorFacingBeat"] != right["actorFacingBeat"]]
    if sum(changes) != 1:
        raise ValueError("Split comparison must change exactly one factor: source/build, directorInstruction, or actorFacingBeat")
    print(f"Compared split packs {left_manifest['runId']} and {right_manifest['runId']}; quality remains for review")


def postflight(args: argparse.Namespace, skip_pair_check: bool = False) -> None:
    run_dir = Path(args.run_dir).resolve()
    manifest = json.loads((run_dir / "manifest.json").read_text(encoding="utf-8"))
    config = read_config(run_dir / "config.json")
    if "pairedRunId" in config and not skip_pair_check:
        if args.paired_run_dir is None:
            raise ValueError("Split comparative postflight requires --paired-run-dir")
        paired_dir = Path(args.paired_run_dir).resolve()
        compare_packs(run_dir, paired_dir)
        postflight(argparse.Namespace(run_dir=str(paired_dir), paired_run_dir=None), skip_pair_check=True)
    issues: list[str] = []
    for replay in config["replays"]:
        stage = replay["stage"]
        if config.get("entrypoint") == "director-boundary":
            report_path = Path(manifest["stageRoot"]) / stage / "director-replay.json"
            if not report_path.is_file():
                issues.append(f"{stage}: missing director-replay.json")
                continue
            try:
                report = json.loads(report_path.read_text(encoding="utf-8"))
            except (OSError, ValueError) as error:
                issues.append(f"{stage}: unreadable director-replay.json: {error}")
                continue
            expected = {"stage": stage, "provider": config["provider"], "model": config["model"],
                        "reasoningEffort": config["reasoningEffort"],
                        "boundarySha256": manifest["inputs"]["boundary"]["sha256"],
                        "archivePath": str(run_dir / manifest["inputs"]["boundary"]["copy"]),
                        "directorRuns": 1, "directorInstruction": "", "refreshDirectorGuidance": False,
                        "directorGuidancePath": None, "fixedBoundary": True}
            for key, value in expected.items():
                if report.get(key) != value:
                    issues.append(f"{stage}: {key} differs from registration")
            if not isinstance(report.get("directorPolicySha256"), str) or not re.fullmatch(r"[0-9a-f]{64}", report["directorPolicySha256"]):
                issues.append(f"{stage}: missing installed Director policy SHA")
            result = report.get("result")
            if report.get("failure") is not None or not isinstance(result, dict) or result.get("status") != "completed":
                issues.append(f"{stage}: director failure or incomplete result")
            boundary = json.loads((run_dir / manifest["inputs"]["boundary"]["copy"]).read_text(encoding="utf-8"))
            # Import appends one execution invalidation commit after replaying the saved history.
            boundary_revision = len(boundary.get("commits", [])) + 1 if isinstance(boundary, dict) else None
            if (type(report.get("initialArchiveRevision")) is not int
                    or type(report.get("runStartRevision")) is not int
                    or report["initialArchiveRevision"] != boundary_revision
                    or report["runStartRevision"] != report["initialArchiveRevision"] + 1):
                issues.append(f"{stage}: invalid boundary or settings revision")
            def valid_usage(value: object) -> bool:
                return isinstance(value, dict) and isinstance(value.get("usage"), dict) and all(
                    type(value["usage"].get(key)) in (int, float) and math.isfinite(value["usage"][key])
                    and value["usage"][key] >= 0 for key in ("uncachedInputTokens", "outputTokens", "cacheReadTokens"))
            if not all(valid_usage(report.get(key)) for key in ("usageBefore", "usageAfter", "usageDelta")):
                issues.append(f"{stage}: missing native director usage")
            else:
                for key in ("uncachedInputTokens", "outputTokens", "cacheReadTokens"):
                    if report["usageAfter"]["usage"][key] - report["usageBefore"]["usage"][key] != report["usageDelta"]["usage"][key]:
                        issues.append(f"{stage}: inconsistent native usage delta for {key}")
                if report["usageDelta"]["usage"]["outputTokens"] <= 0:
                    issues.append(f"{stage}: no Director output usage")
            if not isinstance(report.get("sessions"), list) or not any(
                any(isinstance(event, dict) and event.get("type") == "roleplay/execution-request"
                    for event in session.get("events", [])) for session in report["sessions"] if isinstance(session, dict)):
                issues.append(f"{stage}: missing Director request")
            if not (report_path.parent / "after-director.json").is_file():
                issues.append(f"{stage}: missing after-director.json")
            continue
        report_path = Path(manifest["stageRoot"]) / stage / "review.json"
        if not report_path.is_file():
            issues.append(f"{stage}: missing review.json")
            continue
        try:
            report = json.loads(report_path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            issues.append(f"{stage}: unreadable review.json: {error}")
            continue
        guidance_label = (config["guidanceInputByVariant"][replay["variant"]]
                          if config["mode"] == "comparative" and "pairedRunId" not in config
                          else "baseline-guidance")
        guidance_sha = manifest["inputs"].get(guidance_label, {}).get("sha256") if guidance_label else None
        for key, expected in {"stage": stage, "model": config["model"], "provider": config["provider"],
                              "reasoningEffort": config["reasoningEffort"],
                              "fixtureSha256": manifest["inputs"]["fixture"]["sha256"],
                              "baselineGuidanceSha256": guidance_sha,
                              "directorInstruction": config["directorInstruction"],
                              "actorFacingBeat": config["actorFacingBeat"],
                              **config["resolvedE2eFlags"]}.items():
            if report.get(key) != expected:
                issues.append(f"{stage}: {key} differs from registration")
        cases = report.get("cases", [])
        if not isinstance(cases, list):
            issues.append(f"{stage}: cases is not an array")
            continue
        flags = config["resolvedE2eFlags"]
        phases = [] if flags["voiceSceneDirector"] else ["opening"]
        if flags["continuation"]:
            phases.append("after-feedback")
        if flags["laterPressure"]:
            phases.append("new-pressure")
        actors = ("mashiro", "ren", "baldu", "elia", "nono")
        expected_cases = {(phase, actor) for phase in phases for actor in actors}
        actual_cases = {(case.get("phase"), case.get("actorId")) for case in cases if isinstance(case, dict)}
        if actual_cases != expected_cases or len(cases) != len(expected_cases):
            issues.append(f"{stage}: actor/phase coverage differs from effective flags")
        director = report.get("director")
        def has_request(sessions: object) -> bool:
            return isinstance(sessions, list) and any(
                any(isinstance(event, dict) and event.get("type") == "roleplay/execution-request"
                    for event in session.get("events", []))
                for session in sessions if isinstance(session, dict))
        def has_native_usage(value: object) -> bool:
            if not isinstance(value, dict) or not isinstance(value.get("usage"), dict):
                return False
            tokens = value["usage"]
            return all(type(tokens.get(key)) in (int, float) and math.isfinite(tokens[key]) and tokens[key] >= 0
                       for key in ("uncachedInputTokens", "outputTokens"))
        for case in cases:
            if not isinstance(case, dict):
                issues.append(f"{stage}: malformed actor case")
                continue
            if case.get("failure") is not None:
                issues.append(f"{stage}: actor failure")
            if not has_native_usage(case.get("usage")):
                issues.append(f"{stage}: missing or invalid native actor usage")
            if not has_request(case.get("sessions")):
                issues.append(f"{stage}: missing actor request in {case.get('phase')}:{case.get('actorId')}")
        if flags["directorProbe"] or flags["voiceSceneDirector"]:
            if not isinstance(director, dict) or not has_request(director.get("sessions")):
                issues.append(f"{stage}: missing director request")
        elif director is not None:
            issues.append(f"{stage}: unexpected director result")
        if isinstance(director, dict) and director.get("failure") is not None:
            issues.append(f"{stage}: director failure")
        if isinstance(director, dict) and not has_native_usage(director.get("usage")):
            issues.append(f"{stage}: missing native director usage")
        if not (report_path.parent / "story-archive.json").is_file():
            issues.append(f"{stage}: missing story archive")
    if issues:
        raise ValueError("Postflight incomplete/invalid:\n" + "\n".join(issues))
    print(f"Postflight complete for {len(config['replays'])} replay stages; literary quality remains for blind review")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    init = sub.add_parser("init")
    init.add_argument("--repo", required=True)
    init.add_argument("--run-dir", required=True)
    init.add_argument("--run-id", required=True)
    init.add_argument("--config", required=True)
    init.add_argument("--build-path", required=True)
    init.add_argument("--source", action="append", default=[])
    init.add_argument("--input", action="append", default=[])
    check = sub.add_parser("validate")
    check.add_argument("--run-dir", required=True)
    after = sub.add_parser("postflight")
    after.add_argument("--run-dir", required=True)
    after.add_argument("--paired-run-dir")
    pair = sub.add_parser("compare")
    pair.add_argument("--left", required=True)
    pair.add_argument("--right", required=True)
    args = parser.parse_args()
    try:
        if args.command == "init":
            initialize(args)
        elif args.command == "validate":
            validate(args)
        elif args.command == "postflight":
            validate(args)
            postflight(args)
        else:
            compare_packs(Path(args.left), Path(args.right))
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"error: {error}\n")


if __name__ == "__main__":
    main()
