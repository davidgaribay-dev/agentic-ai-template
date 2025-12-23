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
    # Agent factory (preferred for new code)
    "AgentConfig",
    "AgentFactory",
    "AgentInstance",
    # Context management
    "LLMContext",
    "RequestContext",
    "build_langfuse_config",
    "check_langfuse_connection",
    "flush_langfuse",
    # Base agent
    "get_agent",
    "get_agent_factory",
    # Tools
    "get_available_tools",
    "get_conversation_history",
    "get_langfuse_handler",
    "get_llm_context",
    "get_llm_context_dict",
    # ReAct agent with tools
    "get_react_agent",
    "get_request_context",
    "init_agent_factory",
    # Tracing (Langfuse v3)
    "init_langfuse",
    "llm_context",
    "request_context",
    "reset_agent_factory",
    "run_agent",
    "run_react_agent",
    "shutdown_langfuse",
    "stream_agent",
    "stream_react_agent",
]
