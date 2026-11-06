from pathlib import Path

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

from app.config import settings
from app.models import (
    AIAnalysis,
    AIRequest,
    AnalyzeRequest,
    AnalyzeResponse,
    HealthResponse,
)
from app.services.github_service import extract_repo_coordinates, fetch_github_repository
from app.services.groq_service import generate_groq_analysis

BASE_DIR = Path(__file__).resolve().parent.parent

app = FastAPI(
    title="RepoSnap API",
    description="Backend service that analyzes GitHub repositories and generates AI-powered explanations using Groq.",
    version="1.0.0",
)

# Enable CORS for frontend integrations
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _static_file(filename: str) -> FileResponse:
    """Serve a frontend asset with no-cache so UI edits show up on refresh."""
    return FileResponse(BASE_DIR / filename, headers={"Cache-Control": "no-cache"})


@app.get("/", include_in_schema=False)
async def frontend():
    """Serve the RepoSnap single-page frontend."""
    return _static_file("index.html")


@app.get("/styles.css", include_in_schema=False)
async def styles():
    return _static_file("styles.css")


@app.get("/app.js", include_in_schema=False)
async def scripts():
    return _static_file("app.js")


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Health check endpoint to verify backend service status."""
    return HealthResponse(status="ok", service="RepoSnap")


@app.post("/api/analyze", response_model=AnalyzeResponse, tags=["Analysis"])
async def analyze_repository(request: AnalyzeRequest):
    """
    Analyze a public GitHub repository URL.

    1. Validates the GitHub URL and safely extracts owner and repo.
    2. Calls the GitHub REST API for metadata, languages, and recent commits.
    3. Prompts Groq AI to explain the repository concisely and accurately.
    4. Returns a single structured JSON response.

    If the AI step fails, repository data is still returned with an `ai_error`
    instead of failing the whole request.
    """
    # 1. Validate URL and extract coordinates
    try:
        owner, repo = extract_repo_coordinates(request.url)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    # 2. Fetch repository details, languages & recent commits from GitHub API
    repository_details, activity = await fetch_github_repository(owner, repo)

    # 3. Generate AI analysis using Groq API (non-fatal)
    ai_analysis = None
    ai_error = None
    try:
        ai_analysis = await generate_groq_analysis(repository_details, activity)
    except HTTPException as exc:
        ai_error = str(exc.detail)
    except Exception:
        ai_error = "AI analysis is temporarily unavailable. Repository data is shown below."

    # 4. Return combined structured JSON response
    return AnalyzeResponse(
        repository=repository_details,
        activity=activity,
        ai_analysis=ai_analysis,
        ai_error=ai_error,
        ai_model=settings.GROQ_MODEL,
    )


@app.post("/api/ai", response_model=AIAnalysis, tags=["Analysis"])
async def regenerate_ai_overview(request: AIRequest):
    """
    Regenerate the AI overview for repository data already fetched by the client.
    Avoids extra GitHub API calls when the user clicks Regenerate.
    """
    return await generate_groq_analysis(request.repository, request.activity)


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Catch-all exception handler to prevent leaking sensitive credentials in error traces."""
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An unexpected internal server error occurred. Please try again later."},
    )
