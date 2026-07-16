import re
import pandas as pd
from typing import Optional
from core.log_parsers.base import BaseLogParser

class RCSLogParser(BaseLogParser):
    """RCS 日志解析器——关注 API 请求响应性能"""
    
    REQUEST_LINE_RE = re.compile(r'Request:\s+(GET|POST|PUT|DELETE|PATCH)\s+(\S+)')
    RESPONSE_LINE_RE = re.compile(r'Response:\s+(\d{3})\s+in\s+(\d+)ms')
    BODY_SIZE_RE = re.compile(r'Actual Body Size:\s+(\d+)\s+bytes')
    
    def parse_entry(self, entry: dict) -> Optional[dict]:
        if 'RequestResponseLoggingMiddleware' not in entry['source']:
            return None
        
        full_text = entry['message'] + '\n' + entry.get('continuation', '')
        
        req_match = self.REQUEST_LINE_RE.search(full_text)
        resp_match = self.RESPONSE_LINE_RE.search(full_text)
        
        if not req_match or not resp_match:
            return None
        
        body_match = self.BODY_SIZE_RE.search(full_text)
        
        return {
            'timestamp': entry['timestamp'],
            'method': req_match.group(1),
            'path': req_match.group(2),
            'status_code': int(resp_match.group(1)),
            'response_time_ms': int(resp_match.group(2)),
            'body_size_bytes': int(body_match.group(1)) if body_match else 0,
        }
    
    def aggregate(self, df: pd.DataFrame) -> pd.DataFrame:
        if df.empty:
            return df
        grouped = df.groupby('path').agg(
            request_count=('timestamp', 'size'),
            avg_ms=('response_time_ms', 'mean'),
            p95_ms=('response_time_ms', lambda x: x.quantile(0.95)),
            max_ms=('response_time_ms', 'max'),
            error_count=('status_code', lambda x: (x >= 400).sum()),
        ).reset_index()
        grouped['error_rate'] = (grouped['error_count'] / grouped['request_count'] * 100).round(2)
        grouped['avg_ms'] = grouped['avg_ms'].round(1)
        grouped['p95_ms'] = grouped['p95_ms'].round(1)
        return grouped.sort_values('request_count', ascending=False)
