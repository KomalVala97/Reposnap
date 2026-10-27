# RepoSnap 🚀

RepoSnap is a high-performance GitHub repository analysis platform that takes a public GitHub repository URL, extracts metadata and recent activity via the GitHub REST API, and delivers an intelligent, factual AI-powered breakdown using the Groq API.

The frontend also uses the QuickChart API to transform repository metrics and activity data into visual analytics.

Built with a FastAPI backend and a lightweight frontend, RepoSnap provides clean, structured repository insights through an end-to-end GitHub → AI → visualization workflow.

---

## 🛠️ Tech Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend Framework:** [FastAPI](https://fastapi.tiangolo.com/) (Python 3.10+)
- **Server:** [Uvicorn](https://www.uvicorn.org/) (ASGI server)
- **Data Validation:** [Pydantic v2](https://docs.pydantic.dev/)
- **HTTP Client:** [HTTPX](https://www.python-httpx.org/) (Async HTTP requests)
- **External APIs:**
  - [GitHub REST API](https://docs.github.com/en/rest) (Repository metadata & recent commits)
  - [Groq Cloud API](https://console.groq.com/) (AI-powered repository analysis)
  - [QuickChart API](https://quickchart.io/) (Repository metric visualizations)
- **Environment Management:** [python-dotenv](https://github.com/theskumar/python-dotenv)
- **CORS:** FastAPI CORSMiddleware (Configured for frontend integration)

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
├── index.html               # RepoSnap frontend interface
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

Create a `.env` file in the project root directory.

You can copy `.env.example` and then add your own credentials.

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env
```

**macOS / Linux:**

```bash
cp .env.example .env
```

Add your API credentials to `.env`:

```env
# GitHub Personal Access Token
# Recommended to avoid rate limits on public repositories
GITHUB_TOKEN=your_github_personal_access_token_here

# Groq Cloud API Key
GROQ_API_KEY=your_groq_api_key_here

# Groq Model
# Optional, defaults to the configured model in the application
GROQ_MODEL=openai/gpt-oss-120b
```

> **Security Notes:**
>
> - Never commit `.env` into version control.
> - `.env` is already included in `.gitignore`.
> - Never expose API keys in frontend code.
> - Do not include trailing semicolons (`;`) in `.env` values.
> - `.env.example` should contain placeholders only, never real API keys.

---

## 🚀 Running the Backend

Start the FastAPI development server with hot reload:

```bash
uvicorn app.main:app --reload --port 8000
```

The backend will be available at:

- **API Base URL:** `http://127.0.0.1:8000`
- **Interactive Swagger Docs:** `http://127.0.0.1:8000/docs`
- **ReDoc Documentation:** `http://127.0.0.1:8000/redoc`

---

## 🌐 Running the Frontend

RepoSnap currently uses a lightweight HTML/CSS/JavaScript frontend.

From the project root, run:

```bash
python -m http.server 5500
```

Then open:

```text
http://127.0.0.1:5500/index.html
```

The frontend communicates with the FastAPI backend through:

```text
http://127.0.0.1:8000/api/analyze
```

---

## 🔄 Application Flow

```text
User
  │
  │ GitHub Repository URL
  ▼
RepoSnap Frontend
  │
  │ POST /api/analyze
  ▼
FastAPI Backend
  │
  ├──────────────► GitHub REST API
  │                     │
  │                     ▼
  │              Repository metadata
  │              + recent commits
  │
  └──────────────► Groq API
                        │
                        ▼
                  AI repository analysis
                        │
                        ▼
                  Structured JSON
                        │
                        ▼
                 RepoSnap Frontend
                        │
                        ▼
                   QuickChart API
                        │
                        ▼
                 Visual analytics
```

### Backend Responsibilities

- Validate GitHub repository URLs
- Extract repository owner and name
- Retrieve repository metadata
- Retrieve recent commits
- Handle GitHub API errors
- Prepare compact data for AI analysis
- Generate structured AI analysis using Groq
- Return a clean JSON response to the frontend

### Frontend Responsibilities

- Accept the GitHub repository URL
- Display repository information
- Display Groq-generated analysis
- Display recent repository activity
- Generate and display QuickChart visualizations
- Handle loading and error states

---

## 📡 API Endpoints

### 1. Health Check

Checks if the backend service is running and healthy.

- **Method:** `GET`
- **Path:** `/health`
- **Response Status:** `200 OK`

#### Example Response

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

#### Supported URL Formats

```text
https://github.com/owner/repository
http://github.com/owner/repository
github.com/owner/repository
https://github.com/owner/repository.git
https://github.com/owner/repository/
```

---

### Example cURL Request

```bash
curl -X POST "http://127.0.0.1:8000/api/analyze" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com/psf/requests"}'
```

---

## 📦 Example Response

### `200 OK`

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

## 📊 QuickChart Integration

RepoSnap uses the [QuickChart API](https://quickchart.io/) to generate visual analytics from repository metrics.

The frontend dynamically creates QuickChart URLs using the repository data returned by the FastAPI backend and loads the generated charts into the UI.

The visualizations include repository metrics such as:

- ⭐ Stars
- 🍴 Forks
- 🐛 Open issues
- 📝 Recent commit activity
- 📈 Repository activity indicators

The current QuickChart integration uses the public `/chart` endpoint and does not require an API key.

The QuickChart integration is handled directly in `index.html` through JavaScript functions that generate Chart.js configuration objects and send them to the QuickChart rendering endpoint.

---

## 🛡️ Error Handling & Status Codes

| Status Code | Description | Cause |
|---|---|---|
| `200 OK` | Success | Analysis completed successfully |
| `400 Bad Request` | Invalid Input | Malformed URL, missing owner/repo, or non-GitHub domain |
| `404 Not Found` | Repo Not Found | Repository does not exist or is private |
| `422 Unprocessable Content` | Schema Error | Request body missing or empty `"url"` |
| `429 Too Many Requests` | Rate Limit | GitHub API or Groq API rate limit |
| `500 Server Error` | Configuration Issue | Missing required environment configuration |
| `502 Bad Gateway` | Upstream Error | GitHub or Groq API network/server failure |
| `504 Gateway Timeout` | Timeout | Upstream service did not respond within the configured timeout |

---

## 🔐 Security

RepoSnap follows basic security practices for handling API credentials:

- API keys are loaded from environment variables.
- `.env` is excluded from Git using `.gitignore`.
- `.env.example` contains placeholders only.
- API keys are never sent to the frontend.
- GitHub and Groq credentials remain on the backend.
- The frontend communicates with the backend instead of directly exposing private credentials.

---

## 🌐 Frontend Integration & CORS

Cross-Origin Resource Sharing (CORS) is enabled through FastAPI's `CORSMiddleware` to allow the frontend application to communicate with the backend.

The frontend sends repository analysis requests to:

```text
http://127.0.0.1:8000/api/analyze
```

The backend returns structured JSON containing:

```text
repository
activity
ai_analysis
```

This structure allows the frontend to independently display repository metrics, AI analysis, recent activity, and visual analytics.

---

## 🧪 Testing

The backend was tested using real public GitHub repositories.

Example test repository:

```text
https://github.com/psf/requests
```

The following were verified:

- FastAPI server startup
- Health endpoint
- GitHub repository retrieval
- Recent commit retrieval
- Groq AI analysis
- Structured JSON response
- Invalid GitHub URL handling
- Nonexistent repository handling
- API key protection
- `.env` exclusion from Git
- Frontend-to-backend integration
- QuickChart visualization generation

---

## 🚀 Future Improvements

Potential future improvements include:

- Deploying the FastAPI backend
- Deploying the frontend
- Making the backend URL configurable through frontend environment configuration
- Adding more repository analytics
- Supporting repository comparison
- Adding historical activity charts
- Adding caching to reduce repeated API requests
- Supporting additional GitHub repository insights

---


## 🧰 Troubleshooting Guide

If RepoSnap does not work as expected, check the following common issues before reporting a bug.

### 1. Missing API Configuration

**Symptoms:** The backend fails to start or repository analysis returns a server error.

**What to check:**
- Ensure a `.env` file exists in the project root.
- Verify that `GITHUB_TOKEN` and `GROQ_API_KEY` are configured.
- Check that the API keys are valid and have not expired.
- Restart the backend after changing environment variables.

### 2. Invalid GitHub Repository URL

**Symptoms:** The API returns `400 Bad Request` or `404 Not Found`.

**What to check:**
- Provide a valid GitHub repository URL.
- Confirm that the repository exists and is publicly accessible.
- Verify that the URL contains both the repository owner and repository name.

### 3. API Rate Limits

**Symptoms:** Repository analysis fails after multiple requests, potentially with `429 Too Many Requests`.

**What to check:**
- Review the response from the affected API.
- Check the GitHub or Groq API rate limits.
- Wait for the applicable rate limit window to reset before retrying.

### 4. Upstream API Errors

**Symptoms:** The backend returns `502 Bad Gateway` or `504 Gateway Timeout`.

**What to check:**
- Verify your internet connection.
- Check whether the GitHub and Groq services are accessible.
- Retry the request after a short wait.
- Review the backend terminal output for additional error details.

### 5. Frontend Cannot Connect to the Backend

**Symptoms:** Repository analysis fails when using the web interface.

**What to check:**
- Confirm that the FastAPI backend is running on `http://127.0.0.1:8000`.
- Open `http://127.0.0.1:8000/docs` to check whether the API documentation is accessible.
- Confirm that the frontend is configured to send requests to the correct backend URL.
- Check the browser's developer console for network or CORS errors.

### 6. Missing Python Dependencies

**Symptoms:** The backend fails to start because a Python module cannot be imported.

**What to check:**
- Activate the project's virtual environment.
- Install the dependencies using:

  ```bash
  pip install -r requirements.txt
  ```

- Restart the backend after installation.

If the issue persists, include the error message, the affected endpoint, and the steps needed to reproduce the problem when reporting it.

## 👩‍💻 Project

**RepoSnap**

AI-powered GitHub repository understanding through:

```text
GitHub REST API
       +
Groq API
       +
QuickChart API
       =
RepoSnap 🚀
```