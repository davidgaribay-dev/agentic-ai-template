from fastapi import APIRouter

from backend.api.routes import (
    agent,
    api_keys,
    audit,
    auth,
    conversations,
    invitations,
    items,
    memory,
    organizations,
    prompts,
    settings,
    teams,
    users,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(items.router)
api_router.include_router(conversations.router)
api_router.include_router(agent.router)
api_router.include_router(organizations.router)
api_router.include_router(teams.router)
api_router.include_router(invitations.router)
api_router.include_router(api_keys.router)
api_router.include_router(prompts.org_router)
api_router.include_router(prompts.team_router)
api_router.include_router(prompts.user_router)
api_router.include_router(audit.router, tags=["audit"])
api_router.include_router(settings.router)
api_router.include_router(memory.router)
