"""交互运行指标：token 抽取、落库、ETA 估算。"""
from __future__ import annotations

import json
import math
import time
import uuid
from typing import Any, Dict, List, Optional

from infra.database import get_connection

SIDEA_DB = "database/SIDEA.db"


def ensure_metrics_schema() -> None:
    with get_connection(SIDEA_DB) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS interaction_metrics (
                id              TEXT PRIMARY KEY,
                session_id      TEXT,
                message_id      TEXT,
                skill_id        TEXT,
                model           TEXT,
                tools_json      TEXT DEFAULT '[]',
                tool_count      INTEGER DEFAULT 0,
                duration_ms     INTEGER DEFAULT 0,
                input_tokens    INTEGER DEFAULT 0,
                output_tokens   INTEGER DEFAULT 0,
                total_tokens    INTEGER DEFAULT 0,
                complexity      REAL DEFAULT 1.0,
                user_chars      INTEGER DEFAULT 0,
                created_at      TEXT DEFAULT (datetime('now','localtime'))
            )
            """
        )
        # 兼容旧表：为 chat_messages 补 run_meta 列
        cols = {r[1] for r in conn.execute("PRAGMA table_info(chat_messages)").fetchall()}
        if "run_meta" not in cols:
            conn.execute("ALTER TABLE chat_messages ADD COLUMN run_meta TEXT")
        if "trace_events" not in cols:
            conn.execute("ALTER TABLE chat_messages ADD COLUMN trace_events TEXT")
        if "attachments" not in cols:
            conn.execute("ALTER TABLE chat_messages ADD COLUMN attachments TEXT")
        conn.commit()


def extract_usage_from_llm_output(output: Any) -> Dict[str, int]:
    """从 LangChain on_chat_model_end 的 output 提取 token 用量。"""
    usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}

    def _apply(meta: Any) -> None:
        if not meta:
            return
        if isinstance(meta, dict):
            if meta.get("input_tokens") or meta.get("output_tokens") or meta.get("total_tokens"):
                usage["input_tokens"] += int(meta.get("input_tokens") or 0)
                usage["output_tokens"] += int(meta.get("output_tokens") or 0)
                usage["total_tokens"] += int(
                    meta.get("total_tokens")
                    or (int(meta.get("input_tokens") or 0) + int(meta.get("output_tokens") or 0))
                )
                return
            # Ollama / 部分 OpenAI 兼容字段
            prompt_n = meta.get("prompt_eval_count") or meta.get("prompt_tokens")
            out_n = meta.get("eval_count") or meta.get("completion_tokens")
            if prompt_n is not None or out_n is not None:
                usage["input_tokens"] += int(prompt_n or 0)
                usage["output_tokens"] += int(out_n or 0)
                usage["total_tokens"] += int(prompt_n or 0) + int(out_n or 0)
                return
            token_usage = meta.get("token_usage") or meta.get("usage")
            if isinstance(token_usage, dict):
                _apply(token_usage)

    candidates: List[Any] = [output]
    if hasattr(output, "generations"):
        try:
            for gen_list in output.generations or []:
                for gen in gen_list:
                    msg = getattr(gen, "message", None) or getattr(gen, "text", None)
                    if msg is not None:
                        candidates.append(msg)
        except Exception:
            pass

    for obj in candidates:
        if obj is None:
            continue
        um = getattr(obj, "usage_metadata", None)
        if um:
            if hasattr(um, "model_dump"):
                _apply(um.model_dump())
            elif isinstance(um, dict):
                _apply(um)
            else:
                _apply(
                    {
                        "input_tokens": getattr(um, "input_tokens", 0),
                        "output_tokens": getattr(um, "output_tokens", 0),
                        "total_tokens": getattr(um, "total_tokens", 0),
                    }
                )
        rm = getattr(obj, "response_metadata", None)
        if rm:
            _apply(rm if isinstance(rm, dict) else dict(rm))

    if usage["total_tokens"] == 0 and (usage["input_tokens"] or usage["output_tokens"]):
        usage["total_tokens"] = usage["input_tokens"] + usage["output_tokens"]
    return usage


def estimate_complexity(user_chars: int, tool_count: int, has_attachment: bool = False) -> float:
    """粗粒度复杂度：用于 ETA 相似任务匹配。"""
    c = 1.0 + math.log10(max(user_chars, 10)) / 2.0
    c += min(tool_count, 8) * 0.35
    if has_attachment:
        c += 0.8
    return round(c, 3)


def save_interaction_metric(
    *,
    session_id: str,
    message_id: str,
    skill_id: str,
    model: str,
    tools: List[str],
    duration_ms: int,
    input_tokens: int,
    output_tokens: int,
    total_tokens: int,
    complexity: float,
    user_chars: int,
) -> None:
    ensure_metrics_schema()
    with get_connection(SIDEA_DB) as conn:
        conn.execute(
            """
            INSERT INTO interaction_metrics (
                id, session_id, message_id, skill_id, model, tools_json, tool_count,
                duration_ms, input_tokens, output_tokens, total_tokens, complexity, user_chars
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                uuid.uuid4().hex,
                session_id,
                message_id,
                skill_id,
                model,
                json.dumps(tools, ensure_ascii=False),
                len(tools),
                int(duration_ms),
                int(input_tokens),
                int(output_tokens),
                int(total_tokens),
                float(complexity),
                int(user_chars),
            ),
        )
        conn.commit()


def update_message_run_meta(message_id: str, run_meta: dict) -> None:
    ensure_metrics_schema()
    with get_connection(SIDEA_DB) as conn:
        conn.execute(
            "UPDATE chat_messages SET run_meta = ? WHERE message_id = ?",
            (json.dumps(run_meta, ensure_ascii=False), message_id),
        )
        conn.commit()


def estimate_eta_ms(
    *,
    skill_id: Optional[str] = None,
    user_chars: int = 0,
    has_attachment: bool = False,
) -> Dict[str, Any]:
    """基于历史交互耗时，按复杂度加权估计本次任务耗时。"""
    ensure_metrics_schema()
    complexity = estimate_complexity(user_chars, tool_count=2, has_attachment=has_attachment)

    with get_connection(SIDEA_DB) as conn:
        rows = conn.execute(
            """
            SELECT duration_ms, complexity, tool_count, skill_id, created_at
            FROM interaction_metrics
            WHERE duration_ms > 500
            ORDER BY created_at DESC
            LIMIT 80
            """
        ).fetchall()

    if not rows:
        # 冷启动默认：按字符粗估 8–45 秒
        base = 8000 + min(user_chars, 2000) * 8
        if has_attachment:
            base += 12000
        return {
            "eta_ms": int(base),
            "eta_sec": round(base / 1000, 1),
            "sample_size": 0,
            "method": "heuristic_cold_start",
            "complexity": complexity,
            "confidence": "low",
        }

    # 同 skill 加权更高
    weighted = []
    for r in rows:
        dur = int(r["duration_ms"] or 0)
        hist_c = float(r["complexity"] or 1.0) or 1.0
        # 按复杂度比例缩放到当前任务
        scaled = dur * (complexity / hist_c)
        w = 1.0
        if skill_id and r["skill_id"] == skill_id:
            w *= 2.2
        # 最近样本权重略高（列表已按时间倒序）
        weighted.append((scaled, w))

    total_w = sum(w for _, w in weighted) or 1.0
    eta = sum(v * w for v, w in weighted) / total_w
    # 夹紧到合理区间
    eta = max(3000, min(eta, 15 * 60 * 1000))
    conf = "high" if len(rows) >= 12 else ("medium" if len(rows) >= 4 else "low")

    return {
        "eta_ms": int(eta),
        "eta_sec": round(eta / 1000, 1),
        "sample_size": len(rows),
        "method": "historical_complexity_weighted",
        "complexity": complexity,
        "confidence": conf,
    }


def build_run_summary(
    *,
    tools: List[str],
    duration_ms: int,
    model: str,
    skill_id: str,
    skill_name: str = "",
    input_tokens: int = 0,
    output_tokens: int = 0,
    total_tokens: int = 0,
    complexity: float = 1.0,
) -> Dict[str, Any]:
    return {
        "tools": tools,
        "tool_count": len(tools),
        "duration_ms": int(duration_ms),
        "duration_sec": round(duration_ms / 1000, 2),
        "model": model,
        "skill_id": skill_id,
        "skill_name": skill_name or skill_id,
        "tokens": {
            "input": int(input_tokens),
            "output": int(output_tokens),
            "total": int(total_tokens or (input_tokens + output_tokens)),
        },
        "complexity": complexity,
        "finished_at": int(time.time() * 1000),
    }
