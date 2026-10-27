import os
from pathlib import Path
from dotenv import load_dotenv

# Locate and load the .env file from the project root
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"

if ENV_PATH.exists():
    load_dotenv(dotenv_path=ENV_PATH)
else:
    load_dotenv()


def _sanitize_env_var(value: str | None, default: str = "") -> str:
    """Helper to clean whitespace, quotes, and accidental semicolons from env values."""
    if not value:
        return default
    return value.strip().rstrip(";").strip("\"' ")


class Settings:
    """Application settings loaded from environment variables."""
    GITHUB_TOKEN: str = _sanitize_env_var(os.getenv("GITHUB_TOKEN"))
    GROQ_API_KEY: str = _sanitize_env_var(os.getenv("GROQ_API_KEY"))
    GROQ_MODEL: str = _sanitize_env_var(os.getenv("GROQ_MODEL"), "openai/gpt-oss-120b")
    ALLOWED_ORIGINS: list[str] = ["*"]


settings = Settings()
