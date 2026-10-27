from typing import List, Optional
from pydantic import BaseModel, Field, field_validator


class AnalyzeRequest(BaseModel):
    """Incoming request model containing the GitHub repository URL."""
    url: str = Field(
        ...,
        description="Public GitHub repository URL (e.g. https://github.com/owner/repo)",
        examples=["https://github.com/psf/requests"]
    )

    @field_validator("url")
    @classmethod
    def validate_url_not_empty(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("The 'url' field cannot be empty.")
        return value


class CommitInfo(BaseModel):
    """Details for a recent repository commit."""
    sha: str = Field(default="", description="Short commit SHA (e.g. 7 characters)")
    message: str = Field(default="", description="First line of the commit message")
    author: Optional[str] = Field(default=None, description="Author name or username, or None if unavailable")
    date: Optional[str] = Field(default=None, description="Commit ISO 8601 date timestamp, or None if unavailable")


class RepositoryActivity(BaseModel):
    """Recent repository activity metrics."""
    recent_commits: List[CommitInfo] = Field(
        default_factory=list,
        description="List of recent commits (defaults to empty list if none available)"
    )


class RepositoryDetails(BaseModel):
    """Standardized metadata from the GitHub REST API."""
    name: str = Field(default="", description="Repository name")
    full_name: str = Field(default="", description="Full repository path (owner/repo)")
    owner: str = Field(default="", description="Repository owner username or organization")
    description: Optional[str] = Field(default=None, description="Repository description, or None if empty")
    url: str = Field(default="", description="GitHub repository HTML URL")
    stars: int = Field(default=0, ge=0, description="Stargazers count")
    forks: int = Field(default=0, ge=0, description="Forks count")
    open_issues: int = Field(default=0, ge=0, description="Open issues count")
    language: Optional[str] = Field(default=None, description="Primary programming language, or None if not specified")
    topics: List[str] = Field(default_factory=list, description="Repository topics or tags")
    license: Optional[str] = Field(default=None, description="License name or SPDX ID, or None if unspecified")
    created_at: Optional[str] = Field(default=None, description="Creation timestamp in ISO 8601 format, or None")
    updated_at: Optional[str] = Field(default=None, description="Last update timestamp in ISO 8601 format, or None")
    default_branch: Optional[str] = Field(default="main", description="Default branch name (e.g. main or master)")


class AIAnalysis(BaseModel):
    """Structured AI explanation generated via Groq API."""
    project_summary: str = Field(default="", description="High-level project overview (1-2 sentences)")
    what_it_does: str = Field(default="", description="Beginner-friendly explanation of functionality and purpose")
    main_purpose: str = Field(default="", description="The core objective or problem this repository solves")
    technologies: List[str] = Field(
        default_factory=list,
        description="Actual programming languages, frameworks, runtime tools, or libraries only (excludes licenses)"
    )
    target_users: List[str] = Field(
        default_factory=list,
        description="Target audience or user personas for the project"
    )
    key_features: List[str] = Field(
        default_factory=list,
        description="Standout features derived strictly from repository data"
    )
    repository_health_or_activity_observations: List[str] = Field(
        default_factory=list,
        description="Observations regarding stars, forks, issues, maintenance, and recent commits"
    )
    short_verdict: str = Field(default="", description="Concise concluding summary verdict")


class AnalyzeResponse(BaseModel):
    """Combined response payload containing GitHub metadata and AI explanation."""
    repository: RepositoryDetails = Field(..., description="Repository metadata from GitHub API")
    activity: RepositoryActivity = Field(default_factory=RepositoryActivity, description="Repository activity information")
    ai_analysis: AIAnalysis = Field(..., description="AI-generated explanation and insights from Groq")


class HealthResponse(BaseModel):
    """Health check response model."""
    status: str = Field(default="ok", description="Service health status")
    service: str = Field(default="RepoSnap", description="Service name")
