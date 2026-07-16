from langchain.agents import create_agent
from langchain_ollama import ChatOllama
llm = ChatOllama(model="gemma4:e2b-it-qat")
agent = create_agent(model=llm, tools=[])
print("Success:", agent)
