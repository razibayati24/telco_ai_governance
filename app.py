"""AI Governance Monitor - FastAPI Application."""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from server.routes import router
from server.db import close_connection

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown."""
    logger.info("AI Governance Monitor starting up...")
    yield
    logger.info("Shutting down - closing DB connection...")
    close_connection()


app = FastAPI(title="AI Governance Monitor", lifespan=lifespan)
app.include_router(router)

# Health check
@app.get("/api/health")
def health():
    return {"status": "healthy", "app": "ai-governance-monitor"}

# Serve React frontend
frontend_dist = Path(__file__).parent / "frontend" / "dist"
if frontend_dist.exists():
    # Serve static assets (JS, CSS, images)
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    # Serve other static files (favicon, etc.)
    @app.get("/favicon.ico")
    async def favicon():
        fav = frontend_dist / "favicon.ico"
        if fav.exists():
            return FileResponse(str(fav))
        return FileResponse(str(frontend_dist / "index.html"))

    # SPA fallback - serve index.html for all non-API routes
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Don't intercept API routes
        if full_path.startswith("api/"):
            return {"error": "Not found"}, 404
        # Try to serve static file first
        file_path = frontend_dist / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(frontend_dist / "index.html"))
else:
    logger.warning(f"Frontend dist not found at {frontend_dist}. Run 'npm run build' in frontend/")

    @app.get("/")
    def root():
        return {"message": "AI Governance Monitor API. Frontend not built yet."}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
