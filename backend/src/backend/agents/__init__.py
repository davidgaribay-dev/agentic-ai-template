from backend.agents.base import (
    get_agent,
    get_conversation_history,
    run_agent,
    stream_agent,
)
from backend.agents.context import (
    LLMContext,
    RequestContext,
    get_llm_context,
    get_llm_context_dict,
    get_request_context,
    llm_context,
    request_context,
)
from backend.agents.factory import (
    AgentConfig,
    AgentFactory,
    AgentInstance,
    get_agent_factory,
    init_agent_factory,
    reset_agent_factory,
)
from backend.agents.react_agent import (
    get_react_agent,
    run_react_agent,
    stream_react_agent,
)
from backend.agents.tools import get_available_tools
from backend.agents.tracing import (
    build_langfuse_config,
    check_langfuse_connection,
    flush_langfuse,
    get_langfuse_handler,
    init_langfuse,
    shutdown_langfuse,
)

__all__ = [
    # Base agent
    "get_agent",
    "run_agent",
    "stream_agent",
    "get_conversation_history",
    # Agent factory (preferred for new code)
    "AgentConfig",
    "AgentFactory",
    "AgentInstance",
    "get_agent_factory",
    "init_agent_factory",
    "reset_agent_factory",
    # Context management
    "LLMContext",
    "RequestContext",
    "llm_context",
    "request_context",
    "get_llm_context",
    "get_llm_context_dict",
    "get_request_context",
    # ReAct agent with tools
    "get_react_agent",
    "run_react_agent",
    "stream_react_agent",
    # Tools
    "get_available_tools",
    # Tracing (Langfuse v3)
    "init_langfuse",
    "get_langfuse_handler",
    "build_langfuse_config",
    "flush_langfuse",
    "shutdown_langfuse",
    "check_langfuse_connection",
]
