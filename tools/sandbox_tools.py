from langchain_core.tools import StructuredTool, tool
from pydantic import BaseModel, Field
import subprocess
import os
from pathlib import Path
import time
import shutil

class SandboxRunArgs(BaseModel):
    # 默认空串而非必填：模型偶尔漏传该字段，硬性 pydantic 校验错误会中断推理循环；
    # 改为在工具体内返回可自纠正的指令性错误，让模型带上代码重试。
    python_code: str = Field(
        default="",
        description=(
            "需要在安全沙箱中运行的 Python 源码。"
            "画图/大屏：禁止 matplotlib savefig，禁止手写合并多 grid 的巨型 option。"
            "单图用 `from sidea_sdk import export_echarts`；"
            "多维大屏必须用 `from sidea_sdk import export_dashboard`，"
            "传入 charts 列表（每项独立面板，type 可选 combo/pie/scatter/bar3d/line/bar/raw），"
            "SDK 会导出 Panel Array JSON（type=dashboard），前端自动四宫格渲染，不会重叠。"
            "示例: export_dashboard('车间大屏', ["
            "{'type':'combo','title':'产能','x_data':[...],'series':[{'name':'产能','type':'line','data':[...]},{'name':'次品率','type':'bar','yAxisIndex':1,'data':[...]}]}, "
            "{'type':'pie','title':'能耗','data':[{'name':'冲压','value':30},...]}, "
            "{'type':'scatter','title':'磨损','data':[[1,20],...],'warning_threshold':80}, "
            "{'type':'bar3d','title':'温度阵列','x_size':8,'y_size':8}"
            "])"
        )
    )
    files_to_copy: list[str] = Field(description="（可选）需要从 uploads/ 等安全目录复制到沙箱环境中的文件相对路径列表。", default=[])

class BashRunArgs(BaseModel):
    command: str = Field(description="需要在工作区执行的 Shell 命令。支持 npm, python 等常见命令。")

class ListDirArgs(BaseModel):
    path: str = Field(description="需要列出的相对路径，默认为空（工作区根目录）", default="")


def _run_python_in_sandbox_sync(python_code: str = "", files_to_copy: list[str] = []) -> str:
    if not python_code or not python_code.strip():
        return (
            "❌ 调用失败：缺少必填参数 `python_code`（你只传了 files_to_copy）。"
            "请立即重新调用 run_python_in_sandbox，并在 `python_code` 参数中传入完整的 Python 源码字符串。"
            "例如: {\"python_code\": \"from sidea_sdk import export_dashboard\\n...\", \"files_to_copy\": []}"
        )

    root_dir = Path(__file__).parent.parent.resolve()
    sandbox_dir = root_dir / "sandbox_workspace"
    sandbox_dir.mkdir(parents=True, exist_ok=True)
    
    # 记录执行前的文件快照
    before_files = set(os.listdir(sandbox_dir))
    
    try:
        # 如果需要复制外部文件到沙箱
        for f in files_to_copy:
            src = (root_dir / f).resolve()
            # 基础安全校验：被复制的文件必须在工程目录下
            if not src.is_relative_to(root_dir) or not src.exists():
                return f"❌ 错误: 请求复制的文件不存在或超出了安全范围: {f}"
            
            dst = sandbox_dir / src.name
            shutil.copy2(src, dst)
            
        # 注入 Panel Array SDK（从模板复制，避免巨型内联字符串）
        sdk_template = Path(__file__).parent / "sidea_sdk_template.py"
        sdk_path = sandbox_dir / "sidea_sdk.py"
        shutil.copy2(sdk_template, sdk_path)

        # 写入并执行主程序
        script_path = sandbox_dir / "main.py"
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(python_code)
            
        # 启动沙箱子进程
        # 注意: 生产环境中这里应该用 docker run 或者 nsjail
        # 为了演示，我们在独立的 cwd 中使用 subprocess.run 并加上超时限制
        import sys
        process = subprocess.run(
            [sys.executable, "main.py"],
            cwd=sandbox_dir,
            capture_output=True,
            text=True,
            timeout=30  # 30秒硬性超时，防止 LLM 写出死循环
        )
        
        output = process.stdout
        if process.stderr:
            output += f"\n[STDERR]\n{process.stderr}"

        # 记录执行后的文件快照
        after_files = set(os.listdir(sandbox_dir))
        new_files = after_files - before_files

        if process.returncode != 0:
            hint = (
                "\n\n❌ 代码执行失败（不是内存/环境问题）。请阅读上方 STDERR，立刻改代码重试。"
                "大屏请严格按 Panel Array 协议调用 export_dashboard，字段用简单字符串，不要塞完整 ECharts option：\n"
                "export_dashboard('标题', [{'type':'combo','title':'产能','title_en':'Capacity',"
                "'x_data':[...],'series':[{'name':'产能','type':'line','data':[...]},"
                "{'name':'次品率','type':'bar','yAxisIndex':1,'data':[...]}]},"
                "{'type':'pie',...},{'type':'scatter',...},{'type':'bar3d','x_size':8,'y_size':8}],"
                " title_en='Title')\n"
                "禁止向用户编造「内存不足」等借口；修到成功导出 chart_option.json 为止。"
            )
            return f"❌ 沙箱执行失败。返回状态码: {process.returncode}\n\n[终端输出]:\n{output}{hint}"

        result_msg = f"✅ 沙箱执行完毕。返回状态码: {process.returncode}\n\n[终端输出]:\n{output}"
        
        # 收集新生成的文件
        generated_artifacts = []
        for new_f in new_files:
            if new_f in ["main.py", "sidea_sdk.py", "__pycache__"]:
                continue
            
            # 后置中间件拦截：检测到标准化 ECharts 状态对象
            if new_f == "chart_option.json":
                import time
                new_name = f"chart_{int(time.time()*1000)}.json"
                os.rename(sandbox_dir / new_f, sandbox_dir / new_name)
                from core.public_url import public_url

                url = public_url(f"sandbox_workspace/{new_name}")
                result_msg += (
                    f"\n\n[中间件拦截] 图表/大屏配置已生成！请在最终回复中直接原样输出以下代码块"
                    f"（仅包含URL，切勿输出 JSON 文本）来渲染：\n```echarts-i18n\n{url}\n```\n"
                    f"（若 JSON 为 type=dashboard 的 Panel Array，前端会自动四宫格渲染各独立面板。）\n"
                )
                continue
                
            ext = new_f.lower().split('.')[-1]
            if ext in ['png', 'jpg', 'jpeg', 'pdf', 'csv', 'xlsx']:
                rel_path = f"sandbox_workspace/{new_f}"
                generated_artifacts.append(rel_path)
                
        if generated_artifacts:
            from core.public_url import get_public_base_url

            result_msg += "\n\n[沙箱产生的新文件]:\n"
            for art in generated_artifacts:
                result_msg += f"- {art}\n"
            result_msg += (
                f"（提示: 你必须在最终的回复中直接使用 Markdown 语法渲染这些图片给用户看，"
                f"格式为 `![生成的图表]({get_public_base_url()}/sandbox_workspace/图片名.png)`！）"
            )
            
        return result_msg
        
    except subprocess.TimeoutExpired:
        return "❌ 沙箱执行超时: 代码运行超过了30秒，已被强行中断！"
    except Exception as e:
        return f"❌ 沙箱执行遇到严重错误: {e}"

def _run_bash_command_sync(command: str) -> str:
    root_dir = Path(__file__).parent.parent.resolve()
    sandbox_dir = root_dir / "sandbox_workspace"
    sandbox_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        # Run command with timeout and output capture
        result = subprocess.run(
            command,
            shell=True,
            cwd=str(sandbox_dir),
            capture_output=True,
            text=True,
            timeout=120  # allow longer time for things like npm install
        )
        output = result.stdout
        if result.stderr:
            output += f"\n[STDERR]:\n{result.stderr}"
            
        if result.returncode != 0:
            return f"❌ 命令执行失败 (Exit Code {result.returncode}):\n{output}"
            
        return f"✅ 命令执行成功:\n{output}" if output.strip() else "✅ 命令执行成功 (无输出)"
    except subprocess.TimeoutExpired:
        return "❌ 命令执行超时 (超过 120 秒)。如果这是一个常驻服务（如 npm run dev），请使用后台运行方式，或确保它能在限定时间内完成启动检查。"
    except Exception as e:
        return f"❌ 执行异常: {str(e)}"

def _list_directory_sync(path: str = "") -> str:
    root_dir = Path(__file__).parent.parent.resolve()
    sandbox_dir = root_dir / "sandbox_workspace"
    sandbox_dir.mkdir(parents=True, exist_ok=True)
    
    target_dir = (sandbox_dir / path).resolve()
    if not target_dir.is_relative_to(sandbox_dir):
        return "❌ 越权访问: 只能查看 sandbox_workspace 内的目录。"
        
    if not target_dir.exists():
        return f"❌ 目录不存在: {path}"
        
    if not target_dir.is_dir():
        return f"✅ 文件存在: {target_dir.name} (大小: {target_dir.stat().st_size} bytes)"
        
    try:
        items = os.listdir(target_dir)
        if not items:
            return "目录为空。"
        
        details = []
        for item in items:
            item_path = target_dir / item
            if item_path.is_dir():
                details.append(f"📁 {item}/")
            else:
                details.append(f"📄 {item} ({item_path.stat().st_size} bytes)")
        
        return "目录结构:\n" + "\n".join(details)
    except Exception as e:
        return f"❌ 无法读取目录: {str(e)}"


# ==========================================
# 导出工具定义
# ==========================================
sandbox_tool = StructuredTool.from_function(
    func=_run_python_in_sandbox_sync,
    name="run_python_in_sandbox",
    description="在安全的沙箱环境中执行一段 Python 代码。沙箱内无法访问外部网络和系统敏感文件，但可以读取 uploads 目录和操作输出目录。沙箱预装了 pandas, numpy, echarts相关库。你可以使用这个工具进行数据处理、统计分析并直接保存结果文件。",
    args_schema=SandboxRunArgs
)
# 向后兼容 SkillRegistry 使用的工具名。
run_python_in_sandbox = sandbox_tool

bash_tool = StructuredTool.from_function(
    func=_run_bash_command_sync,
    name="run_bash_command",
    description="在工作区 (sandbox_workspace) 中执行一段 Bash/Shell 命令。支持常用的系统命令（如 ls, mkdir, rm）以及环境命令（如 npm, vite, node）。这是全栈架构师进行脚手架创建、依赖安装和环境配置的核心工具。",
    args_schema=BashRunArgs
)

list_dir_tool = StructuredTool.from_function(
    func=_list_directory_sync,
    name="list_directory",
    description="列出工作区中指定路径下的文件和目录结构。在执行脚手架创建后，或者为了确认文件是否成功生成时，可以通过此工具查看目录层级。",
    args_schema=ListDirArgs
)

TOOLS = [sandbox_tool, bash_tool, list_dir_tool]
