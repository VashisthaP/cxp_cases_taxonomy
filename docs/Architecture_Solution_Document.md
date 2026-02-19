# BC VM PCY - Case Taxonomy Insights – Functional & Technical Architecture Solution Document

**Document Version:** 1.1  
**Date:** February 18, 2026  
**Project:** BC VM PCY - Case Taxonomy Insights – CXP Case Auditing System  
**Classification:** Internal  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Functional Architecture](#2-functional-architecture)
3. [Technical Architecture](#3-technical-architecture)
4. [Azure Integration Services](#4-azure-integration-services)
5. [Data Architecture](#5-data-architecture)
6. [Application Architecture](#6-application-architecture)
7. [AI & RAG Architecture](#7-ai--rag-architecture)
8. [Security Architecture](#8-security-architecture)
9. [Deployment Architecture](#9-deployment-architecture)
10. [Non-Functional Requirements](#10-non-functional-requirements)
11. [Technology Stack Summary](#11-technology-stack-summary)
12. [Cost Optimization Strategy](#12-cost-optimization-strategy)

---

## 1. Executive Summary

### 1.1 Purpose

BC VM PCY - Case Taxonomy Insights is an internal case taxonomy insights and auditing portal designed for Microsoft CXP (Customer Experience & Platform) Support teams. It enables structured classification, tracking, and AI-powered analysis of cases through a comprehensive 15-field taxonomy with an embedded agentic chatbot.

### 1.2 Business Problem

- CXP support teams lack a centralized, structured tool to audit and classify cases with consistent taxonomy.
- Manual case reviews via spreadsheets lead to inconsistent data entry, missed fields, and no conditional validation.
- No AI-powered analysis exists to identify trends, patterns, or actionable insights across case data.
- Case idleness tracking (>8 hours) and root cause attribution require tedious manual aggregation.
- Reviewers cannot quickly search or semantically query historical cases for resolution patterns.

### 1.3 Solution Overview

BC VM PCY - Case Taxonomy Insights provides:

- A **15-Field Structured Taxonomy Form** with conditional validation (idle cases → idleness reason → collab/PG wait reason).
- **Full CRUD Operations** for case management with duplicate detection and pagination.
- A **Real-Time Dashboard** with aggregated statistics (total, reviewed, pending, idle cases; breakdowns by type, issue, resolution source).
- An **AI-Powered Agentic Chatbot** using Retrieval-Augmented Generation (RAG) with pgvector similarity search + GPT-4o.
- **Semantic Vector Search** across all case data using Azure OpenAI text-embedding-ada-002 (1536-dim embeddings).
- **Full-Text Search** with PostgreSQL GIN indexes as an intelligent fallback.
- **Infrastructure as Code (Bicep)** for reproducible, one-click Azure deployments.
- **Application Insights** integration for end-to-end monitoring and diagnostics.

---

## 2. Functional Architecture

### 2.1 Functional Modules

```
┌───────────────────────────────────────────────────────────────────────┐
│              BC VM PCY - Case Taxonomy Insights                       │
├──────────────┬──────────────┬──────────────┬──────────────────────────┤
│   Dashboard  │   Case       │   Agentic    │   Search &              │
│   Module     │   Management │   Chatbot    │   Analytics             │
├──────────────┼──────────────┼──────────────┼──────────────────────────┤
│• KPI Cards   │• Create Case │• RAG Pipeline│• Text Search            │
│  (Total,     │• Edit Case   │• pgvector    │• Filter by Type         │
│   Reviewed,  │• Delete Case │  Similarity  │• Filter by Issue        │
│   Pending,   │• List Cases  │• GPT-4o Chat │• Filter by Review       │
│   Idle)      │• View Detail │• Multi-Turn  │  Status                 │
│• Type Chart  │• 15-Field    │  Conversation│• Paginated Results      │
│• Issue Chart │  Taxonomy    │• Source Refs  │• Case-by-Case Detail    │
│• Resolution  │• Conditional │• Fallback to │• Export Analytics        │
│  Source Chart│  Validation  │  Text Search │                          │
│• Auto-Refresh│• Duplicate   │• Recent Cases│                          │
│              │  Detection   │  Context     │                          │
└──────────────┴──────────────┴──────────────┴──────────────────────────┘
```

### 2.2 User Roles & Permissions

| Role | Access Level | Capabilities |
|------|-------------|--------------|
| CXP Reviewer | Full Access | Create, edit, delete cases; view dashboard; use chatbot |
| TA (Technical Advisor) | Full Access | All reviewer capabilities; primary case auditor |
| Manager | Read + Analytics | View dashboard, query chatbot, export data |
| System | API Access | Health checks, automated monitoring |

> **Note:** The current version uses anonymous function-level auth. Role-based access control (RBAC) with Azure AD/Entra ID integration is planned for v2.0.

### 2.3 Core Workflows

#### 2.3.1 Case Audit Lifecycle

```
                    ┌──────────────┐
                    │  TA Reviews  │
                    │    a Case    │
                    │              │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  Opens Portal│
                    │  (Dashboard) │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  Clicks      │
                    │  "New Case"  │
                    └──────┬───────┘
                           │
                    ┌──────▼──────────────────┐
                    │  Fills 15-Field Taxonomy │
                    │  ├─ Case ID (unique)     │
                    │  ├─ Case Type            │
                    │  ├─ Issue Type           │
                    │  ├─ FQR Accuracy         │
                    │  ├─ Idle > 8hrs?         │
                    │  │   └─→ Conditional     │
                    │  │       fields shown     │
                    │  ├─ Case Complexity       │
                    │  └─ Source of Resolution  │
                    └──────┬──────────────────┘
                           │
              ┌────────────┼────────────────┐
              │ Zod Client │                │
              │ Validation │                │
              ▼            ▼                ▼
        ┌──────────┐ ┌──────────┐   ┌──────────────┐
        │ Duplicate│ │ Embedding│   │  Case Saved  │
        │ Check    │ │ Generated│   │  to Database │
        │ (409)    │ │ (async)  │   │  (201)       │
        └──────────┘ └──────────┘   └──────────────┘
```

#### 2.3.2 RAG Chatbot Workflow

```
   User                    Azure Functions              Azure OpenAI
     │                          │                            │
     │  "Show me all idle       │                            │
     │   break-fix cases"       │                            │
     ├─────────────────────────►│                            │
     │                          │                            │
     │    Step 1: Embed query   │   text-embedding-ada-002   │
     │                          ├───────────────────────────►│
     │                          │   [1536-dim vector]        │
     │                          │◄───────────────────────────┤
     │                          │                            │
     │    Step 2: pgvector      │                            │
     │    similarity search     │                            │
     │    (cosine, top-10)      │                            │
     │                          │                            │
     │    Step 3: Build RAG     │                            │
     │    context from cases    │                            │
     │                          │                            │
     │    Step 4: GPT-4o chat   │   GPT-4o (temp=0.3)       │
     │                          ├───────────────────────────►│
     │                          │   [AI Response]            │
     │                          │◄───────────────────────────┤
     │                          │                            │
     │  Response + Source Refs   │                            │
     │◄─────────────────────────┤                            │
```

#### 2.3.3 Conditional Validation Flow

```
idle_over_8_hours = true
  └─→ idleness_reason (REQUIRED — select one)
       ├── "Collaboration Team"
       │     └─→ collab_wait_reason (REQUIRED)
       │          ├── Incorrect Team
       │          ├── Not Triaged
       │          ├── Unsure
       │          └── In Progress
       ├── "PG"
       │     └─→ pg_wait_reason (REQUIRED)
       │          ├── Incorrect PG
       │          ├── Not Triaged
       │          ├── Unsure
       │          └── In Progress
       └── Other values (Awaiting Cx, AVA, Unsure, Engineer Workload, NA)
             └─→ No additional fields required
```

### 2.4 Functional Features Detail

| # | Feature | Description |
|---|---------|-------------|
| 1 | Case Creation | 15-field structured taxonomy form with Zod validation and conditional field logic |
| 2 | Duplicate Detection | Pre-check on Case ID uniqueness before INSERT; returns HTTP 409 Conflict |
| 3 | Case Listing | Paginated table (20/page, max 100) with multi-field search and filters |
| 4 | Case Editing | Full PUT update with re-embedding generation for updated case data |
| 5 | Case Deletion | Soft-delete capability with confirmation dialog |
| 6 | Dashboard KPIs | Real-time cards: Total, Reviewed, Pending, Idle cases with auto-refresh |
| 7 | Type Distribution | Aggregated breakdown by Case Type (New, Transferred, Re-Opened) |
| 8 | Issue Analytics | Aggregated breakdown by Issue Type (Advisory, Break-fix, RCA, etc.) |
| 9 | Resolution Source | Aggregated breakdown by Source of Resolution (ASC FQR, Wiki, ICM, etc.) |
| 10 | Agentic Chatbot | RAG-powered AI assistant with pgvector search + GPT-4o generation |
| 11 | Multi-Turn Chat | Conversation history maintained (last 6 messages for context window) |
| 12 | Source References | Chatbot responses include Case ID references from retrieved context |
| 13 | Health Monitoring | `/api/health` endpoint with database connectivity check |
| 14 | Search & Filter | Text search across case_id, ta_name, notes; dropdown filters for type/issue |

---

## 3. Technical Architecture

### 3.1 High-Level Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                          USER BROWSER                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────────────┐ │
│  │ React 18    │  │ Shadcn UI    │  │ Tailwind CSS                  │ │
│  │ Components  │  │ (Radix UI)   │  │ + tailwindcss-animate         │ │
│  └──────┬──────┘  └──────┬───────┘  └──────┬────────────────────────┘ │
└─────────┼────────────────┼─────────────────┼──────────────────────────┘
          │  HTTPS          │  HTTPS           │  REST API (JSON)
          ▼                 ▼                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│              AZURE STATIC WEB APPS (East Asia)                         │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │                 Next.js 14+ (Static Export)                     │   │
│  │  ┌──────────────────────────────────────────────────────────┐  │   │
│  │  │               App Router (React Server Components)       │  │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌───────────┐ │  │   │
│  │  │  │Dashboard │ │ Case     │ │ Case      │ │  Chat     │ │  │   │
│  │  │  │  Page    │ │  Form    │ │  List     │ │  Sidebar  │ │  │   │
│  │  │  └──────────┘ └──────────┘ └───────────┘ └───────────┘ │  │   │
│  │  │  ┌──────────────────────────────────────────────────────┐│  │   │
│  │  │  │  Zod Validation | Axios Client | React Hook Form     ││  │   │
│  │  │  └──────────────────────────────────────────────────────┘│  │   │
│  │  └──────────────────────────────────────────────────────────┘  │   │
│  └────────────────────────────────────────────────────────────────┘   │
└──────┬────────────────────────────────────────────────────────────────┘
       │  HTTPS / REST API
       ▼
┌────────────────────────────────────────────────────────────────────────┐
│              AZURE FUNCTIONS v4 (Consumption Y1 – Central India)       │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │                Node.js 20 Runtime (Linux)                      │   │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌───────────────┐   │   │
│  │  │  Health  │ │  Cases   │ │ Dashboard │ │  Chat (RAG)   │   │   │
│  │  │  Check   │ │  CRUD    │ │  Stats    │ │  Pipeline     │   │   │
│  │  │  (GET)   │ │(CRUD+OPT)│ │  (GET)    │ │  (POST)       │   │   │
│  │  └──────────┘ └──────────┘ └───────────┘ └───────────────┘   │   │
│  │  ┌──────────────────────────────────────────────────────────┐ │   │
│  │  │  database.ts (pg Pool + Retry) | openai.ts (Fetch API)  │ │   │
│  │  └──────────────────────────────────────────────────────────┘ │   │
│  └────────────────────────────────────────────────────────────────┘   │
└──────┬─────────────────────────────┬─────────────────────────────────┘
       │                             │
       ▼                             ▼
┌──────────────────┐   ┌─────────────────────────────────┐
│  PostgreSQL 16   │   │   Azure OpenAI (East US 2)      │
│  Flexible Server │   │   ┌───────────────────────────┐ │
│  (Central India) │   │   │ GPT-4o (chat completions) │ │
│  ┌─────────────┐ │   │   │ 30K TPM · Standard        │ │
│  │ pgvector    │ │   │   └───────────────────────────┘ │
│  │ extension   │ │   │   ┌───────────────────────────┐ │
│  │ HNSW index  │ │   │   │ text-embedding-ada-002    │ │
│  │ GIN index   │ │   │   │ 1536-dim · 30K TPM        │ │
│  │ B-tree idx  │ │   │   └───────────────────────────┘ │
│  └─────────────┘ │   └─────────────────────────────────┘
│  Standard B1ms   │
│  32 GB Storage   │
└──────────────────┘

       │
       ▼
┌──────────────────────────────────────────────────────────┐
│   Supporting Services                                     │
│  ┌──────────────┐  ┌───────────────┐  ┌───────────────┐ │
│  │ Storage      │  │ Application   │  │ Log Analytics │ │
│  │ Account      │  │ Insights      │  │ Workspace     │ │
│  │ (Functions)  │  │ (Monitoring)  │  │ (Logging)     │ │
│  │ Std LRS      │  │ Web type      │  │ PerGB2018     │ │
│  └──────────────┘  └───────────────┘  └───────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### 3.2 Application Layer Architecture

The application follows a clean, modular architecture with clear separation of concerns:

**Backend (Azure Functions v4 – TypeScript):**

```
backend/
├── src/
│   ├── functions/
│   │   ├── cases.ts           # CRUD: POST/GET/PUT/DELETE /api/cases
│   │   ├── chat.ts            # RAG: POST /api/chat
│   │   ├── dashboard.ts       # Stats: GET /api/dashboard/stats
│   │   └── health.ts          # Health: GET /api/health
│   ├── database.ts            # PostgreSQL pool + retry logic (singleton)
│   └── openai.ts              # Azure OpenAI embedding + chat (fetch API)
├── host.json                  # Functions runtime configuration
├── local.settings.json        # Local development settings
├── package.json               # Dependencies & scripts
└── tsconfig.json              # TypeScript: CommonJS, ES2022
```

**Frontend (Next.js 14+ – TypeScript):**

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx         # Root layout (Inter font, Toaster)
│   │   ├── page.tsx           # Main page (dashboard, form, list, chat)
│   │   └── globals.css        # Global styles, CSS variables, themes
│   ├── components/
│   │   ├── ui/                # Shadcn UI primitives (Button, Card, Select, etc.)
│   │   ├── case-form.tsx      # 15-field taxonomy form (React Hook Form + Zod)
│   │   ├── case-list.tsx      # Paginated case table with search & filters
│   │   └── chat-sidebar.tsx   # Sliding chatbot panel (RAG interface)
│   ├── lib/
│   │   ├── api.ts             # Axios client with retry interceptors
│   │   ├── utils.ts           # cn() utility (clsx + tailwind-merge)
│   │   └── validation.ts      # Zod schema with conditional validation
│   ├── types/
│   │   └── case.ts            # TypeScript interfaces, enums, option arrays
│   └── hooks/
│       └── use-toast.ts       # Toast notification hook
├── next.config.js             # Static export for Azure Static Web Apps
├── tailwind.config.js         # Tailwind CSS configuration
├── postcss.config.js          # PostCSS (Tailwind + Autoprefixer)
└── tsconfig.json              # TypeScript: ESNext, path aliases
```

### 3.3 Design Patterns Used

| Pattern | Implementation |
|---------|---------------|
| Singleton Pool | `database.ts` – Single `pg.Pool` instance reused across function invocations |
| Retry with Backoff | `queryWithRetry()` – 3 retries, exponential backoff for transient DB errors |
| Rate Limit Handler | `openai.ts` – 5 retries with `retry-after` header support for 429 responses |
| Graceful Degradation | Embedding failures don't block case creation; chatbot falls back to text search |
| Repository Pattern | Each function file encapsulates its own data access logic |
| Client-Side Validation | Zod schema with `superRefine()` for conditional field validation |
| Interceptor Pattern | Axios interceptors for automatic retry on 429/5xx errors |
| Static Export | Next.js `output: 'export'` for CDN-optimized deployment |
| Feature Modules | Azure Functions registered per-feature (cases, chat, dashboard, health) |
| RAG Pipeline | 3-tier retrieval: pgvector → full-text search → recent cases fallback |

---

## 4. Azure Integration Services

### 4.1 Services Overview

| # | Service | SKU / Tier | Purpose |
|---|---------|-----------|---------|
| 1 | Azure Static Web Apps | Free | Host Next.js static frontend (CDN-distributed) |
| 2 | Azure Functions | Consumption (Y1 Dynamic) | Serverless API backend (Node.js 20, Linux) |
| 3 | Azure Database for PostgreSQL | Flexible, Standard B1ms | Relational data store with pgvector extension |
| 4 | Azure OpenAI Service | S0 (Standard) | GPT-4o chat + text-embedding-ada-002 embeddings |
| 5 | Azure Storage Account | StorageV2, Standard LRS | Azure Functions runtime storage |
| 6 | Azure Application Insights | Web component | Application performance monitoring & diagnostics |
| 7 | Azure Log Analytics Workspace | PerGB2018 | Centralized log aggregation & KQL querying |

### 4.2 Azure Functions Configuration

| Property | Value |
|----------|-------|
| Runtime | Node.js 20 (Linux) |
| Hosting Plan | Consumption (Y1 Dynamic) |
| Functions Runtime | v4 |
| HTTPS Only | Enforced |
| CORS | Configured for frontend domain |
| Package Deployment | `WEBSITE_RUN_FROM_PACKAGE=1` |

**App Settings (Environment Variables):**

| Setting | Purpose |
|---------|---------|
| `PGHOST` | PostgreSQL server FQDN |
| `PGPORT` | PostgreSQL port (5432) |
| `PGUSER` | Database admin username |
| `PGPASSWORD` | Database admin password (secure) |
| `PGDATABASE` | Database name (`warroom_cases`) |
| `PGSSLMODE` | SSL mode (`require`) |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI resource endpoint (auto-populated) |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API key (auto-populated from Bicep) |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | Chat model deployment (`gpt-4o`) |
| `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` | Embedding model deployment (`text-embedding-ada-002`) |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Application Insights telemetry |
| `AzureWebJobsStorage` | Functions runtime storage connection |

### 4.3 Azure Database for PostgreSQL – Flexible Server

| Property | Value |
|----------|-------|
| Engine Version | PostgreSQL 16 |
| SKU | Standard_B1ms (Burstable, 1 vCore, 2 GB RAM) |
| Storage | 32 GB |
| Backup Retention | 7 days |
| Geo-Redundancy | Disabled |
| SSL | Required (`sslmode=require`) |
| Firewall | Allow Azure Services (0.0.0.0) |
| Database Name | `warroom_cases` |
| Charset/Collation | UTF8 / en_US.utf8 |
| Extensions | pgvector (VECTOR) |
| Driver | pg (node-postgres) 8.11.3 |

### 4.4 Azure OpenAI Service

| Property | Value |
|----------|-------|
| SKU | S0 (Standard) |
| Region | East US 2 (GPT-4o availability) |
| Custom Subdomain | Auto-generated (`warroom-openai-*`) |
| Public Network Access | Enabled |

**Model Deployments:**

| Model | Deployment Name | Version | Capacity (TPM) | Purpose |
|-------|----------------|---------|-----------------|---------|
| GPT-4o | `gpt-4o` | 2024-08-06 | 30,000 | Chat completions (RAG responses) |
| text-embedding-ada-002 | `text-embedding-ada-002` | 2 | 30,000 | Vector embeddings (1536-dim) |

### 4.5 Azure Application Insights + Log Analytics

| Component | Purpose |
|-----------|---------|
| Application Insights | APM: request telemetry, exceptions, dependency tracking |
| Log Analytics Workspace | Centralized log storage with KQL query support |
| Retention | 30 days |
| Integration | Connection string injected via Function App Settings |

### 4.6 Bicep Template (Infrastructure as Code)

The project includes a comprehensive Bicep template (`infra/main.bicep`) that provisions all Azure resources in a single deployment:

**Resources Provisioned:**

1. Log Analytics Workspace
2. Application Insights (linked to Log Analytics)
3. Storage Account (Functions runtime, Standard LRS)
4. Azure OpenAI Service (S0, East US 2) + 2 model deployments
5. PostgreSQL Flexible Server (B1ms, pgvector enabled)
6. PostgreSQL Database (`warroom_cases`)
7. PostgreSQL Firewall Rule (Allow Azure Services)
8. PostgreSQL Configuration (pgvector extension)
9. App Service Plan (Consumption Y1, Linux)
10. Azure Function App (Node.js 20, all app settings pre-configured)

**Deployment Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `projectName` | string | `warroom` | Name prefix for all resources |
| `location` | string | `centralindia` | Primary Azure region |
| `openAiLocation` | string | `eastus2` | Azure OpenAI region |
| `pgAdminUser` | string | `warroom_admin` | PostgreSQL admin username |
| `pgAdminPassword` | secureString | — | PostgreSQL admin password |
| `pgSkuName` | string | `Standard_B1ms` | PostgreSQL SKU |
| `pgStorageGB` | int | `32` | PostgreSQL storage size |
| `environment` | string | `production` | Environment tag |

**Deployment Outputs:**

| Output | Description |
|--------|-------------|
| `apiUrl` | Azure Functions API base URL |
| `pgServerFqdn` | PostgreSQL server FQDN |
| `pgDatabaseName` | Database name |
| `appInsightsConnectionString` | App Insights connection string |
| `functionAppName` | Function App name (for publishing) |
| `storageAccountName` | Storage Account name |
| `openAiEndpoint` | Azure OpenAI endpoint URL |
| `openAiResourceName` | Azure OpenAI resource name |

---

## 5. Data Architecture

### 5.1 Entity Relationship Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                          CASES TABLE                              │
├──────────────────────────────────────────────────────────────────┤
│ id                  SERIAL PRIMARY KEY                            │
│ ─────────────────── Core Identity ──────────────────────────────│
│ case_id             VARCHAR(100) UNIQUE NOT NULL                  │
│ case_reviewed       BOOLEAN DEFAULT FALSE                        │
│ ta_name             VARCHAR(200) DEFAULT ''                       │
│ ta_reviewer_notes   TEXT DEFAULT ''                               │
│ ─────────────────── Classification ─────────────────────────────│
│ case_type           VARCHAR(50)   [New, Transferred, Re-Opened]  │
│ issue_type          VARCHAR(50)   [Advisory, Break fix, RCA...]  │
│ fqr_accurate        VARCHAR(50)   [Yes-Accurate, No-Misrouted..]│
│ fqr_help_resolve    VARCHAR(80)   [Yes, No, No-Generic...]       │
│ ─────────────────── Idle Tracking (Conditional) ────────────────│
│ idle_over_8_hours   BOOLEAN DEFAULT FALSE                        │
│ idleness_reason     VARCHAR(80)   [Awaiting Cx, Collab, PG...]  │
│ collab_wait_reason  VARCHAR(50)   [Incorrect Team, Not Triaged..]│
│ pg_wait_reason      VARCHAR(50)   [Incorrect PG, Not Triaged..] │
│ ─────────────────── Additional Flags ───────────────────────────│
│ engineer_workload   BOOLEAN DEFAULT FALSE                        │
│ unresponsive_cx     BOOLEAN DEFAULT FALSE                        │
│ icm_linked          BOOLEAN DEFAULT FALSE                        │
│ ─────────────────── Action & Resolution ────────────────────────│
│ case_complexity     VARCHAR(50)   [Aged, Transferred, Collabs..]│
│ next_action_owner   VARCHAR(50)   [Engineer, Customer, TA/SME..]│
│ next_action_sna     TEXT DEFAULT ''                               │
│ source_of_resolution VARCHAR(80)  [ASC FQR, Wiki, ICM...]       │
│ ─────────────────── AI / Embedding ─────────────────────────────│
│ embedding           VECTOR(1536)  [pgvector, text-embed-ada-002]│
│ ─────────────────── Timestamps ─────────────────────────────────│
│ created_at          TIMESTAMPTZ DEFAULT NOW()                    │
│ updated_at          TIMESTAMPTZ DEFAULT NOW()                    │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2 Database Indexes

| Index Name | Type | Column(s) | Purpose |
|------------|------|-----------|---------|
| `PRIMARY KEY` | B-tree | `id` | Row identity |
| `UNIQUE` | B-tree | `case_id` | Duplicate prevention |
| `idx_cases_case_type` | B-tree | `case_type` | Filter by case type |
| `idx_cases_issue_type` | B-tree | `issue_type` | Filter by issue type |
| `idx_cases_case_reviewed` | B-tree | `case_reviewed` | Filter by review status |
| `idx_cases_idle` | B-tree | `idle_over_8_hours` | Filter idle cases |
| `idx_cases_created_at` | B-tree | `created_at DESC` | Sort by recency |
| `idx_cases_search` | GIN | `tsvector(case_id, ta_name, notes, sna)` | Full-text search |
| `idx_cases_embedding` | HNSW | `embedding vector_cosine_ops` | pgvector similarity search |

**HNSW Index Parameters:**

| Parameter | Value | Description |
|-----------|-------|-------------|
| `m` | 16 | Maximum number of connections per layer |
| `ef_construction` | 64 | Size of the dynamic candidate list during construction |
| Algorithm | Approximate Nearest Neighbor | Faster than IVFFlat for read-heavy workloads |

### 5.3 Data Taxonomy Fields Summary

| # | Field | Type | Required | Conditional On |
|---|-------|------|----------|----------------|
| 1 | Case ID | VARCHAR(100) | Yes (Unique) | — |
| 2 | Case Reviewed | BOOLEAN | Yes | — |
| 3 | TA Name | VARCHAR(200) | No | — |
| 4 | TA Reviewer Notes | TEXT | No | — |
| 5 | Case Type | VARCHAR(50) | No | — |
| 6 | Issue Type | VARCHAR(50) | No | — |
| 7 | FQR Accurate | VARCHAR(50) | No | — |
| 8 | FQR Help Resolve | VARCHAR(80) | No | — |
| 9 | Idle Over 8 Hours | BOOLEAN | Yes | — |
| 9a | Idleness Reason | VARCHAR(80) | Conditional | `idle_over_8_hours = true` |
| 9b | Collab Wait Reason | VARCHAR(50) | Conditional | `idleness_reason = 'Collaboration Team'` |
| 9c | PG Wait Reason | VARCHAR(50) | Conditional | `idleness_reason = 'PG'` |
| 10 | Engineer Workload | BOOLEAN | No | — |
| 10 | Unresponsive Cx | BOOLEAN | No | — |
| 11 | Case Complexity | VARCHAR(50) | No | — |
| 12 | ICM Linked | BOOLEAN | No | — |
| 13 | Next Action Owner | VARCHAR(50) | No | — |
| 14 | Next Action SNA | TEXT | No | — |
| 15 | Source of Resolution | VARCHAR(80) | No | — |

### 5.4 Dropdown Enum Values

| Field | Options |
|-------|---------|
| Case Type | New, Transferred from other team, Re-Opened |
| Issue Type | Advisory, Break fix, RCA, Performance, Outage, Billing, Technical and Billing |
| FQR Accurate | Yes-Accurate, Yes-Right area, No-Misrouted, FQR Not Generated |
| FQR Help Resolve | Yes, No, No-Generic, No-Could not fetch details, No-TA intervention required |
| Idleness Reason | Awaiting response from Cx, Collaboration Team, PG, AVA, Unsure, Engineer Workload, NA |
| Collab Wait Reason | Incorrect Team, Not Triaged, Unsure, In Progress |
| PG Wait Reason | Incorrect PG, Not Triaged, Unsure, In Progress |
| Case Complexity | Aged-Not complex, Transferred, Collabs, PG Engagement, Integration Related |
| Next Action Owner | Engineer, Customer, TA/SME, Manager |
| Source of Resolution | ASC FQR, Wiki/Deep Research Agent, Ava Post, Collaboration Task, ICM, Diagnostics Tools, Live Cx, Still Open |

---

## 6. Application Architecture

### 6.1 Frontend Architecture

| Technology | Version | Purpose |
|-----------|---------|---------|
| Next.js | 14.2+ | React framework (App Router, static export) |
| React | 18.3+ | UI component library |
| Shadcn UI | Latest | Accessible UI primitives (built on Radix UI) |
| Tailwind CSS | 3.4+ | Utility-first CSS framework |
| React Hook Form | 7.71+ | Performant form state management |
| Zod | 3.22+ | Schema validation with TypeScript inference |
| Axios | 1.6+ | HTTP client with retry interceptors |
| Lucide React | 0.344+ | Icon library (tree-shakeable) |
| react-markdown | 9.0+ | Render chatbot Markdown responses |
| date-fns | 3.3+ | Date formatting utilities |

**Design Theme:**

| Property | Value |
|----------|-------|
| Primary Font | Inter (Google Fonts) |
| Color Scheme | Dark mode with CSS variables (HSL-based) |
| Component Library | Shadcn UI (Radix primitives + Tailwind) |
| Responsive | Mobile-first via Tailwind breakpoints |
| Animations | `tailwindcss-animate` for transitions |
| Class Merging | `clsx` + `tailwind-merge` via `cn()` utility |

### 6.2 REST API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/health` | Anonymous | Health check with DB connectivity test |
| `POST` | `/api/cases` | Anonymous | Create new case (with embedding generation) |
| `GET` | `/api/cases` | Anonymous | List cases (paginated, filtered, searchable) |
| `GET` | `/api/cases/{caseId}` | Anonymous | Get single case by Case ID |
| `PUT` | `/api/cases/{caseId}` | Anonymous | Update existing case (re-embed) |
| `DELETE` | `/api/cases/{caseId}` | Anonymous | Delete a case |
| `GET` | `/api/dashboard/stats` | Anonymous | Aggregated dashboard statistics |
| `POST` | `/api/chat` | Anonymous | AI chatbot (RAG pipeline) |
| `OPTIONS` | `/api/cases` | Anonymous | CORS preflight for cases |
| `OPTIONS` | `/api/cases/{caseId}` | Anonymous | CORS preflight for single case |
| `OPTIONS` | `/api/chat` | Anonymous | CORS preflight for chat |
| `OPTIONS` | `/api/dashboard/stats` | Anonymous | CORS preflight for dashboard |

**Query Parameters (GET /api/cases):**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `pageSize` | number | 20 | Items per page (max 100) |
| `search` | string | — | Search across case_id, ta_name, notes, SNA |
| `caseType` | string | — | Filter by case type |
| `issueType` | string | — | Filter by issue type |
| `reviewed` | boolean | — | Filter by review status |

### 6.3 Error Handling Architecture

| Layer | Strategy | Details |
|-------|----------|---------|
| Client (Axios) | 3 retries, exponential backoff | 1s → 2s → 4s; retries on network errors, 429, 5xx |
| Backend (Database) | 3 retries, exponential backoff | 1s → 2s → 4s; retries on ECONNRESET, PG error codes |
| Backend (OpenAI) | 5 retries, retry-after aware | Respects `retry-after` header; falls back to exponential |
| Embedding Failure | Graceful degradation | Case saved without embedding; chatbot won't find it via vector search |
| Chat Failure | Fallback chain | pgvector → full-text search → recent cases → error message |
| Duplicate Case | HTTP 409 Conflict | Pre-check before INSERT; clear error message to frontend |

---

## 7. AI & RAG Architecture

### 7.1 RAG Pipeline Overview

The chatbot implements a 3-tier Retrieval-Augmented Generation (RAG) pipeline:

```
┌─────────────────────────────────────────────────────────────────┐
│                    RAG Pipeline (POST /api/chat)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Step 1: EMBED USER QUERY                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  User message → text-embedding-ada-002 → 1536-dim vector│    │
│  │  Truncated to 8000 chars max                             │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          │                                       │
│                          ▼                                       │
│  Step 2: RETRIEVE RELEVANT CASES (3-Tier Fallback)              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Tier 1: pgvector cosine similarity (HNSW index)        │    │
│  │          SELECT ... ORDER BY embedding <=> query LIMIT 10│    │
│  │                                                          │    │
│  │  Tier 2: PostgreSQL full-text search (GIN index)        │    │
│  │          WHERE to_tsvector(...) @@ to_tsquery(keywords)  │    │
│  │                                                          │    │
│  │  Tier 3: Most recent cases (created_at DESC LIMIT 10)   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          │                                       │
│                          ▼                                       │
│  Step 3: GENERATE RESPONSE                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  System prompt + case context + user query → GPT-4o      │    │
│  │  Temperature: 0.3 (factual) · Max tokens: 1500          │    │
│  │  Context window: last 6 messages for multi-turn chat     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          │                                       │
│                          ▼                                       │
│  Step 4: RETURN WITH SOURCE REFERENCES                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  AI response + Case ID references (top-5 cited cases)   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Embedding Strategy

| Property | Value |
|----------|-------|
| Model | text-embedding-ada-002 |
| Dimensions | 1536 |
| Input Truncation | 8,000 characters max |
| Index Type | HNSW (approximate nearest neighbor) |
| Distance Metric | Cosine similarity (`vector_cosine_ops`) |
| Retrieval Count | Top-10 most similar cases |
| Storage | PostgreSQL `vector(1536)` column via pgvector |

**Embedded Text Construction:**

Each case is converted to a semantic text representation before embedding:

```
Case ID: {case_id}. TA Name: {ta_name}. Case Type: {case_type}. 
Issue Type: {issue_type}. FQR Accurate: {fqr_accurate}. 
Idle Over 8 Hours: {Yes/No}. Idleness Reason: {reason}. 
Case Complexity: {complexity}. Next Action Owner: {owner}. 
Source of Resolution: {source}. Reviewer Notes: {notes}. SNA: {sna}.
```

### 7.3 GPT-4o Configuration

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Temperature | 0.3 | Low for factual, consistent responses |
| Max Tokens | 1,500 | Sufficient for detailed summaries |
| Top P | 0.9 | Slightly constrained nucleus sampling |
| Context Window | Last 6 messages | Prevent token overflow in multi-turn chats |
| System Prompt | Case taxonomy analyst persona | Structured instructions for case data analysis |

### 7.4 Chatbot Capabilities

| Capability | Example Query |
|-----------|---------------|
| Case Search | "Show me all break-fix cases with high complexity" |
| Trend Analysis | "What are the most common issue types this week?" |
| Idle Analysis | "Which cases have been idle for more than 8 hours?" |
| Resolution Patterns | "What's the resolution pattern for configuration issues?" |
| Specific Case Detail | "Tell me about case ID SR-12345" |
| Aggregation | "How many cases are waiting on PG?" |

---

## 8. Security Architecture

### 8.1 Authentication & Authorization

| Aspect | Implementation |
|--------|---------------|
| Function Auth Level | Anonymous (open API) |
| Frontend Auth | None (internal network assumption) |
| CORS | Configured for frontend domain + localhost |
| Planned (v2.0) | Azure AD/Entra ID with MSAL.js + managed identity |

> **Security Note:** The current version is designed for internal Microsoft network access only. Production hardening with Azure AD authentication and managed identities is planned for v2.0.

### 8.2 Data Security

| Layer | Protection |
|-------|-----------|
| Transport | HTTPS enforced (`httpsOnly: true`) on all Azure services |
| Database SSL | `sslmode=require` on PostgreSQL connection |
| Storage TLS | Minimum TLS 1.2 on Storage Account |
| Blob Public Access | Disabled (`allowBlobPublicAccess: false`) |
| API Keys | Azure OpenAI key stored as Function App Setting (encrypted at rest) |
| Database Password | Passed as `@secure()` Bicep parameter (never in plaintext) |
| SQL Injection | Parameterized queries (`$1`, `$2`, etc.) via node-postgres |
| XSS Prevention | React auto-escaping + CSP headers in `next.config.js` |
| Clickjacking | `X-Frame-Options: DENY` header |
| MIME Sniffing | `X-Content-Type-Options: nosniff` header |
| Referrer Policy | `strict-origin-when-cross-origin` |
| Permissions Policy | Camera, microphone, geolocation disabled |

### 8.3 Security Headers (Frontend)

The Next.js frontend applies security headers to all routes:

```javascript
// next.config.js
async headers() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ],
  }];
}
```

---

## 9. Deployment Architecture

### 9.1 Deployment Pipeline

```
Developer Workstation
        │
        │  git push origin main
        ▼
┌───────────────────┐
│   GitHub           │
│   Repository       │
│   (main branch)    │
│   VashisthaP/      │
│   cxp_cases_       │
│   taxonomy         │
└───────┬────────────┘
        │
        │  Manual / deploy.sh
        ▼
┌───────────────────────────────────────────────────────────┐
│   PHASE 1: Infrastructure (Bicep)                          │
│   ┌─────────────────────────────────────────────────────┐ │
│   │  az deployment group create                          │ │
│   │  --template-file infra/main.bicep                    │ │
│   │  --parameters infra/main.bicepparam                  │ │
│   │                                                       │ │
│   │  Provisions: PostgreSQL + OpenAI + Functions +       │ │
│   │              Storage + App Insights + Log Analytics   │ │
│   └─────────────────────────────────────────────────────┘ │
└───────┬───────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│   PHASE 2: Backend Deployment                              │
│   ┌─────────────────────────────────────────────────────┐ │
│   │  cd backend                                          │ │
│   │  npm install && npm run build                        │ │
│   │  func azure functionapp publish <app-name>           │ │
│   │                                                       │ │
│   │  Deploys: 12 HTTP endpoints (4 handlers + CORS)      │ │
│   └─────────────────────────────────────────────────────┘ │
└───────┬───────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│   PHASE 3: Frontend Deployment                             │
│   ┌─────────────────────────────────────────────────────┐ │
│   │  cd frontend                                         │ │
│   │  NEXT_PUBLIC_API_URL=https://<api>.azurewebsites.net │ │
│   │  npm run build  (static export → ./out/)             │ │
│   │  swa deploy ./out                                    │ │
│   │                                                       │ │
│   │  Deploys: Static HTML/CSS/JS to Azure CDN            │ │
│   └─────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

### 9.2 Environment Configuration

| Environment | Database | AI Service | Frontend | Debug |
|-------------|----------|-----------|----------|-------|
| Development | Local PostgreSQL | Azure OpenAI (shared) | localhost:3000 | ON |
| Production | Azure PostgreSQL Flexible | Azure OpenAI (provisioned) | Azure Static Web Apps | OFF |

### 9.3 Azure Resource Naming Convention

| Resource Type | Pattern | Example |
|---------------|---------|---------|
| Resource Group | `{project}-{purpose}-rg` | `warroom-cxp-rg` |
| Function App | `{project}-api-{suffix}` | `warroom-api-46ljjh` |
| App Service Plan | `{project}-plan-{suffix}` | `warroom-plan-46ljjh` |
| PostgreSQL Server | `{project}-pg-{suffix}` | `warroom-pg-46ljjh` |
| Storage Account | `{project}st{suffix}` | `warroomst46ljjhhd` |
| Application Insights | `{project}-insights-{suffix}` | `warroom-insights-46ljjh` |
| Log Analytics | `{project}-logs-{suffix}` | `warroom-logs-46ljjh` |
| Azure OpenAI | `{project}-openai-{suffix}` | `warroom-openai-46ljjh` |
| Static Web App | `warroom-portal` | `warroom-portal` |

> The `{suffix}` is a unique hash generated by `uniqueString(resourceGroup().id, projectName)` in Bicep to ensure globally unique names.

### 9.4 Live Deployment Details

| Component | URL / Location |
|-----------|---------------|
| Frontend | `https://green-sky-059fc5900.1.azurestaticapps.net` |
| API Base URL | `https://warroom-api-46ljjh.azurewebsites.net/api` |
| Health Endpoint | `https://warroom-api-46ljjh.azurewebsites.net/api/health` |
| GitHub Repository | `https://github.com/VashisthaP/cxp_cases_taxonomy` |
| Subscription | `5303fadc-4a39-4010-a2b5-f0fbe150e733` |
| Tenant | `9329c02a-4050-4798-93ae-b6e37b19af6d` (Microsoft Field Led Sandbox) |
| Resource Group | `warroom-cxp-rg` (Central India) |

---

## 10. Non-Functional Requirements

### 10.1 Performance

| Metric | Target | Implementation |
|--------|--------|----------------|
| API Response (CRUD) | < 200ms | Connection pooling (max 10), singleton pool, B-tree indexes |
| Chat Response (RAG) | < 3s | HNSW index, top-10 retrieval, streaming (planned) |
| Form Validation | Instant | Client-side Zod validation (no server round-trip) |
| Search Query | < 500ms | GIN full-text index + ILIKE fallback |
| Dashboard Stats | < 1s | Parallel `Promise.all()` for 6 aggregation queries |
| Frontend Load | < 2s | Static export (CDN), code splitting, tree-shaking |

### 10.2 Availability & Scalability

| Component | Current | Scale Path |
|-----------|---------|------------|
| Azure Functions | Consumption (Y1, auto-scale) | Scale OUT automatically (0–200 instances) |
| PostgreSQL | B1ms (1 vCore, 2 GB) | Scale UP to GP D2s_v3 or MO tier |
| Storage | Standard LRS (3 copies) | Upgrade to GRS/ZRS for geo-redundancy |
| Static Web App | Free (CDN-distributed) | Upgrade to Standard for custom domains + auth |
| Azure OpenAI | 30K TPM per model | Increase quota or add additional deployments |

### 10.3 Backup & Recovery

| Component | Strategy |
|-----------|----------|
| Database | Azure-managed backup, 7-day retention, point-in-time restore |
| Blob Storage | LRS (3 copies within datacenter) |
| Application Code | GitHub repository (source of truth) |
| Infrastructure | Bicep templates (reproducible deployments) |
| Secrets | App Settings (regenerate from Azure Portal if needed) |

### 10.4 Resilience Patterns

| Pattern | Implementation | Scope |
|---------|---------------|-------|
| Retry with Exponential Backoff | `queryWithRetry()` – 3 attempts (1s → 2s → 4s) | Database |
| Retry with Retry-After | `generateEmbedding()` / `chatCompletion()` – 5 attempts | Azure OpenAI |
| Graceful Degradation | Embedding failures don't block case CRUD | AI Pipeline |
| 3-Tier Fallback | Vector → Text → Recent cases | RAG Chatbot |
| Client Retry | Axios interceptor – 3 attempts (1s → 2s → 4s) | Frontend HTTP |
| Connection Pooling | Singleton `pg.Pool` (max 10, 30s idle timeout) | Database |
| Cold Start Mitigation | Consumption plan with warm pool reuse | Azure Functions |

---

## 11. Technology Stack Summary

### 11.1 Backend

| Technology | Package | Version |
|-----------|---------|---------|
| Runtime | Node.js | 20+ |
| Language | TypeScript | 5.3+ |
| Functions Framework | @azure/functions | 4.4+ |
| Database Driver | pg (node-postgres) | 8.11+ |
| Vector Extension | pgvector | 0.1.8 |
| Validation | zod | 3.22+ |
| UUID Generation | uuid | 9.0+ |
| HTTP Client | Native fetch API | Built-in |

### 11.2 Frontend

| Technology | Package | Version |
|-----------|---------|---------|
| Framework | Next.js | 14.2+ |
| UI Library | React | 18.3+ |
| Component System | Shadcn UI (Radix UI) | Latest |
| Styling | Tailwind CSS | 3.4+ |
| Form Management | React Hook Form | 7.71+ |
| Validation | Zod | 3.22+ |
| HTTP Client | Axios | 1.6+ |
| Icons | Lucide React | 0.344+ |
| Markdown | react-markdown | 9.0+ |
| Dates | date-fns | 3.3+ |
| Class Utilities | clsx + tailwind-merge | 2.1+ / 2.2+ |
| Animations | tailwindcss-animate | 1.0+ |

### 11.3 Azure Services

| Service | SKU | Region |
|---------|-----|--------|
| Azure Functions | Consumption (Y1) | Central India |
| Azure Static Web Apps | Free | East Asia |
| Azure Database for PostgreSQL | Flexible, B1ms | Central India |
| Azure OpenAI | S0 | East US 2 |
| Azure Storage | StorageV2, Standard LRS | Central India |
| Azure Application Insights | Web | Central India |
| Azure Log Analytics | PerGB2018 | Central India |

### 11.4 DevOps & Infrastructure

| Tool | Purpose |
|------|---------|
| GitHub | Source code repository (`VashisthaP/cxp_cases_taxonomy`) |
| Bicep | Infrastructure as Code (Azure ARM) |
| Azure CLI | Resource provisioning & deployment commands |
| Azure Functions Core Tools | Local development & `func azure functionapp publish` |
| SWA CLI | Azure Static Web Apps deployment (`swa deploy`) |
| npm | Package management (backend + frontend) |
| TypeScript Compiler | Backend: CommonJS / Frontend: ESNext |

---

## 12. Cost Optimization Strategy

### 12.1 Overview

BC VM PCY - Case Taxonomy Insights is architected to minimize Azure costs while maintaining high availability during business hours. The design leverages serverless and consumption-based pricing models wherever possible.

### 12.2 Cost-Effective Architecture Choices

| Decision | Rationale | Monthly Savings |
|----------|-----------|-----------------|
| Azure Functions Consumption (Y1) | Pay-per-execution vs. dedicated App Service | ~$30-50/mo vs. B1 plan |
| Azure Static Web Apps (Free) | CDN-hosted static frontend, no server costs | ~$10-15/mo vs. App Service |
| PostgreSQL Burstable B1ms | Right-sized for 500-800 users, burstable on demand | ~$15/mo vs. GP D2s |
| Azure OpenAI Standard | Pay-per-token, no reserved capacity | Scale-to-zero when idle |
| Storage Standard LRS | Local redundancy sufficient for function runtime storage | ~$1/mo |

### 12.3 Estimated Monthly Cost

| Resource | SKU | Estimated Cost |
|----------|-----|---------------|
| Azure Functions | Consumption (Y1) | ~$5-15 (1M executions free/month) |
| PostgreSQL | B1ms (Burstable) | ~$25-30 |
| Azure OpenAI | S0 (GPT-4o + Embeddings) | ~$10-30 (token-based) |
| Static Web Apps | Free | $0 |
| Storage Account | Standard LRS | ~$1-2 |
| Application Insights | Per-GB ingestion | ~$2-5 |
| Log Analytics | PerGB2018 | ~$2-5 |
| **Total Estimated** | | **~$45-87/month** |

> Costs are estimates based on moderate usage (500-800 users, ~5,000 cases, ~1,000 chatbot queries/month).

### 12.4 Future Cost Optimization

| Optimization | Expected Savings | Complexity |
|-------------|-----------------|------------|
| PostgreSQL Serverless Tier | Auto-pause during inactivity | Low (config change) |
| Azure OpenAI PTU | Reserved capacity for predictable workloads | Medium |
| Embedding Caching | Cache frequently-queried embeddings | Medium |
| Response Caching | Redis Cache for dashboard stats | Medium |
| RBAC + Azure AD | Reduce unauthorized API calls | High |

---

## Appendix A: Project Repository Structure

```
cxp_cases_taxonomy/
├── docs/
│   └── Architecture_Solution_Document.md             # This document
├── frontend/                                         # Next.js 14+ Application
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx                            # Root layout
│   │   │   ├── page.tsx                              # Main dashboard page
│   │   │   └── globals.css                           # Global styles & themes
│   │   ├── components/
│   │   │   ├── ui/                                   # Shadcn UI primitives
│   │   │   ├── case-form.tsx                         # 15-field taxonomy form
│   │   │   ├── case-list.tsx                         # Paginated case list
│   │   │   └── chat-sidebar.tsx                      # Agentic chatbot
│   │   ├── lib/
│   │   │   ├── api.ts                                # Axios client with retry
│   │   │   ├── utils.ts                              # cn() utility
│   │   │   └── validation.ts                         # Zod schema
│   │   ├── types/
│   │   │   └── case.ts                               # TypeScript types & enums
│   │   └── hooks/
│   │       └── use-toast.ts                          # Toast notifications
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   └── tsconfig.json
├── backend/                                          # Azure Functions v4
│   ├── src/
│   │   ├── functions/
│   │   │   ├── cases.ts                              # CRUD operations
│   │   │   ├── chat.ts                               # RAG pipeline
│   │   │   ├── dashboard.ts                          # Statistics
│   │   │   └── health.ts                             # Health check
│   │   ├── database.ts                               # PostgreSQL + pgvector
│   │   └── openai.ts                                 # Azure OpenAI client
│   ├── host.json
│   ├── local.settings.json
│   ├── package.json
│   └── tsconfig.json
├── infra/                                            # Infrastructure as Code
│   ├── main.bicep                                    # Azure resources (Bicep)
│   └── main.bicepparam                               # Parameters file
├── deploy.sh                                         # 1-Click deployment script
├── .gitignore
└── README.md                                         # Project README
```

---

**End of Document (v1.0)**
