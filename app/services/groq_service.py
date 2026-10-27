import json
import re
from typing import Any, Optional
import httpx
from fastapi import HTTPException, status

from app.config import settings
from app.models import AIAnalysis, RepositoryActivity, RepositoryDetails

GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions"

# System prompt defining strict persona, factual constraints, and JSON output schema
SYSTEM_PROMPT = """You are an expert software analyst and technical reviewer.
You are given factual metadata about a public GitHub repository.
Your task is to analyze the data and generate a clear, accurate, and beginner-accessible explanation.

CRITICAL RULES:
1. Base all factual statements strictly on the repository data provided. DO NOT fabricate or hallucinate features, dependencies, or statistics that are not supported by the data.
2. Factual metrics (such as stars, forks, open issues, primary language, creation date) must come directly from the GitHub metadata provided.
3. The "technologies" field must contain ONLY real software technologies, programming languages, runtime environments, frameworks, and libraries that are explicitly supported by the provided repository data.
   - Base technologies strictly on the primary language, topics, description, repository name, or commit messages provided in the data.
   - Under NO circumstances should you invent, guess, or extrapolate technologies (such as databases, cloud platforms, or unmentioned tools) that are not substantiated by the provided data.
   - If only the primary programming language is supported by the data, output only that language in the "technologies" array.
   - NEVER classify or include licenses (e.g. "MIT", "Apache", "GPL", "BSD", etc.) as a technology. The repository license belongs strictly in repository.license and must never appear in technologies.
   - Do NOT include generic non-technology phrases or concepts like "Open Source", "Software", "HTTP", "REST", "Client", or "GitHub" in the technologies list.
4. Clearly distinguish AI interpretation from raw GitHub metrics.
5. Output MUST be a strictly valid JSON object matching this schema exactly:
{
  "project_summary": "1-2 sentence high-level overview of what the project is.",
  "what_it_does": "Simple, beginner-readable explanation of how the project functions and what problem it solves.",
  "main_purpose": "The core objective or primary use case of the repository.",
  "technologies": ["list of actual programming languages, frameworks, and libraries evidenced by the repository data"],
  "target_users": ["list of intended audiences, developers, or users"],
  "key_features": ["list of standout features derived from repository data"],
  "repository_health_or_activity_observations": ["list of observations on stars, forks, issues, maintenance, and recent commit activity"],
  "short_verdict": "A concise concluding sentence or summary verdict about the repository."
}
"""

KNOWN_LICENSE_TERMS = {
    "mit", "apache", "apache-2.0", "apache 2.0", "apache2",
    "gpl", "gplv2", "gplv3", "gpl-2.0", "gpl-3.0", "gnu gpl",
    "lgpl", "lgplv2", "lgplv3", "lgpl-2.1", "lgpl-3.0",
    "agpl", "agplv3", "agpl-3.0",
    "bsd", "bsd-2-clause", "bsd-3-clause", "bsd 2-clause", "bsd 3-clause",
    "mpl", "mpl-2.0", "mpl 2.0", "mozilla public license",
    "epl", "epl-2.0", "eclipse public license",
    "isc", "isc license",
    "unlicense", "the unlicense",
    "cc0", "cc-by", "cc-by-sa", "creative commons",
    "gnu", "artistic license", "boost software license", "zlib license",
    "proprietary", "closed source", "commercial license", "copyleft"
}

GENERIC_NON_TECHS = {
    "open source", "opensource", "free software", "software", "code",
    "programming", "development", "developer tools", "tools", "tool",
    "library", "libraries", "framework", "frameworks", "application",
    "applications", "apps", "app", "project", "repository", "repo",
    "documentation", "docs", "general", "none", "n/a", "null", "unknown",
    "other", "etc", "client", "server", "api", "apis", "rest", "rest api",
    "restful", "http", "https", "web", "internet", "cookies", "humans",
    "forhumans", "for humans", "utility", "utilities", "sdk", "github",
    "gitlab", "bitbucket", "specification", "spec", "standard", "standards",
    "json", "json-schema", "xml", "yaml", "csv", "data"
}


def _normalize_token(text: str) -> str:
    """Strip all non-alphanumeric characters for clean fuzzy comparison."""
    return re.sub(r"[^a-z0-9]", "", text.lower())


def _is_license(item: str, license_name: Optional[str]) -> bool:
    """Check if item is a license name, acronym, or matches the repository license."""
    lower = item.strip().lower()
    norm = _normalize_token(lower)

    if not norm:
        return True

    # 1. Any mention of license/licence/copyright/copyleft/spdx
    if re.search(r"\b(license|licence|copyright|copyleft|spdx)\b", lower):
        return True

    # 2. Check against known license terms and identifiers
    if lower in KNOWN_LICENSE_TERMS or norm in KNOWN_LICENSE_TERMS:
        return True

    # 3. Check against the repository's own license
    if license_name:
        repo_lic_lower = license_name.strip().lower()
        repo_lic_norm = _normalize_token(repo_lic_lower)

        # Direct string or normalized equality / containment
        if lower == repo_lic_lower or norm == repo_lic_norm:
            return True

        # Normalized without "license" / "licence" words
        lic_clean = re.sub(r"\b(license|licence|the|version|v)\b", "", repo_lic_lower)
        item_clean = re.sub(r"\b(license|licence|the|version|v)\b", "", lower)
        clean_lic_norm = _normalize_token(lic_clean)
        clean_item_norm = _normalize_token(item_clean)

        if clean_item_norm and clean_lic_norm:
            if clean_item_norm == clean_lic_norm:
                return True
            if clean_item_norm in clean_lic_norm or clean_lic_norm in clean_item_norm:
                return True

    return False


def _is_supported_by_repo_data(tech: str, repo: RepositoryDetails, activity: RepositoryActivity) -> bool:
    """Verify that a technology is evidenced by the GitHub repository data provided to the model."""
    tech_clean = tech.strip()
    tech_lower = tech_clean.lower()
    tech_norm = _normalize_token(tech_clean)

    if not tech_norm:
        return False

    # Primary language is always supported
    if repo.language:
        lang_lower = repo.language.strip().lower()
        lang_norm = _normalize_token(lang_lower)
        if tech_lower == lang_lower or tech_norm == lang_norm:
            return True
        if tech_norm.startswith(lang_norm) or lang_norm.startswith(tech_norm):
            return True

    # Build corpus of provided repository data
    corpus_parts = [
        repo.name or "",
        repo.full_name or "",
        repo.description or "",
        " ".join(repo.topics or []),
    ]
    for c in activity.recent_commits:
        if c.message:
            corpus_parts.append(c.message)

    corpus = " ".join(corpus_parts).lower()
    corpus_norm = _normalize_token(corpus)

    # 1. Direct word boundary match in corpus
    escaped_tech = re.escape(tech_lower)
    if re.search(r"\b" + escaped_tech + r"\b", corpus):
        return True

    # 2. Check individual topics
    for topic in repo.topics:
        t_norm = _normalize_token(topic)
        if tech_norm == t_norm or tech_norm in t_norm or t_norm in tech_norm:
            return True

    # 3. Check normalized corpus containment for compound names (e.g. "swagger ui" in "swagger-ui")
    if len(tech_norm) >= 3 and tech_norm in corpus_norm:
        return True

    # 4. For multi-word tech (e.g. "Vue.js", "Ruby on Rails"), check if primary root matches
    words = [w for w in re.split(r"[^a-z0-9]", tech_lower) if len(w) >= 3]
    if any(re.search(r"\b" + re.escape(w) + r"\b", corpus) for w in words):
        return True

    return False


def _filter_technologies(
    raw_techs: Any,
    repo: RepositoryDetails,
    activity: RepositoryActivity,
) -> list[str]:
    """Ensure the technologies list contains only actual tech names, strictly excluding licenses and noise."""
    filtered: list[str] = []

    if isinstance(raw_techs, list):
        for item in raw_techs:
            if not isinstance(item, str):
                continue
            cleaned = item.strip()
            lower = cleaned.lower()

            if len(cleaned) < 2 or len(cleaned) > 50:
                continue

            # 1. Never allow licenses
            if _is_license(cleaned, repo.license):
                continue

            # 2. Never allow generic non-technology phrases
            if lower in GENERIC_NON_TECHS or _normalize_token(lower) in GENERIC_NON_TECHS:
                continue

            # 3. Must be supported by GitHub repository data provided
            if not _is_supported_by_repo_data(cleaned, repo, activity):
                continue

            if cleaned not in filtered:
                filtered.append(cleaned)

    # Ensure primary language is present if known and list doesn't have it
    if repo.language and repo.language.strip():
        lang_clean = repo.language.strip()
        if not any(t.lower() == lang_clean.lower() for t in filtered):
            filtered.insert(0, lang_clean)

    return filtered


def _prepare_compact_repo_payload(repo: RepositoryDetails, activity: RepositoryActivity) -> dict[str, Any]:
    """
    Prepare a clean, structured dictionary of repository facts for Groq.
    Repository license is legal metadata kept exclusively in repository.license and excluded here.
    """
    commits_summary = [
        {
            "sha": c.sha,
            "message": c.message,
            "author": c.author or "Unknown",
            "date": c.date,
        }
        for c in activity.recent_commits
    ]

    return {
        "name": repo.name,
        "full_name": repo.full_name,
        "owner": repo.owner,
        "description": repo.description or "No description provided",
        "primary_language": repo.language or "Not specified",
        "topics": repo.topics,
        "stars": repo.stars,
        "forks": repo.forks,
        "open_issues": repo.open_issues,
        "created_at": repo.created_at,
        "updated_at": repo.updated_at,
        "default_branch": repo.default_branch or "main",
        "recent_commits": commits_summary,
    }


async def generate_groq_analysis(repo: RepositoryDetails, activity: RepositoryActivity) -> AIAnalysis:
    """
    Call Groq API to generate an AI explanation for the given repository data.
    Ensures strict JSON response validation, filters technologies, and handles errors.
    """
    if not settings.GROQ_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GROQ_API_KEY is not configured on the server. Please configure it in your .env file.",
        )

    compact_data = _prepare_compact_repo_payload(repo, activity)
    user_prompt = f"Repository Data:\n{json.dumps(compact_data, indent=2)}"

    headers = {
        "Authorization": f"Bearer {settings.GROQ_API_KEY}",
        "Content-Type": "application/json",
    }

    # Model candidates in order of preference
    model_candidates = [settings.GROQ_MODEL, "openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]
    seen = set()
    models_to_try = [m for m in model_candidates if m and not (m in seen or seen.add(m))]

    last_error_detail = "Failed to communicate with Groq API"

    async with httpx.AsyncClient(timeout=30.0) as client:
        for model in models_to_try:
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.2,
            }

            try:
                response = await client.post(GROQ_CHAT_COMPLETIONS_URL, headers=headers, json=payload)
            except httpx.TimeoutException:
                last_error_detail = "AI analysis timed out while contacting Groq API. Please try again."
                continue
            except httpx.RequestError as exc:
                last_error_detail = f"Network error while contacting Groq API: {str(exc)}"
                continue

            # If model does not exist or account lacks access, try next candidate
            if response.status_code == 404:
                last_error_detail = response.text
                continue

            # Handle common Groq API error codes
            if response.status_code == 401:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Groq authentication failed. Please check the configured GROQ_API_KEY.",
                )

            if response.status_code == 429:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Groq API rate limit reached. Please wait a moment and try again.",
                )

            if response.status_code >= 500:
                last_error_detail = f"Groq AI service error ({response.status_code}): {response.text}"
                continue

            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Groq API returned an error: {response.text}",
                )

            # Successfully received response
            try:
                raw_json = response.json()
                content = raw_json["choices"][0]["message"]["content"]
                parsed = json.loads(content)
            except (KeyError, json.JSONDecodeError, IndexError) as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Invalid JSON response received from Groq AI: {str(exc)}",
                )

            # Clean and filter technologies to ensure licenses and general words never leak in
            clean_technologies = _filter_technologies(
                raw_techs=parsed.get("technologies"),
                repo=repo,
                activity=activity,
            )

            # Clean target_users, key_features, and observations
            raw_users = parsed.get("target_users")
            clean_users = [str(u).strip() for u in raw_users if str(u).strip()] if isinstance(raw_users, list) else ["Developers"]

            raw_features = parsed.get("key_features")
            clean_features = [str(f).strip() for f in raw_features if str(f).strip()] if isinstance(raw_features, list) else []

            raw_obs = parsed.get("repository_health_or_activity_observations")
            default_obs = [f"Stars: {repo.stars}, Forks: {repo.forks}, Open issues: {repo.open_issues}"]
            clean_obs = [str(o).strip() for o in raw_obs if str(o).strip()] if isinstance(raw_obs, list) and raw_obs else default_obs

            # Validate and construct AIAnalysis object with robust defaults
            return AIAnalysis(
                project_summary=str(parsed.get("project_summary") or f"Overview of {repo.full_name}"),
                what_it_does=str(parsed.get("what_it_does") or repo.description or "No description available."),
                main_purpose=str(parsed.get("main_purpose") or "General software repository."),
                technologies=clean_technologies,
                target_users=clean_users,
                key_features=clean_features,
                repository_health_or_activity_observations=clean_obs,
                short_verdict=str(parsed.get("short_verdict") or f"{repo.name} is an active public repository."),
            )

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"Unable to process AI analysis with available Groq models. Detail: {last_error_detail}",
    )
