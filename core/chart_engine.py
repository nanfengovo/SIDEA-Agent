import os
import uuid
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
from infra.logging.structured_logger import get_structured_logger

logger = get_structured_logger("core.chart_engine")

class ChartEngine:
    """图表生成引擎，生成图片并返回访问路径。支持暗色科技风格。"""
    
    def __init__(self, output_dir: str = "./output/reports"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # 设置全局暗色科技风主题
        plt.style.use('dark_background')
        sns.set_theme(style="darkgrid", rc={
            "axes.facecolor": "#1e1e2d",
            "figure.facecolor": "#151521",
            "axes.edgecolor": "#3b3b54",
            "grid.color": "#2a2a3c",
            "text.color": "#e0e0e0",
            "axes.labelcolor": "#e0e0e0",
            "xtick.color": "#e0e0e0",
            "ytick.color": "#e0e0e0",
            "font.family": "sans-serif"
        })

    def _generate_filename(self) -> Path:
        filename = f"chart_{uuid.uuid4().hex[:8]}.png"
        return self.output_dir / filename

    def generate_line_chart(self, df: pd.DataFrame, x_col: str, y_col: str, title: str) -> str:
        try:
            plt.figure(figsize=(10, 6))
            sns.lineplot(data=df, x=x_col, y=y_col, marker="o", color="#00f2fe", linewidth=2)
            plt.title(title, fontsize=14, fontweight='bold', color="#00f2fe", pad=15)
            plt.xticks(rotation=45)
            plt.tight_layout()
            
            filepath = self._generate_filename()
            plt.savefig(filepath, dpi=120)
            plt.close()
            return str(filepath)
        except Exception as e:
            logger.error("Failed to generate line chart", extra={"error": str(e)})
            raise

    def generate_bar_chart(self, df: pd.DataFrame, x_col: str, y_col: str, title: str) -> str:
        try:
            plt.figure(figsize=(10, 6))
            sns.barplot(data=df, x=x_col, y=y_col, palette="cool")
            plt.title(title, fontsize=14, fontweight='bold', color="#4facfe", pad=15)
            plt.xticks(rotation=45)
            plt.tight_layout()
            
            filepath = self._generate_filename()
            plt.savefig(filepath, dpi=120)
            plt.close()
            return str(filepath)
        except Exception as e:
            logger.error("Failed to generate bar chart", extra={"error": str(e)})
            raise
