from langchain_core.tools import StructuredTool, tool
from pydantic import BaseModel, Field
import subprocess
import os
from pathlib import Path
import time
import shutil

class SandboxRunArgs(BaseModel):
    python_code: str = Field(description="需要在安全沙箱中运行的 Python 源码。画图时必须使用中文图例、标题和标签！系统已自动配置好中文字体。")
    files_to_copy: list[str] = Field(description="（可选）需要从 uploads/ 等安全目录复制到沙箱环境中的文件相对路径列表。", default=[])

def _run_python_in_sandbox_sync(python_code: str, files_to_copy: list[str] = []) -> str:
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
            
        script_path = sandbox_dir / "main.py"
        with open(script_path, "w", encoding="utf-8") as f:
            if "matplotlib" in python_code or "pyplot" in python_code:
                f.write("import matplotlib.pyplot as plt\n")
                f.write("import matplotlib as mpl\n")
                f.write("try:\n")
                f.write("    plt.rcParams['font.sans-serif'] = ['Arial Unicode MS', 'SimHei', 'PingFang SC', 'Heiti TC', 'Microsoft YaHei']\n")
                f.write("    plt.rcParams['axes.unicode_minus'] = False\n")
                f.write("except:\n")
                f.write("    pass\n")
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
        
        result_msg = f"✅ 沙箱执行完毕。返回状态码: {process.returncode}\n\n[终端输出]:\n{output}"
        
        # 收集新生成的文件
        generated_artifacts = []
        for new_f in new_files:
            if new_f == "main.py":
                continue
            ext = new_f.lower().split('.')[-1]
            if ext in ['png', 'jpg', 'jpeg', 'pdf', 'csv', 'xlsx']:
                rel_path = f"sandbox_workspace/{new_f}"
                generated_artifacts.append(rel_path)
                
        if generated_artifacts:
            result_msg += "\n\n[沙箱产生的新文件]:\n"
            for art in generated_artifacts:
                result_msg += f"- {art}\n"
            result_msg += "（提示: 你必须在最终的回复中直接使用 Markdown 语法渲染这些图片给用户看，格式为 `![生成的图表](http://localhost:8000/sandbox_workspace/图片名.png)`！）"
            
        return result_msg
        
    except subprocess.TimeoutExpired:
        return "❌ 沙箱执行超时: 代码运行超过了30秒，已被强行中断！"
    except Exception as e:
        return f"❌ 沙箱执行遇到严重错误: {e}"

run_python_in_sandbox = StructuredTool.from_function(
    func=_run_python_in_sandbox_sync,
    name="run_python_in_sandbox",
    description="在一个隔离的安全沙箱中执行 Python 代码，用于动态数据分析、生成可视化图表等。执行环境在 `sandbox_workspace` 目录下。代码最长允许运行 30 秒。执行后生成的文件（如 .png）会被自动捕获并告知你。",
    args_schema=SandboxRunArgs,
)
