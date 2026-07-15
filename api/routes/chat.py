from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from agent.builder import build_agent

router = APIRouter()
class ChatRequst(BaseModel):
    role_name: str
    message:str
    model_id:Optional[str] = None

@router.post("/chat")
async def chat_with_agent(request:ChatRequst):
    try:
        # 第一步：根据前端传的角色和模型，动态组装专属 Agent
        agent = build_agent(
            role_name=request.role_name,
            override_model_name=request.model_id
        )

        # 第二步：构建消息格式并调用agent
        inputs = {"messages":[("user",request.message)]}

        result = agent.invoke(inputs)
        final_message = result["messages"][-1].content

        return {
            "status":"success",
            "reply":final_message
        }
    except ValueError as e:
        # 把你写的那些优秀的报错信息拦截下来，发给前端
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"内部错误: {str(e)}")




