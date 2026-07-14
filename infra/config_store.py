from .database import get_connection


_LLM_MODEL_CONFIG_CACHE = {}
def get_llm_model_config(key):
    """
    根据模型名获取模型相关信息
    :param key: 模型id
    :return: 模型名
    """
    if key in _LLM_MODEL_CONFIG_CACHE:
        return _LLM_MODEL_CONFIG_CACHE[key]
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
        """
        SELECT * FROM llm_models WHERE model_name =?
        """,
            (key,)
        )
        row = cursor.fetchone()

        if row is None:
            return None
        _LLM_MODEL_CONFIG_CACHE[key] = dict(row)
        return _LLM_MODEL_CONFIG_CACHE[key]

