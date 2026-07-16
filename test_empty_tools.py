import asyncio
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langchain_core.messages import SystemMessage
from langchain_ollama import ChatOllama
from langgraph.checkpoint.memory import MemorySaver

class State(TypedDict):
    messages: Annotated[list, add_messages]

async def test():
    llm = ChatOllama(model='gemma4:e2b-it-qat', base_url='http://localhost:11434', temperature=0.0)
    
    def call_model(state: State):
        sys_msg = SystemMessage(content="You are a helpful assistant.")
        response = llm.invoke([sys_msg] + state["messages"])
        return {"messages": response}
        
    workflow = StateGraph(State)
    workflow.add_node("agent", call_model)
    workflow.add_edge(START, "agent")
    workflow.add_edge("agent", END)
    
    app = workflow.compile(checkpointer=MemorySaver())
    
    async for event in app.astream_events({"messages": [("user", "hello")]}, config={"configurable": {"thread_id": "1"}}, version="v2"):
        if event["event"] == "on_chat_model_stream":
            print(repr(event["data"]["chunk"].content), end="", flush=True)
            
    print("\n\nSecond call:")
    async for event in app.astream_events({"messages": [("user", "what did i say earlier?")]}, config={"configurable": {"thread_id": "1"}}, version="v2"):
        if event["event"] == "on_chat_model_stream":
            print(repr(event["data"]["chunk"].content), end="", flush=True)
            
asyncio.run(test())
