import re
import pandas as pd
from typing import Optional
from core.log_parsers.base import BaseLogParser

class PLCLogParser(BaseLogParser):
    """PLC 日志解析器——关注 ERR/WRN 级别，提取异常类型和业务代码定位"""
    
    PLC_SOURCES = ['PLCManager', 'PlcConnection', 'PLC连接']
    EXCEPTION_TYPE_RE = re.compile(r'^([\w.]+Exception)\s')
    BUSINESS_CODE_RE = re.compile(r'at Erack_RCS_API\.(.+?) in (.+?):line (\d+)')
    
    def parse_entry(self, entry: dict) -> Optional[dict]:
        if entry['level'] not in ('ERR', 'WRN'):
            return None
        
        if not any(kw in entry['source'] for kw in self.PLC_SOURCES):
            return None
        
        exception_type = "Unknown"
        root_cause = ""
        if entry['continuation']:
            first_line = entry['continuation'].split('\n')[0].strip()
            match = self.EXCEPTION_TYPE_RE.match(first_line)
            if match:
                exception_type = match.group(1)
            
            biz_match = self.BUSINESS_CODE_RE.search(entry['continuation'])
            if biz_match:
                root_cause = f"{biz_match.group(1)} (line {biz_match.group(3)})"
        
        return {
            'timestamp': entry['timestamp'],
            'level': entry['level'],
            'source': entry['source'],
            'message': entry['message'][:200],
            'exception_type': exception_type,
            'root_cause': root_cause,
        }
    
    def aggregate(self, df: pd.DataFrame) -> pd.DataFrame:
        if df.empty:
            return df
        return df.groupby('exception_type').agg(
            count=('timestamp', 'size'),
            first_occurred=('timestamp', 'min'),
            last_occurred=('timestamp', 'max'),
            sample_message=('message', 'first'),
        ).reset_index().sort_values('count', ascending=False)
