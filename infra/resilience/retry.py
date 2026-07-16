import functools
import time
import asyncio
from infra.logging.structured_logger import get_structured_logger

logger = get_structured_logger("infra.resilience.retry")

def retry(max_retries=3, delay=1.0, backoff=2.0, exceptions=(Exception,)):
    """
    同步重试装饰器。
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            current_delay = delay
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    if attempt == max_retries:
                        logger.error(f"Function {func.__name__} failed after {max_retries} retries.", extra={"error": str(e)})
                        raise
                    logger.warning(f"Function {func.__name__} failed (attempt {attempt+1}/{max_retries}). Retrying in {current_delay}s...", extra={"error": str(e)})
                    time.sleep(current_delay)
                    current_delay *= backoff
        return wrapper
    return decorator

def async_retry(max_retries=3, delay=1.0, backoff=2.0, exceptions=(Exception,)):
    """异步版本"""
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            current_delay = delay
            for attempt in range(max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except exceptions as e:
                    if attempt == max_retries:
                        logger.error(f"Async function {func.__name__} failed after {max_retries} retries.", extra={"error": str(e)})
                        raise
                    logger.warning(f"Async function {func.__name__} failed (attempt {attempt+1}/{max_retries}). Retrying in {current_delay}s...", extra={"error": str(e)})
                    await asyncio.sleep(current_delay)
                    current_delay *= backoff
        return wrapper
    return decorator
