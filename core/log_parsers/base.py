import re
import os
import glob
from abc import ABC, abstractmethod
from typing import Optional, Generator
from datetime import datetime
import pandas as pd

class BaseLogParser(ABC):
    """所有日志解析器的基类。处理 Serilog 格式的多行日志合并。"""
    
    # 时间戳行正则——每条日志的起始标记
    TIMESTAMP_RE = re.compile(
        r'^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\s+'   # 时间戳
        r'([+-]\d{2}:\d{2})\s+'                                  # 时区
        r'\[(\w{3})\]\s+'                                         # 级别
        r'(\S+)\s+'                                                # SourceContext
        r'(.*)'                                                    # 消息
    )
    
    def __init__(self, log_dir: str, regex_pattern: str = None):
        self.log_dir = log_dir
        self.regex_pattern = re.compile(regex_pattern) if regex_pattern else None
    
    def discover_files(self, date_str: str = None) -> list[str]:
        pattern = os.path.join(self.log_dir, f"{date_str}*.txt" if date_str else "*.txt")
        files = glob.glob(pattern)
        return sorted(files)
    
    def iter_entries(self, filepath: str) -> Generator[dict, None, None]:
        current_entry = None
        
        try:
            with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                for line in f:
                    match = self.TIMESTAMP_RE.match(line)
                    if match:
                        if current_entry:
                            yield current_entry
                        
                        current_entry = {
                            'timestamp': match.group(1),
                            'timezone': match.group(2),
                            'level': match.group(3),
                            'source': match.group(4),
                            'message': match.group(5),
                            'continuation': '',
                            'raw': line
                        }
                    else:
                        if current_entry:
                            current_entry['continuation'] += line
                            current_entry['raw'] += line
            
            if current_entry:
                yield current_entry
                
        except Exception as e:
            print(f"Error reading {filepath}: {e}")
    
    def parse_file(self, filepath: str,
                   time_start: datetime = None,
                   time_end: datetime = None,
                   level_filter: list[str] = None) -> pd.DataFrame:
        results = []
        for entry in self.iter_entries(filepath):
            try:
                entry_time = datetime.strptime(entry['timestamp'], '%Y-%m-%d %H:%M:%S.%f')
                if time_start and entry_time < time_start:
                    continue
                if time_end and entry_time > time_end:
                    continue
            except ValueError:
                pass # ignore parsing error
            
            if level_filter and entry['level'] not in level_filter:
                continue
            
            parsed = self.parse_entry(entry)
            if parsed is not None:
                results.append(parsed)
        
        return pd.DataFrame(results) if results else pd.DataFrame()
    
    def parse_directory(self, date_str: str = None, **kwargs) -> pd.DataFrame:
        files = self.discover_files(date_str)
        dfs = [self.parse_file(f, **kwargs) for f in files]
        dfs = [df for df in dfs if not df.empty]
        return pd.concat(dfs, ignore_index=True) if dfs else pd.DataFrame()
    
    @abstractmethod
    def parse_entry(self, entry: dict) -> Optional[dict]:
        ...
    
    def aggregate(self, df: pd.DataFrame) -> pd.DataFrame:
        return df
    
    def to_markdown(self, df: pd.DataFrame) -> str:
        if df.empty:
            return "无异常数据"
        return df.to_markdown(index=False)
