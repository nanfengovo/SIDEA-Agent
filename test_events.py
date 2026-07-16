import asyncio
from langchain_core.messages import HumanMessage
from agent.graph import create_agent_for_skill

async def test_stream():
    agent = await create_agent_for_skill("plc_diagnostics")
    config = {"configurable": {"thread_id": "test_123"}}
    inputs = {"messages": [HumanMessage(content="检查一下今天PLC出现的所有异常")]}
    async for event in agent.astream_events(inputs, config=config, version="v1"):
        kind = event["event"]
        name = event.get("name", "")
        if kind not in ["on_chat_model_stream", "on_chain_stream", "on_chat_model_start", "on_chat_model_end", "on_prompt_start", "on_prompt_end", "on_chain_start", "on_chain_end"]:
            print(f"EVENT: {kind}, NAME: {name}")

if __name__ == "__main__":
    asyncio.run(test_stream())
