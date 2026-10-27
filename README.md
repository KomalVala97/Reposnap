# RepoSnap 🚀

RepoSnap is a high-performance FastAPI backend service that takes a public GitHub repository URL, extracts metadata and recent activity via the GitHub REST API, and delivers an intelligent, factual AI-powered breakdown using the Groq API.

Built specifically to power frontend client applications with clean, structured JSON.

---

## 🛠️ Tech Stack

- **Framework:** [FastAPI](https://fastapi.tiangolo.com/) (Python 3.10+)
- **Server:** [Uvicorn](https://www.uvicorn.org/) (ASGI server)
- **Data Validation:** [Pydantic v2](https://docs.pydantic.dev/)
- **HTTP Client:** [HTTPX](https://www.python-httpx.org/) (Async HTTP requests)
- **External APIs:**
  - [GitHub REST API](https://docs.github.com/en/rest) (Repository metadata & recent commits)
  - [Groq Cloud API](https://console.groq.com/) (Fast AI analysis using LLaMA / OSS models)
- **Environment Management:** [python-dotenv](https://github.com/theskumar/python-dotenv)
- **CORS:** FastAPI CORSMiddleware (Preconfigured for frontend integration)

---

## 📂 Project Structure

```text
RepoSnap/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI application, routes, and middleware
│   ├── config.py            # Environment configuration and settings
│   ├── models.py            # Pydantic request and response schemas
│   └── services/
│       ├── __init__.py
│       ├── github_service.py # GitHub REST API calls and URL parser
│       └── groq_service.py   # Groq API integration and prompt orchestration
├── .env.example             # Template for required environment variables
├── .gitignore               # Excludes secrets, caches, and virtualenvs
├── requirements.txt         # Python project dependencies
└── README.md                # Documentation and setup instructions
```

---

## ⚙️ Prerequisites & Setup

### 1. Clone or Open the Repository
```bash
git clone https://github.com/KomalVala97/Raposnap.git
cd Raposnap
```

### 2. Create and Activate a Virtual Environment
**On Windows (PowerShell):**
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

**On macOS / Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

---

## 🔑 Environment Variables Configuration

Create a `.env` file in the project root directory (you can copy `.env.example`):

```bash
cp .env.example .env
```

Add your API credentials to `.env`:

```env
# GitHub Personal Access Token (recommended to avoid rate limits on public repositories)
GITHUB_TOKEN=your_github_personal_access_token_here

# Groq Cloud API Key (required for AI analysis)
GROQ_API_KEY=your_groq_api_key_here

# Groq Model (optional, default: openai/gpt-oss-120b)
GROQ_MODEL=openai/gpt-oss-120b
```

> **Security Notes:**
> - Never commit `.env` into version control. It is already included in `.gitignore`.
> - Do not include trailing semicolons (`;`) in `.env` values.

---

## 🚀 Running the Server

Start the FastAPI development server with hot reload:

```bash
uvicorn app.main:app --reload --port 8000
```

The API will be accessible at:
- **API Base URL:** `http://127.0.0.1:8000`
- **Interactive Swagger Docs:** `http://127.0.0.1:8000/docs`
- **ReDoc Documentation:** `http://127.0.0.1:8000/redoc`

---

## 📡 API Endpoints

### 1. Health Check
Checks if the backend service is running and healthy.

- **Method:** `GET`
- **Path:** `/health`
- **Response Status:** `200 OK`
- **Example Response:**
  ```json
  {
    "status": "ok",
    "service": "RepoSnap"
  }
  ```

---

### 2. Analyze Repository
Parses a public GitHub repository, fetches repository details and recent commits, and generates a structured AI summary.

- **Method:** `POST`
- **Path:** `/api/analyze`
- **Headers:** `Content-Type: application/json`

#### Request Body
```json
{
  "url": "https://github.com/psf/requests"
}
```

#### Supported URL Formats:
- `https://github.com/owner/repository`
- `http://github.com/owner/repository`
- `github.com/owner/repository`
- `https://github.com/owner/repository.git`
- `https://github.com/owner/repository/`

---

#### Example cURL Request

```bash
curl -X POST "http://127.0.0.1:8000/api/analyze" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com/psf/requests"}'
```

---

#### Example Response (`200 OK`)

```json
{
  "repository": {
    "name": "requests",
    "full_name": "psf/requests",
    "owner": "psf",
    "description": "A simple, yet elegant, HTTP library.",
    "url": "https://github.com/psf/requests",
    "stars": 54728,
    "forks": 12106,
    "open_issues": 244,
    "language": "Python",
    "topics": [
      "client",
      "cookies",
      "forhumans",
      "http",
      "humans",
      "python",
      "python-requests",
      "requests"
    ],
    "license": "Apache License 2.0",
    "created_at": "2011-02-13T18:38:17Z",
    "updated_at": "2026-10-27T14:46:12Z",
    "default_branch": "main"
  },
  "activity": {
    "recent_commits": [
      {
        "sha": "3c7baaa",
        "message": "Bump the actions group with 4 updates (#7636)",
        "author": "dependabot[bot]",
        "date": "2026-10-26T17:14:41Z"
      },
      {
        "sha": "611c616",
        "message": "Bump the actions group with 3 updates (#7628)",
        "author": "dependabot[bot]",
        "date": "2026-09-21T20:22:33Z"
      },
      {
        "sha": "dae7ef6",
        "message": "Bump https://github.com/astral-sh/ruff-pre-commit (#7616)",
        "author": "dependabot[bot]",
        "date": "2026-09-02T18:15:52Z"
      },
      {
        "sha": "5460f46",
        "message": "Update lock-issues.yml to latest dependencies (#7609)",
        "author": "Nate Prewitt",
        "date": "2026-08-25T00:45:57Z"
      },
      {
        "sha": "6af0b94",
        "message": "Bump https://github.com/astral-sh/ruff-pre-commit (#7608)",
        "author": "dependabot[bot]",
        "date": "2026-08-24T17:33:15Z"
      }
    ]
  },
  "ai_analysis": {
    "project_summary": "Requests is a popular Python library that provides a simple, human-friendly way to make HTTP requests.",
    "what_it_does": "It abstracts the complexities of making network calls, letting developers send GET, POST, and other HTTP methods with clean, readable code while handling details like headers, cookies, and authentication automatically.",
    "main_purpose": "To offer an elegant, easy-to-use HTTP client for Python applications.",
    "technologies": [
      "Python"
    ],
    "target_users": [
      "Python developers",
      "Web developers",
      "Data scientists",
      "Anyone needing to interact with web APIs"
    ],
    "key_features": [
      "Straightforward API for HTTP methods",
      "Automatic cookie handling",
      "Support for authentication and sessions",
      "Human-readable request syntax",
      "Extensive documentation and community support"
    ],
    "repository_health_or_activity_observations": [
      "~54.7k stars indicating strong community interest",
      "~12.1k forks showing wide reuse",
      "244 open issues suggesting active discussion but manageable load",
      "Recent commits demonstrate ongoing maintenance",
      "Dependabot bot activity reflects proactive dependency updates"
    ],
    "short_verdict": "Requests remains a well-maintained, widely adopted HTTP library for Python with strong community backing."
  }
}
```

---

## 🛡️ Error Handling & Status Codes

| Status Code | Description | Cause |
|---|---|---|
| `200 OK` | Success | Analysis completed successfully |
| `400 Bad Request` | Invalid Input | Malformed URL, missing owner/repo, or non-GitHub domain |
| `404 Not Found` | Repo Not Found | Repository does not exist or is private |
| `422 Unprocessable` | Schema Error | Request body missing or empty `"url"` |
| `429 Too Many Requests` | Rate Limit | GitHub API or Groq API rate limit hit |
| `500 Server Error` | Config Issue | Missing `GROQ_API_KEY` in environment variables |
| `502 Bad Gateway` | Upstream Error | GitHub or Groq API network / server failure |
| `504 Gateway Timeout` | Timeout | Upstream service did not respond within timeout window |

---

## 🌐 Frontend Integration (CORS)

Cross-Origin Resource Sharing (CORS) is enabled by default for all origins (`*`), so your frontend application (e.g. React, Next.js, Vue, or vanilla JavaScript) can call `http://127.0.0.1:8000/api/analyze` without encountering CORS blocks.
