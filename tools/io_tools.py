from langchain_core.tools import StructuredTool, tool
from pydantic import BaseModel, Field
import pandas as pd
from io import StringIO
from pathlib import Path
import asyncio

class ExportArgs(BaseModel):
    csv_data: str = Field(description="包含数据的 CSV 格式字符串")
    filename: str = Field(description="生成的文件名（不含路径）")

class FileArgs(BaseModel):
    filepath: str = Field(description="文件相对路径")
    content: str = Field(description="写入的内容", default="")

class ReadDocumentArgs(BaseModel):
    filepath: str = Field(description="文件相对路径，比如 uploads/xxx.pdf")
    start_page: int = Field(description="起始页码（从 1 开始）", default=1)
    end_page: int = Field(description="结束页码（包含在内）", default=5)

def _export_excel_sync(csv_data: str, filename: str) -> str:
    try:
        if not filename.endswith('.xlsx'):
            filename += '.xlsx'
        path = Path("./output/reports") / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        df = pd.read_csv(StringIO(csv_data))
        df.to_excel(path, index=False)
        return f"Excel 文件生成成功: {path}"
    except Exception as e:
        return f"Excel 生成失败: {e}"

def _write_file_sync(filepath: str, content: str) -> str:
    try:
        path = Path(filepath)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        return f"文件写入成功: {path}"
    except Exception as e:
        return f"文件写入失败: {e}"

def _read_file_sync(filepath: str, content: str = "") -> str:
    try:
        path = Path(filepath)
        if not path.exists():
            return "文件不存在"
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        return f"文件读取失败: {e}"

def _read_document_sync(filepath: str, start_page: int = 1, end_page: int = 5) -> str:
    try:
        path = Path(filepath)
        if not path.exists():
            return f"文件不存在: {filepath}"
            
        if str(path).lower().endswith(".pdf"):
            import PyPDF2
            with open(path, "rb") as f:
                reader = PyPDF2.PdfReader(f)
                total_pages = len(reader.pages)
                start = max(1, start_page) - 1
                end = min(total_pages, end_page)
                
                text = f"[正在读取 PDF: {filepath}, 总页数: {total_pages}, 当前读取范围: 第 {start+1} 页到第 {end} 页]\n\n"
                
                if start >= total_pages:
                    return text + "（已超出总页数，无内容）"
                    
                for i in range(start, end):
                    page_text = reader.pages[i].extract_text()
                    if page_text:
                        text += f"--- 第 {i+1} 页 ---\n{page_text}\n"
                return text
        else:
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                return f"[读取文本文件: {filepath}]\n" + content
    except Exception as e:
        return f"读取文档失败: {e}"

export_excel = StructuredTool.from_function(
    func=_export_excel_sync,
    coroutine=lambda csv_data, filename: asyncio.to_thread(_export_excel_sync, csv_data, filename),
    name="export_excel",
    description="将给定的 CSV 数据导出为 Excel (.xlsx) 文件",
    args_schema=ExportArgs,
)

write_file = StructuredTool.from_function(
    func=_write_file_sync,
    coroutine=lambda filepath, content: asyncio.to_thread(_write_file_sync, filepath, content),
    name="write_file",
    description="将文本内容写入指定文件",
    args_schema=FileArgs,
)

read_file = StructuredTool.from_function(
    func=_read_file_sync,
    coroutine=lambda filepath, content="": asyncio.to_thread(_read_file_sync, filepath),
    name="read_file",
    description="读取指定文件的内容",
    args_schema=FileArgs,
)

read_document = StructuredTool.from_function(
    func=_read_document_sync,
    coroutine=lambda filepath, start_page=1, end_page=5: asyncio.to_thread(_read_document_sync, filepath, start_page, end_page),
    name="read_document",
    description="分段读取大文件（如PDF），你可以通过 start_page 和 end_page 参数指定要读取的页码范围。建议每次读取 5 页，然后总结，如果还有剩余内容则继续调用此工具读取接下来的 5 页。",
    args_schema=ReadDocumentArgs,
)

def _gen_markdown_sync(filepath: str, content: str) -> str:
    if not filepath.endswith('.md'):
        filepath += '.md'
    return _write_file_sync(filepath, content)

generate_markdown = StructuredTool.from_function(
    func=_gen_markdown_sync,
    coroutine=lambda filepath, content: asyncio.to_thread(_gen_markdown_sync, filepath, content),
    name="generate_markdown",
    description="生成 Markdown 报告文件",
    args_schema=FileArgs,
)
