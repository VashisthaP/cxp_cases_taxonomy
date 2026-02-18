# War Room Case Taxonomy & Agentic Portal

> A mission-critical internal auditing tool for CXP Support teams to classify, track, and analyze war room cases through a structured 15-field taxonomy with an AI-powered chatbot.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Next.js 14+ Frontend                 │
│  ┌─────────────┐ ┌──────────────┐ ┌───────────────────┐ │
│  │  Dashboard   │ │  Case Form   │ │  Agentic Chatbot  │ │
│  │  (Stats)     │ │  (15 Fields) │ │  (RAG Pipeline)   │ │
│  └─────────────┘ └──────────────┘ └───────────────────┘ │
│     React 18  ·  Shadcn UI  ·  Tailwind CSS  ·  Zod     │
└────────────────────────┬─────────────────────────────────┘
                         │ HTTPS/REST
┌────────────────────────┴─────────────────────────────────┐
│              Azure Functions v4 (Flex Consumption)       │
│  ┌──────┐ ┌───────┐ ┌───────────┐ ┌──────────────────┐  │
│  │Health│ │ Cases │ │ Dashboard │ │  Chat (RAG)      │  │
│  │  API │ │ CRUD  │ │   Stats   │ │  pgvector→GPT-4o │  │
│  └──────┘ └───────┘ └───────────┘ └──────────────────┘  │
│     Node.js 20  ·  Always Ready  ·  Retry Logic         │
└──────────┬─────────────────────────────────┬─────────────┘
           │                                 │
┌──────────┴──────────┐      ┌───────────────┴────────────┐
│  PostgreSQL 16      │      │   Azure OpenAI             │
│  Flexible Server    │      │   ├─ GPT-4o (chat)         │
│  ├─ pgvector        │      │   └─ text-embedding-       │
│  ├─ HNSW index      │      │       ada-002 (embeddings) │
│  └─ Full-text search│      └────────────────────────────┘
└─────────────────────┘
```

**Region:** Azure Central India (Pune) — optimized for Hyderabad-based teams.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | 20+ | [nodejs.org](https://nodejs.org/) |
| **Azure CLI** | 2.50+ | [Install Azure CLI](https://docs.microsoft.com/cli/azure/install-azure-cli) |
| **Azure Functions Core Tools** | 4.x | `npm install -g azure-functions-core-tools@4` |
| **Git** | Latest | [git-scm.com](https://git-scm.com/) |

---

## Quick Start (Local Development)

### 1. Clone & Install

```bash
# Clone the repository
git clone <repo-url>
cd cxp_cases_taxonomy

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

### 2. Set Up Local PostgreSQL

Ensure you have PostgreSQL 16+ with the `pgvector` extension:

```sql
CREATE DATABASE warroom_cases;
\c warroom_cases
CREATE EXTENSION IF NOT EXISTS vector;
```

### 3. Configure Environment

**Backend** — edit `backend/local.settings.json`:

```json
{
  "Values": {
    "PGHOST": "localhost",
    "PGPORT": "5432",
    "PGUSER": "postgres",
    "PGPASSWORD": "your-password",
    "PGDATABASE": "warroom_cases",
    "AZURE_OPENAI_ENDPOINT": "https://<your-openai>.openai.azure.com",
    "AZURE_OPENAI_API_KEY": "<your-key>",
    "AZURE_OPENAI_DEPLOYMENT_NAME": "gpt-4o",
    "AZURE_OPENAI_EMBEDDING_DEPLOYMENT": "text-embedding-ada-002"
  }
}
```

**Frontend** — create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:7071/api
```

### 4. Run Locally

```bash
# Terminal 1: Start Azure Functions backend
cd backend
npm run build
func start

# Terminal 2: Start Next.js frontend
cd frontend
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## 1-Click Azure Deployment

```bash
# Login to Azure
az login

# Run the deployment script
chmod +x deploy.sh
./deploy.sh
```

The script will:
1. Create a resource group in Central India
2. Deploy all infrastructure via Bicep (PostgreSQL, Functions, Storage, App Insights)
3. Build and deploy the Azure Functions backend
4. Build the Next.js frontend with the correct API URL

### Environment Variables for CI/CD

```bash
export WARROOM_RG_NAME="warroom-rg"
export WARROOM_PG_PASSWORD="<strong-password>"
export WARROOM_OPENAI_NAME="<openai-resource-name>"
export WARROOM_OPENAI_KEY="<openai-api-key>"
./deploy.sh
```

---

## Data Taxonomy (15 Fields)

| # | Field | Type | Required | Conditional Logic |
|---|-------|------|----------|-------------------|
| 1 | **Case ID** | Text | ✅ Yes | Unique, duplicate-checked |
| 2 | **Case Type** | Dropdown | ✅ Yes | Advisory, Break-fix, Task-based, RCA |
| 3 | **TA Name** | Text | ✅ Yes | — |
| 4 | **Case Reviewed** | Checkbox | ✅ Yes | — |
| 5 | **Reviewer Notes** | Textarea | ❌ No | — |
| 6 | **Summary/Next Action** | Textarea | ✅ Yes | — |
| 7 | **Issue Type** | Dropdown | ✅ Yes | Config, How-to, Bug/Defect, Service Incident, Performance, Limits/Quota |
| 8 | **FQR Accurate** | Dropdown | ✅ Yes | Yes, No, N/A, FQR Not Set |
| 9 | **FQR Help Resolve** | Dropdown | ✅ Yes | Yes, No, N/A |
| 10 | **Idle > 8 Hours** | Checkbox | ✅ Yes | If checked → shows field #11 |
| 11 | **Idleness Reason** | Dropdown | ⚡ Conditional | Required when #10 = true |
| 12 | **Collab Wait Reason** | Dropdown | ⚡ Conditional | Required when #11 = "Collaboration Team" |
| 13 | **PG Wait Reason** | Dropdown | ⚡ Conditional | Required when #11 = "PG" |
| 14 | **Case Complexity** | Dropdown | ✅ Yes | Low, Medium, High |
| 15 | **Next Action Owner** | Dropdown | ✅ Yes | Customer, Microsoft, Vendor |
| 16 | **Source of Resolution** | Dropdown | ✅ Yes | Documentation, Internal KB, PG Consult, etc. |

### Conditional Validation Flow

```
idle_over_8_hours = true
  └─→ idleness_reason (REQUIRED)
       ├── "Collaboration Team"
       │     └─→ collab_wait_reason (REQUIRED)
       ├── "PG"
       │     └─→ pg_wait_reason (REQUIRED)
       └── Other values
             └─→ No additional fields
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check & DB connectivity |
| `POST` | `/api/cases` | Create a new case |
| `GET` | `/api/cases` | List cases (paginated, filterable) |
| `GET` | `/api/cases/{caseId}` | Get single case |
| `PUT` | `/api/cases/{caseId}` | Update case |
| `DELETE` | `/api/cases/{caseId}` | Delete case |
| `GET` | `/api/dashboard/stats` | Aggregated statistics |
| `POST` | `/api/chat` | AI chatbot (RAG pipeline) |

### Query Parameters (GET /api/cases)

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page (max 100) |
| `search` | string | — | Search across case_id, ta_name, notes |
| `case_type` | string | — | Filter by case type |
| `issue_type` | string | — | Filter by issue type |
| `case_reviewed` | boolean | — | Filter by review status |

---

## Resilience & Performance

### Error Handling

- **Database**: 3 retries with exponential backoff for transient errors (ECONNRESET, timeouts, PostgreSQL error codes 57P01-57P03, 08001-08006)
- **Azure OpenAI**: 5 retries with `retry-after` header support, graceful degradation (cases saved without embeddings)
- **HTTP Client**: Axios interceptors with 3 retries, exponential backoff (1s → 2s → 4s)
- **Duplicate Detection**: Pre-check before INSERT, returns HTTP 409 Conflict

### Cold Start Elimination

```bicep
// Always Ready instances configured in Bicep
properties: {
  functionAppConfig: {
    scaleAndConcurrency: {
      alwaysReady: [{ name: 'http', instanceCount: 1 }]
      maximumInstanceCount: 10
    }
  }
}
```

### Performance Targets

| Metric | Target | Implementation |
|--------|--------|----------------|
| API Response | < 200ms | Always Ready, connection pooling |
| Chat Response | < 3s | pgvector HNSW index, streaming |
| Form Validation | Instant | Client-side Zod validation |
| Search | < 500ms | GIN full-text index, ILIKE fallback |

---

## Project Structure

```
cxp_cases_taxonomy/
├── frontend/                    # Next.js 14+ Application
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx       # Root layout
│   │   │   ├── page.tsx         # Main dashboard
│   │   │   └── globals.css      # Global styles & themes
│   │   ├── components/
│   │   │   ├── ui/              # Shadcn UI components
│   │   │   ├── case-form.tsx    # 15-field taxonomy form
│   │   │   ├── case-list.tsx    # Paginated case list
│   │   │   └── chat-sidebar.tsx # Agentic chatbot
│   │   ├── lib/
│   │   │   ├── api.ts           # Axios client with retry
│   │   │   ├── utils.ts         # cn() utility
│   │   │   └── validation.ts   # Zod schema
│   │   ├── types/
│   │   │   └── case.ts          # TypeScript types & enums
│   │   └── hooks/
│   │       └── use-toast.ts     # Toast notifications
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   └── tsconfig.json
├── backend/                     # Azure Functions v4
│   ├── src/
│   │   ├── functions/
│   │   │   ├── cases.ts         # CRUD operations
│   │   │   ├── chat.ts          # RAG pipeline
│   │   │   ├── dashboard.ts     # Statistics
│   │   │   └── health.ts       # Health check
│   │   ├── database.ts          # PostgreSQL + pgvector
│   │   └── openai.ts            # Azure OpenAI client
│   ├── package.json
│   ├── host.json
│   ├── local.settings.json
│   └── tsconfig.json
├── infra/                       # Infrastructure as Code
│   ├── main.bicep               # Azure resources
│   └── main.bicepparam          # Parameters
├── deploy.sh                    # 1-Click deployment script
└── README.md                    # This file
```

---

## Chatbot (Agentic AI)

The embedded chatbot uses a **Retrieval-Augmented Generation (RAG)** pipeline:

1. **Embed query** → Azure OpenAI `text-embedding-ada-002` → 1536-dim vector
2. **Search cases** → pgvector cosine similarity (HNSW index, top-10)
3. **Fallback** → PostgreSQL full-text search → recent cases
4. **Generate** → GPT-4o with case context (temperature=0.3, max 1500 tokens)

### Example Queries

- *"Show me all break-fix cases with high complexity this week"*
- *"Which cases have been idle for more than 8 hours?"*
- *"Summarize the most common issue types across reviewed cases"*
- *"What's the resolution pattern for configuration issues?"*

---

## Azure Resources Provisioned

| Resource | SKU | Purpose |
|----------|-----|---------|
| PostgreSQL Flexible Server | B2s (32GB) | Case data + pgvector |
| Azure Functions | Flex Consumption (FC1) | API backend |
| Storage Account | Standard LRS | Function App storage |
| Application Insights | — | Monitoring & telemetry |
| Log Analytics Workspace | — | Centralized logging |

**Estimated Cost:** ~$50-80/month for 500-800 users with moderate usage.

---

## License

Internal use only — Microsoft CXP Support.