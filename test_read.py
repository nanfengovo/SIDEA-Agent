import sys
from pathlib import Path

def test_read_document_sync(filepath: str, start_page: int = 1, end_page: int = 5) -> str:
    path = Path(filepath)
    if str(path).lower().endswith(".pdf"):
        pass
    else:
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
            lines_per_page = 100
            total_pages = (len(lines) + lines_per_page - 1) // lines_per_page
            
            start = max(1, start_page) - 1
            end = min(total_pages, end_page)
            
            text = f"[正在读取文本文件: {filepath}, 总页数(按100行/页计): {total_pages}, 当前读取: 第 {start+1} 页到第 {end} 页]\n\n"
            
            if start >= total_pages:
                return text + "（已超出总页数，无内容）"
                
            start_line = start * lines_per_page
            end_line = end * lines_per_page
            chunk = "".join(lines[start_line:end_line])
            
            return text + chunk
print(test_read_document_sync("uploads/bc0edf5a2bae45239d2bd0212a82c468.txt", 1, 2))
