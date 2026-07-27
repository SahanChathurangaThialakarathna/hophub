from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routes import auth

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="AI-powered rabbit ownership ecosystem — backend API",
    version="0.1.0",
)

# Development CORS. Restrict to known origins before deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix=settings.API_V1_PREFIX)


@app.get("/health", tags=["System"])
def health_check() -> dict[str, str]:
    """Liveness probe."""
    return {"status": "ok", "service": settings.PROJECT_NAME}