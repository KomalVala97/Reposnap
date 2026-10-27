from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.models import AnalyzeRequest, AnalyzeResponse, HealthResponse
from app.services.github_service import extract_repo_coordinates, fetch_github_repository
from app.services.groq_service import generate_groq_analysis

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


@app.get("/", tags=["General"])
async def root():
    """Root endpoint welcoming users and directing to interactive documentation."""
    return {
        "service": "RepoSnap API",
        "version": "1.0.0",
        "documentation": "/docs",
        "health_check": "/health",
    }


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Health check endpoint to verify backend service status."""
    return HealthResponse(status="ok", service="RepoSnap")


@app.post("/api/analyze", response_model=AnalyzeResponse, tags=["Analysis"])
async def analyze_repository(request: AnalyzeRequest):
    """
    Analyze a public GitHub repository URL.
    
    1. Validates the GitHub URL and safely extracts owner and repo.
    2. Calls the GitHub REST API for metadata and recent commits.
    3. Prompts Groq AI to explain the repository concisely and accurately.
    4. Returns a single structured JSON response.
    """
    # 1. Validate URL and extract coordinates
    try:
        owner, repo = extract_repo_coordinates(request.url)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    # 2. Fetch repository details & recent commits from GitHub API
    repository_details, activity = await fetch_github_repository(owner, repo)

    # 3. Generate AI analysis using Groq API
    ai_analysis = await generate_groq_analysis(repository_details, activity)

    # 4. Return combined structured JSON response
    return AnalyzeResponse(
        repository=repository_details,
        activity=activity,
        ai_analysis=ai_analysis,
    )


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Catch-all exception handler to prevent leaking sensitive credentials in error traces."""
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An unexpected internal server error occurred. Please try again later."},
    )
