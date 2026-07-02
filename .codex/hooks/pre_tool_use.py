#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import codex_hook_adapter as adapter


DEFAULT_POLICY = {
    "approvalDir": ".codex/server-preflight/approvals",
    "auditDir": ".codex/server-preflight/audit",
    "riskPatterns": [
        r"(?<![\w.-])ssh(?:\.exe)?(?![\w.-])",
        r"(?<![\w.-])scp(?:\.exe)?(?![\w.-])",
        r"(?<![\w.-])sftp(?:\.exe)?(?![\w.-])",
        r"(?<![\w.-])rsync(?:\.exe)?(?![\w.-])",
        r"(?<![\w.-])docker(?:\.exe)?(?![\w.-])",
        r"(?<![\w.-])docker-compose(?:\.exe)?(?![\w.-])",
        r"(?<![\w.-])systemctl(?![\w.-])",
        r"(?<![\w.-])service(?![\w.-])",
        r"(?<![\w.-])nginx(?![\w.-])",
        r"(?<![\w.-])certbot(?![\w.-])",
        r"(?<![\w.-])ufw(?![\w.-])",
        r"(?<![\w.-])iptables(?![\w.-])",
        r"(?<![\w.-])firewall-cmd(?![\w.-])",
        r"(?<![\w.-])kubectl(?![\w.-])",
        r"(?<![\w.-])helm(?![\w.-])",
        r"(?<![\w.-])mysql(?![\w.-])",
        r"(?<![\w.-])psql(?![\w.-])",
        r"(?<![\w.-])mongosh(?![\w.-])",
        r"(?<![\w.-])redis-cli(?![\w.-])",
        r"(?<![\w.-])pm2(?![\w.-])",
        r"(?<![\w.-])supervisorctl(?![\w.-])",
    ],
    "allowLocalInfoPatterns": [
        r"^\s*ssh(?:\.exe)?\s+-(?:V|h|-version|-help)\s*$",
        r"^\s*docker(?:\.exe)?\s+(?:--version|version|help)\s*$",
        r"^\s*kubectl\s+(?:version\s+--client|help)\s*$",
    ],
    "absoluteDenyPatterns": [],
}


def _safe_relative_path(root: Path, value: Any, fallback: str) -> Path:
    text = str(value or fallback).replace("\\", "/").strip().lstrip("/")
    return root / text


def _load_policy(root: Path) -> dict[str, Any]:
    policy = dict(DEFAULT_POLICY)
    path = root / ".codex" / "server-tool-policy.json"
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return policy
    if not isinstance(loaded, dict):
        return policy
    for key in ("approvalDir", "auditDir", "riskPatterns", "allowLocalInfoPatterns", "absoluteDenyPatterns"):
        if key in loaded:
            policy[key] = loaded[key]
    return policy


def _pattern_list(policy: dict[str, Any], key: str) -> list[str]:
    values = policy.get(key)
    if not isinstance(values, list):
        return []
    return [value for value in values if isinstance(value, str) and value.strip()]


def _absolute_deny_match(policy: dict[str, Any], command: str) -> dict[str, str] | None:
    rules = policy.get("absoluteDenyPatterns")
    if not isinstance(rules, list):
        return None
    for rule in rules:
        if not isinstance(rule, dict):
            continue
        pattern = rule.get("pattern")
        if not isinstance(pattern, str) or not pattern.strip():
            continue
        try:
            matched = re.search(pattern, command)
        except re.error:
            continue
        if matched:
            return {
                "id": str(rule.get("id") or "absolute-deny"),
                "reason": str(rule.get("reason") or "命中绝对禁止规则。"),
            }
    return None


def _nested_get(value: dict[str, Any], path: list[str]) -> Any:
    current: Any = value
    for part in path:
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def _extract_command(payload: dict[str, Any]) -> str:
    candidates = [
        ["tool_input", "command"],
        ["toolInput", "command"],
        ["input", "command"],
        ["arguments", "command"],
        ["parameters", "command"],
        ["params", "command"],
        ["command"],
    ]
    for path in candidates:
        value = _nested_get(payload, path)
        if isinstance(value, str) and value.strip():
            return value

    for key in ("tool_input", "toolInput", "input", "arguments", "parameters", "params"):
        value = payload.get(key)
        if isinstance(value, dict):
            for nested_value in value.values():
                if isinstance(nested_value, str) and _looks_like_shell(nested_value):
                    return nested_value
    return ""


def _looks_like_shell(text: str) -> bool:
    lowered = text.lower()
    for pattern in DEFAULT_POLICY["riskPatterns"]:
        if re.search(pattern, lowered):
            return True
    return False


def _normalize_command(command: str) -> str:
    return command.replace("\r\n", "\n").strip()


def _command_hash(command: str) -> str:
    return hashlib.sha256(_normalize_command(command).encode("utf-8")).hexdigest()


def _redact(text: str, limit: int = 260) -> str:
    redacted = text
    redacted = re.sub(r"(?i)(authorization\s*:\s*bearer\s+)([A-Za-z0-9._~+/=-]{8,})", r"\1***", redacted)
    redacted = re.sub(r"(?i)(authorization\s*:\s*basic\s+)([A-Za-z0-9._~+/=-]{8,})", r"\1***", redacted)
    redacted = re.sub(r"(?i)(bearer\s+)([A-Za-z0-9._~+/=-]{12,})", r"\1***", redacted)
    redacted = re.sub(r"(?i)\b(https?://)([^/\s:@\"']+):([^@\s/\"']+)@", r"\1\2:***@", redacted)
    secret_names = (
        r"[A-Za-z0-9_]*(?:api[_-]?key|secret[_-]?key|private[_-]?key|"
        r"password|passwd|pwd|access[_-]?token|refresh[_-]?token|token|secret)"
    )
    redacted = re.sub(rf"(?i)\b({secret_names}\s*[:=]\s*)([^\s\"']+)", r"\1***", redacted)
    redacted = re.sub(r"(?i)\b(authorization\s*=\s*)([^\s\"']+)", r"\1***", redacted)
    redacted = re.sub(r"(?i)(--(?:api-key|token|access-token|refresh-token|password|secret)(?:=|\s+))([^\s\"']+)", r"\1***", redacted)
    redacted = re.sub(r"(?i)(sshpass\s+-p\s+)([^\s\"']+)", r"\1***", redacted)
    redacted = redacted.replace("\n", " ")
    if len(redacted) > limit:
        return redacted[:limit] + "..."
    return redacted


def _is_preflight_script(command: str) -> bool:
    normalized = _normalize_command(command).lower().replace("/", "\\")
    return "invoke-serverpreflight.ps1" in normalized


def _is_high_risk_command(command: str, policy: dict[str, Any]) -> bool:
    normalized = _normalize_command(command)
    if not normalized:
        return False
    if _is_preflight_script(normalized):
        return False
    for pattern in _pattern_list(policy, "allowLocalInfoPatterns"):
        if re.search(pattern, normalized, flags=re.IGNORECASE):
            return False
    lowered = normalized.lower()
    for pattern in _pattern_list(policy, "riskPatterns"):
        if re.search(pattern, lowered):
            return True
    return False


def _parse_time(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _approval_path(root: Path, policy: dict[str, Any], command_hash: str) -> Path:
    approval_dir = _safe_relative_path(root, policy.get("approvalDir"), DEFAULT_POLICY["approvalDir"])
    return approval_dir / f"{command_hash}.json"


def _load_approval(root: Path, policy: dict[str, Any], command: str) -> tuple[dict[str, Any] | None, str]:
    normalized = _normalize_command(command)
    command_hash = _command_hash(normalized)
    path = _approval_path(root, policy, command_hash)
    if not path.exists():
        return None, command_hash
    try:
        approval = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None, command_hash
    if not isinstance(approval, dict):
        return None, command_hash
    return approval, command_hash


def _approval_allows(approval: dict[str, Any] | None, command: str, command_hash: str) -> bool:
    if not approval:
        return False
    if approval.get("commandHash") != command_hash:
        return False
    if _normalize_command(str(approval.get("command", ""))) != _normalize_command(command):
        return False
    if approval.get("approved") is not True:
        return False
    if approval.get("approvedByUser") is not True:
        return False
    if approval.get("used") is True:
        return False
    expires_at = _parse_time(approval.get("expiresAt"))
    if expires_at is None:
        return False
    return datetime.now(timezone.utc) <= expires_at


def _mark_approval_used(root: Path, policy: dict[str, Any], command_hash: str, approval: dict[str, Any]) -> None:
    path = _approval_path(root, policy, command_hash)
    approval["used"] = True
    approval["usedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    try:
        path.write_text(json.dumps(approval, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except OSError:
        return


def _write_audit(root: Path, policy: dict[str, Any], entry: dict[str, Any]) -> None:
    audit_dir = _safe_relative_path(root, policy.get("auditDir"), DEFAULT_POLICY["auditDir"])
    try:
        audit_dir.mkdir(parents=True, exist_ok=True)
    except OSError:
        return
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    entry = {
        "version": 1,
        "timestamp": now,
        **entry,
    }
    command_hash = str(entry.get("commandHash") or "unknown")
    safe_hash = re.sub(r"[^a-fA-F0-9]", "", command_hash)[:64] or "unknown"
    stamp = now.replace(":", "").replace("-", "")
    path = audit_dir / f"{stamp}-{safe_hash[:12]}.json"
    try:
        path.write_text(json.dumps(entry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except OSError:
        return


def _head(path, limit: int) -> str:
    lines: list[str] = []
    try:
        with path.open("r", encoding="utf-8", errors="replace") as handle:
            for idx, line in enumerate(handle):
                if idx >= limit:
                    break
                lines.append(line.rstrip("\n"))
    except OSError:
        return ""
    return "\n".join(lines).rstrip()


def main() -> None:
    payload = adapter.load_payload()
    root = adapter.cwd_from_payload(payload)
    policy = _load_policy(root)
    command = _extract_command(payload)
    normalized_command = _normalize_command(command)
    deny_match = _absolute_deny_match(policy, normalized_command)
    if deny_match:
        command_hash = _command_hash(normalized_command)
        _write_audit(root, policy, {
            "decision": "block",
            "reason": "absolute_deny",
            "ruleId": deny_match["id"],
            "ruleReason": deny_match["reason"],
            "approvalRequired": False,
            "commandHash": command_hash,
            "commandPreview": _redact(normalized_command),
        })
        message = "\n".join([
            "服务器/基础设施高危命令已被拦截。",
            f"命中绝对禁止规则：{deny_match['id']}",
            f"原因：{deny_match['reason']}",
            f"命令哈希：{command_hash}",
            f"命令预览：{_redact(normalized_command)}",
            "此类命令即使存在预演审批也不能执行；必须改用低风险、可回滚的操作方案。",
        ])
        adapter.emit_json({"decision": "block", "reason": message})
        return

    if _is_high_risk_command(command, policy):
        approval, command_hash = _load_approval(root, policy, command)
        if _approval_allows(approval, command, command_hash):
            _mark_approval_used(root, policy, command_hash, approval or {})
            _write_audit(root, policy, {
                "decision": "allow",
                "reason": "exact_preflight_approval",
                "approvalRequired": True,
                "approvalUsed": True,
                "commandHash": command_hash,
                "commandPreview": _redact(command),
            })
            adapter.emit_json({
                "systemMessage": f"服务器高危命令已通过精确预演审批并标记为已使用：{command_hash[:12]}"
            })
            return

        _write_audit(root, policy, {
            "decision": "block",
            "reason": "missing_or_invalid_preflight_approval",
            "approvalRequired": True,
            "commandHash": command_hash,
            "commandPreview": _redact(command),
        })
        message = "\n".join([
            "服务器/基础设施高危命令已被拦截。",
            f"命令哈希：{command_hash}",
            f"命令预览：{_redact(command)}",
            "必须先做精确预演并得到用户明确批准，再执行同一条命令。",
            "使用入口：powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\Invoke-ServerPreflight.ps1 -Command \"<exact command>\" -Target \"<target>\" -ExpectedEffect \"<effect>\" -BlastRadius \"<blast radius>\" -FailureModes \"<failure modes>\" -Rollback \"<rollback>\" -HealthChecks \"<checks>\" -ApprovedByUser",
        ])
        adapter.emit_json({"decision": "block", "reason": message})
        return

    plan_path = root / "task_plan.md"
    if plan_path.exists():
        message = _head(plan_path, 30)
        if message:
            adapter.emit_json({"systemMessage": message})


if __name__ == "__main__":
    raise SystemExit(adapter.main_guard(main, fail_closed=True))
