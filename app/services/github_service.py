import re
from urllib.parse import urlparse
from typing import Tuple
import httpx
from fastapi import HTTPException, status

from app.config import settings
from app.models import CommitInfo, RepositoryActivity, RepositoryDetails


def extract_repo_coordinates(raw_url: str) -> Tuple[str, str]:
    """
    Safely validate a GitHub URL and extract (owner, repo).
    
    Accepts formats such as:
    - https://github.com/owner/repo
    - http://github.com/owner/repo/
    - github.com/owner/repo.git
    - https://www.github.com/owner/repo
    """
    cleaned_url = raw_url.strip()
    if not cleaned_url.startswith(("http://", "https://")):
        cleaned_url = "https://" + cleaned_url

    parsed = urlparse(cleaned_url)
    hostname = (parsed.hostname or "").lower()

    if hostname not in ("github.com", "www.github.com"):
        raise ValueError(
            f"Invalid host '{hostname}'. Only public GitHub repository URLs (github.com) are supported."
        )

    # Path format should be /<owner>/<repo>[.git][/]
    path_segments = [seg for seg in parsed.path.strip("/").split("/") if seg]
    if len(path_segments) < 2:
        raise ValueError(
            "GitHub URL must specify both owner and repository name (e.g. 'https://github.com/owner/repo')."
        )

    owner = path_segments[0].strip()
    repo = path_segments[1].strip()

    # Strip .git suffix if present
    if repo.endswith(".git"):
        repo = repo[:-4]

    # Validate names conform to basic GitHub naming rules (alphanumeric, dashes, dots, underscores)
    valid_name_regex = r"^[A-Za-z0-9_.\-]+$"
    if not re.match(valid_name_regex, owner) or not re.match(valid_name_regex, repo):
        raise ValueError(f"Invalid owner or repository name detected in URL: '{owner}/{repo}'.")

    return owner, repo


def _build_github_headers() -> dict[str, str]:
    """Construct headers for GitHub REST API requests."""
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "RepoSnap-Backend",
    }
    if settings.GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"
    return headers


async def fetch_github_repository(owner: str, repo: str) -> Tuple[RepositoryDetails, RepositoryActivity]:
    """
    Fetch repository metadata and recent activity from GitHub REST API.
    Handles rate limits, not-found errors, authentication, and server issues.
    Safely normalizes all nullable GitHub fields.
    """
    headers = _build_github_headers()
    repo_url = f"https://api.github.com/repos/{owner}/{repo}"
    commits_url = f"https://api.github.com/repos/{owner}/{repo}/commits?per_page=5"

    async with httpx.AsyncClient(timeout=15.0) as client:
        # 1. Fetch Repository Information
        try:
            repo_res = await client.get(repo_url, headers=headers)
        except httpx.TimeoutException:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Connection to GitHub API timed out. Please try again."
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to communicate with GitHub API: {str(exc)}"
            )

        # Handle GitHub REST API status codes
        if repo_res.status_code == 404:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Repository '{owner}/{repo}' was not found on GitHub. Verify the URL and ensure the repo is public."
            )

        if repo_res.status_code == 401:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="GitHub authentication failed. Please verify the GITHUB_TOKEN configured on the server."
            )

        if repo_res.status_code in (403, 429):
            remaining = repo_res.headers.get("x-ratelimit-remaining")
            body_text = repo_res.text.lower()
            if remaining == "0" or "rate limit" in body_text:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="GitHub API rate limit exceeded. Please try again later or configure a valid GITHUB_TOKEN."
                )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access to GitHub repository '{owner}/{repo}' is forbidden."
            )

        if repo_res.status_code >= 500:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="GitHub service is currently experiencing issues. Please try again shortly."
            )

        if repo_res.status_code != 200:
            raise HTTPException(
                status_code=repo_res.status_code,
                detail=f"GitHub API error: {repo_res.text}"
            )

        data = repo_res.json()

        # Safely extract and clean nullable fields
        description = data.get("description")
        if description is not None:
            description = str(description).strip()
            if not description:
                description = None

        language = data.get("language")
        if language is not None:
            language = str(language).strip()
            if not language:
                language = None

        license_info = data.get("license")
        license_name = None
        if isinstance(license_info, dict):
            raw_lic = license_info.get("name") or license_info.get("spdx_id")
            if raw_lic:
                clean_lic = str(raw_lic).strip()
                if clean_lic and clean_lic.lower() not in ("none", "null", "no license"):
                    license_name = clean_lic

        raw_topics = data.get("topics")
        topics = [str(t).strip() for t in raw_topics if str(t).strip()] if isinstance(raw_topics, list) else []

        repository = RepositoryDetails(
            name=str(data.get("name") or repo),
            full_name=str(data.get("full_name") or f"{owner}/{repo}"),
            owner=str(data.get("owner", {}).get("login", owner) if isinstance(data.get("owner"), dict) else owner),
            description=description,
            url=str(data.get("html_url") or f"https://github.com/{owner}/{repo}"),
            stars=int(data.get("stargazers_count") or 0),
            forks=int(data.get("forks_count") or 0),
            open_issues=int(data.get("open_issues_count") or 0),
            language=language,
            topics=topics,
            license=license_name,
            created_at=data.get("created_at"),
            updated_at=data.get("updated_at"),
            default_branch=data.get("default_branch") or "main",
        )

        # 2. Fetch Recent Activity (commits)
        recent_commits: list[CommitInfo] = []
        try:
            commits_res = await client.get(commits_url, headers=headers)
            if commits_res.status_code == 200:
                raw_commits = commits_res.json()
                if isinstance(raw_commits, list):
                    for item in raw_commits[:5]:
                        sha = (item.get("sha") or "")[:7]
                        commit_data = item.get("commit") or {}
                        raw_msg = commit_data.get("message") or ""
                        # Take only first line of commit message for compactness
                        first_line_msg = raw_msg.splitlines()[0] if raw_msg else "No commit message"
                        
                        author_data = commit_data.get("author") or {}
                        author_name = author_data.get("name") or item.get("author", {}).get("login") or "Unknown"
                        commit_date = author_data.get("date")

                        recent_commits.append(
                            CommitInfo(
                                sha=sha,
                                message=first_line_msg,
                                author=author_name,
                                date=commit_date,
                            )
                        )
        except Exception:
            # Recent commits are non-critical enrichment; do not fail analysis if commits endpoint errors
            recent_commits = []

        activity = RepositoryActivity(recent_commits=recent_commits)
        return repository, activity
