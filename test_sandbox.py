import os
from tools.io_tools import _read_file_sync, _write_file_sync
from tools.sandbox_tools import _run_python_in_sandbox_sync

def test_io_security():
    print("--- 1. Testing IO Security (Path Traversal) ---")
    
    # Try reading a file outside allowed paths
    res_read = _read_file_sync("../../config.db")
    print(f"Read outside path result:\n{res_read}\n")
    assert "❌ 权限拒绝" in res_read
    
    # Try writing a file outside allowed paths
    res_write = _write_file_sync("/tmp/hacked.txt", "hacked")
    print(f"Write outside path result:\n{res_write}\n")
    assert "❌ 权限拒绝" in res_write
    
    print("✅ IO Security tests passed!\n")

def test_sandbox():
    print("--- 2. Testing Sandbox Execution ---")
    
    code = """
import sys
print(f"Python executing from {sys.executable}")
print("Generating a test file...")
with open("test_output.csv", "w") as f:
    f.write("A,B\\n1,2")
print("Done.")
"""
    res_sandbox = _run_python_in_sandbox_sync(code)
    print(f"Sandbox result:\n{res_sandbox}\n")
    assert "sandbox_workspace/test_output.csv" in res_sandbox
    assert "✅ 沙箱执行完毕" in res_sandbox
    
    print("✅ Sandbox tests passed!\n")

if __name__ == "__main__":
    test_io_security()
    test_sandbox()
