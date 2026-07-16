import pandas as pd
import json
from langchain_core.tools import tool

@tool
def clean_data(json_data_str: str) -> str:
    """
    Cleans industrial data provided as a JSON string.
    Removes duplicates, handles missing values by filling them with 0 or empty strings.
    Returns the cleaned data as a JSON string.
    """
    try:
        data = json.loads(json_data_str)
        df = pd.DataFrame(data)
        
        # Data cleaning operations
        df = df.drop_duplicates()
        df = df.fillna(0)
        
        return df.to_json(orient='records')
    except Exception as e:
        return f"Error cleaning data: {str(e)}"
