"""AI 概念图 / 封面图生成工具。

通道优先级（均可在管理后台开关）：
1. 云端写实生图：OpenAI Images API 兼容中转（默认 AICodeWith gpt-image-2）
2. 外网备用：Pollinations 免 Key 服务
3. 离线兜底：程序化矢量封面（永远可用，适合无网工厂）

相关配置（sys_config 表）：
- IMAGE_CLOUD_ENABLED   是否启用云端写实生图，true/false（默认 false）
- IMAGE_BACKUP_ENABLED  是否启用 Pollinations 备用，true/false（默认 false）
- IMAGE_API_BASE_URL    默认 https://api.aicodewith.com
- IMAGE_API_KEY         中转服务的 API Key
- IMAGE_MODEL_NAME      默认 gpt-image-2
"""
from __future__ import annotations

import asyncio
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

SANDBOX_DIR = Path(__file__).parent.parent / "sandbox_workspace"

_QUALITY_SUFFIX = ", ultra detailed, cinematic lighting, high quality, professional concept art"

_SIZE_MAP = {
    "landscape": "1536x1024",
    "portrait": "1024x1536",
    "square": "1024x1024",
}

_POLL_INTERVAL_S = 3
_TASK_TIMEOUT_S = 300


class ImageGenArgs(BaseModel):
    prompt_en: str = Field(
        description=(
            "英文场景描述（必须英文，效果最好）。"
            "把用户的中文需求翻译成具体的画面描述：主体 + 场景 + 光影 + 氛围。例如 "
            "'a massive robotic arm assembling glowing precision components, "
            "blue holographic projections, dark futuristic factory'。"
        )
    )
    style: str = Field(
        default="dark industrial sci-fi",
        description="画面风格关键词，如 'dark industrial sci-fi' / 'clean minimalist' 等。",
    )
    aspect: str = Field(
        default="landscape",
        description="画幅：landscape（横版，PPT 封面用这个）/ portrait（竖版）/ square（方形）。",
    )
    title_zh: str = Field(
        default="",
        description="图片主标题（中文）。生成封面/海报时必填，离线降级渲染也依赖它。",
    )
    title_en: str = Field(default="", description="图片副标题（英文），可选。")
    subtitle: str = Field(default="", description="小字副标题，如 '2026 Q2 季度汇报'，可选。")


def _flag_on(value: Optional[str], default: bool = False) -> bool:
    if value is None or value == "":
        return default
    return str(value).strip().lower() in ("1", "true", "yes", "on", "enabled")


def _get_image_config() -> tuple[str, str, str, bool, bool]:
    """返回 (base_url, api_key, model, cloud_enabled, backup_enabled)。"""
    try:
        from infra.config_store import ConfigStore

        store = ConfigStore()
        base = (store.get("IMAGE_API_BASE_URL") or "https://api.aicodewith.com").rstrip("/")
        key = store.get("IMAGE_API_KEY") or ""
        model = store.get("IMAGE_MODEL_NAME") or "gpt-image-2"
        # 默认关闭云端：无网工厂优先离线矢量；页面开关可随时打开
        cloud = _flag_on(store.get("IMAGE_CLOUD_ENABLED"), default=False)
        backup = _flag_on(store.get("IMAGE_BACKUP_ENABLED"), default=False)
        return base, key, model, cloud, backup
    except Exception:
        return "https://api.aicodewith.com", "", "gpt-image-2", False, False


def _http_json(url: str, api_key: str, payload: dict | None = None, timeout: int = 60) -> dict:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "SIDEA-Agent/3.0",
    }
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method="POST" if data else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _download(url: str, out_path: Path, timeout: int = 120) -> bool:
    req = urllib.request.Request(url, headers={"User-Agent": "SIDEA-Agent/3.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = resp.read()
    if not data or len(data) < 1024:
        return False
    out_path.write_bytes(data)
    return True


def _extract_result_url(task: dict) -> str:
    for item in task.get("result_data") or []:
        if isinstance(item, dict) and item.get("url"):
            return item["url"]
    results = task.get("results") or []
    if results and isinstance(results[0], str):
        return results[0]
    return ""


def _generate_via_relay(full_prompt: str, size: str, out_path: Path) -> str:
    """主通道：OpenAI Images API 兼容中转。返回空串表示成功，否则返回错误信息。"""
    base, key, model, cloud_enabled, _ = _get_image_config()
    if not cloud_enabled:
        return "云端写实生图已关闭（可在管理后台 → 全局设置中开启）"
    if not key:
        return "未配置 IMAGE_API_KEY"

    try:
        resp = _http_json(
            f"{base}/v1/images/generations",
            key,
            {"model": model, "prompt": full_prompt, "size": size, "n": 1},
            timeout=90,
        )
    except Exception as e:
        return f"提交生图任务失败: {e}"

    for item in resp.get("data") or []:
        if isinstance(item, dict):
            if item.get("b64_json"):
                import base64

                out_path.write_bytes(base64.b64decode(item["b64_json"]))
                return ""
            if item.get("url"):
                return "" if _download(item["url"], out_path) else "结果图片下载失败"

    task_id = resp.get("id")
    if not task_id:
        return f"服务未返回任务 ID: {str(resp)[:200]}"

    deadline = time.time() + _TASK_TIMEOUT_S
    while time.time() < deadline:
        time.sleep(_POLL_INTERVAL_S)
        try:
            task = _http_json(f"{base}/v1/tasks/{task_id}", key, timeout=30)
        except Exception:
            continue
        status = task.get("status", "")
        if status in ("failed", "cancelled", "error"):
            return f"生图任务失败: {str(task)[:200]}"
        url = _extract_result_url(task)
        if task.get("progress") == 100 and url:
            return "" if _download(url, out_path) else "结果图片下载失败"
    return f"生图任务超时（{_TASK_TIMEOUT_S}s）"


def _generate_via_pollinations(full_prompt: str, size: str, out_path: Path) -> str:
    """备用通道：Pollinations 免 Key。返回空串表示成功，否则返回错误信息。"""
    w, h = size.split("x")
    encoded = urllib.parse.quote(full_prompt, safe="")
    url = (
        f"https://image.pollinations.ai/prompt/{encoded}"
        f"?width={w}&height={h}&nologo=true&seed={int(time.time()) % 100000}"
    )
    try:
        return "" if _download(url, out_path) else "服务返回空数据"
    except Exception as e:
        return f"{e}"


def _generate_via_procedural(title_zh: str, title_en: str, subtitle: str, size: str) -> str:
    """离线降级通道：程序化矢量绘制封面。返回相对路径，失败返回空串。"""
    try:
        from tools.procedural_cover import generate_cover

        w, h = size.split("x")
        return generate_cover(
            title_zh or "智能制造",
            title_en=title_en,
            subtitle=subtitle,
            width=int(w),
            height=int(h),
        )
    except Exception:
        return ""


def _generate_image_sync(
    prompt_en: str,
    style: str = "dark industrial sci-fi",
    aspect: str = "landscape",
    title_zh: str = "",
    title_en: str = "",
    subtitle: str = "",
) -> str:
    SANDBOX_DIR.mkdir(parents=True, exist_ok=True)
    size = _SIZE_MAP.get(aspect, _SIZE_MAP["landscape"])
    full_prompt = f"{prompt_en}, {style}{_QUALITY_SUFFIX}"

    filename = f"ai_image_{int(time.time() * 1000)}.png"
    out_path = SANDBOX_DIR / filename
    rel = f"sandbox_workspace/{filename}"
    note = ""

    _, _, _, cloud_enabled, backup_enabled = _get_image_config()

    err_main = _generate_via_relay(full_prompt, size, out_path) if cloud_enabled else "云端写实生图已关闭"
    if err_main:
        err_backup = (
            _generate_via_pollinations(full_prompt, size, out_path)
            if backup_enabled
            else "外网备用通道已关闭"
        )
        if err_backup:
            rel_offline = _generate_via_procedural(title_zh, title_en, subtitle, size)
            if not rel_offline:
                return (
                    f"图片生成失败。主通道: {err_main}；备用通道: {err_backup}。"
                    "请稍后重试，或将下面的提示词交给外部绘图工具使用：\n"
                    f"{full_prompt}"
                )
            rel = rel_offline
            if not cloud_enabled and not backup_enabled:
                note = "（注：云端生图已关闭，本图由离线矢量引擎程序化绘制）"
            else:
                note = "（注：当前无可用生图服务，本图由离线矢量引擎程序化绘制）"

    from core.public_url import public_url

    return (
        f"图片已生成: {rel} {note}\n"
        f"请在最终回复中用 Markdown 展示它：![概念图]({public_url(rel)})"
    )


generate_image = StructuredTool.from_function(
    func=_generate_image_sync,
    coroutine=lambda **kw: asyncio.to_thread(_generate_image_sync, **kw),
    name="generate_image",
    description=(
        "AI 文生图：根据英文场景描述生成高质量概念图/封面图/效果图/海报（如科幻工厂、"
        "机械臂、全息投影等）。当用户要求生成'图片/封面/概念图/效果图/海报'时必须调用本工具，"
        "禁止回答'我无法生成图片'。生成后把返回的 Markdown 图片链接原样放入最终回复。"
    ),
    args_schema=ImageGenArgs,
)
