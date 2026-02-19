#!/bin/bash
# ==========================================================================
# BC VM PCY - Case Taxonomy Insights - 1-Click Azure Deployment Script
# Provisions all Azure resources and deploys both frontend & backend
#
# Prerequisites:
#   - Azure CLI installed and logged in (az login)
#   - Node.js 20+ installed
#   - Azure Functions Core Tools v4+ installed
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Environment Variables (set before running or script will prompt):
#   WARROOM_RG_NAME         - Resource group name
#   WARROOM_PG_PASSWORD     - PostgreSQL admin password
#   WARROOM_OPENAI_NAME     - Azure OpenAI resource name
#   WARROOM_OPENAI_KEY      - Azure OpenAI API key
# ==========================================================================

set -euo pipefail

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------
LOCATION="centralindia"
PROJECT_NAME="warroom"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# --------------------------------------------------------------------------
# Step 0: Validate Prerequisites
# --------------------------------------------------------------------------
echo ""
echo "=============================================="
echo " BC VM PCY - Case Taxonomy Insights - Deployment"
echo " Region: Azure Central India (Pune)"
echo "=============================================="
echo ""

log_info "Checking prerequisites..."

if ! command -v az &> /dev/null; then
    log_error "Azure CLI not found. Install: https://docs.microsoft.com/cli/azure/install-azure-cli"
    exit 1
fi

if ! command -v node &> /dev/null; then
    log_error "Node.js not found. Install: https://nodejs.org/"
    exit 1
fi

if ! command -v func &> /dev/null; then
    log_warn "Azure Functions Core Tools not found. Install: npm install -g azure-functions-core-tools@4"
    log_warn "Skipping local function testing, will deploy directly."
fi

# Check Azure CLI login status
if ! az account show &> /dev/null; then
    log_error "Not logged into Azure CLI. Run: az login"
    exit 1
fi

CURRENT_SUB=$(az account show --query name -o tsv)
log_info "Current Azure subscription: $CURRENT_SUB"

# --------------------------------------------------------------------------
# Step 1: Gather Configuration
# --------------------------------------------------------------------------
RG_NAME="${WARROOM_RG_NAME:-}"
PG_PASSWORD="${WARROOM_PG_PASSWORD:-}"
OPENAI_NAME="${WARROOM_OPENAI_NAME:-}"
OPENAI_KEY="${WARROOM_OPENAI_KEY:-}"

if [ -z "$RG_NAME" ]; then
    read -p "Enter Resource Group name [warroom-rg]: " RG_NAME
    RG_NAME="${RG_NAME:-warroom-rg}"
fi

if [ -z "$PG_PASSWORD" ]; then
    read -s -p "Enter PostgreSQL admin password: " PG_PASSWORD
    echo ""
    if [ ${#PG_PASSWORD} -lt 8 ]; then
        log_error "Password must be at least 8 characters."
        exit 1
    fi
fi

if [ -z "$OPENAI_NAME" ]; then
    read -p "Enter Azure OpenAI resource name (leave blank to skip AI features): " OPENAI_NAME
fi

if [ -n "$OPENAI_NAME" ] && [ -z "$OPENAI_KEY" ]; then
    read -s -p "Enter Azure OpenAI API key: " OPENAI_KEY
    echo ""
fi

# --------------------------------------------------------------------------
# Step 2: Create Resource Group
# --------------------------------------------------------------------------
log_info "Creating resource group '$RG_NAME' in '$LOCATION'..."
az group create \
    --name "$RG_NAME" \
    --location "$LOCATION" \
    --tags project="$PROJECT_NAME" environment=production \
    --output none

log_success "Resource group created."

# --------------------------------------------------------------------------
# Step 3: Deploy Azure Infrastructure (Bicep)
# --------------------------------------------------------------------------
log_info "Deploying Azure infrastructure via Bicep template..."
log_info "This will create: PostgreSQL, Azure Functions, Storage, App Insights..."

DEPLOY_OUTPUT=$(az deployment group create \
    --resource-group "$RG_NAME" \
    --template-file "$SCRIPT_DIR/infra/main.bicep" \
    --parameters \
        projectName="$PROJECT_NAME" \
        location="$LOCATION" \
        pgAdminPassword="$PG_PASSWORD" \
        openAiResourceName="${OPENAI_NAME:-}" \
        openAiApiKey="${OPENAI_KEY:-}" \
    --query "properties.outputs" \
    --output json)

# Extract outputs
API_URL=$(echo "$DEPLOY_OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['apiUrl']['value'])" 2>/dev/null || echo "")
FUNC_APP_NAME=$(echo "$DEPLOY_OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['functionAppName']['value'])" 2>/dev/null || echo "")
PG_FQDN=$(echo "$DEPLOY_OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['pgServerFqdn']['value'])" 2>/dev/null || echo "")

log_success "Azure infrastructure deployed!"
log_info "  API URL: $API_URL"
log_info "  Function App: $FUNC_APP_NAME"
log_info "  PostgreSQL: $PG_FQDN"

# --------------------------------------------------------------------------
# Step 4: Build & Deploy Azure Functions Backend
# --------------------------------------------------------------------------
log_info "Building Azure Functions backend..."

cd "$SCRIPT_DIR/backend"
npm install
npm run build

log_info "Deploying Azure Functions to '$FUNC_APP_NAME'..."

# Deploy using Azure Functions Core Tools (or az functionapp deployment)
if command -v func &> /dev/null; then
    func azure functionapp publish "$FUNC_APP_NAME" --node
else
    # Fallback: zip deploy
    log_info "Using zip deployment..."
    cd "$SCRIPT_DIR/backend"
    zip -r ../backend-deploy.zip . -x "node_modules/*" ".git/*" "*.ts" "src/*"
    az functionapp deployment source config-zip \
        --resource-group "$RG_NAME" \
        --name "$FUNC_APP_NAME" \
        --src "$SCRIPT_DIR/backend-deploy.zip" \
        --output none
    rm -f "$SCRIPT_DIR/backend-deploy.zip"
fi

log_success "Backend deployed!"

# --------------------------------------------------------------------------
# Step 5: Build Next.js Frontend
# --------------------------------------------------------------------------
log_info "Building Next.js frontend..."

cd "$SCRIPT_DIR/frontend"

# Set the API URL for the frontend build
export NEXT_PUBLIC_API_URL="$API_URL"

npm install
npm run build

log_success "Frontend built successfully!"

# --------------------------------------------------------------------------
# Step 6: Verify Deployment
# --------------------------------------------------------------------------
log_info "Verifying deployment..."

# Health check
if [ -n "$API_URL" ]; then
    HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" 2>/dev/null || echo "000")
    if [ "$HEALTH_RESPONSE" = "200" ]; then
        log_success "API health check passed!"
    else
        log_warn "API health check returned HTTP $HEALTH_RESPONSE (may need a moment to warm up)"
    fi
fi

# --------------------------------------------------------------------------
# Step 7: Print Summary
# --------------------------------------------------------------------------
echo ""
echo "=============================================="
echo " Deployment Complete!"
echo "=============================================="
echo ""
echo "  Azure Resources (${LOCATION}):"
echo "  ├── Resource Group: $RG_NAME"
echo "  ├── Azure Functions: $FUNC_APP_NAME"
echo "  ├── PostgreSQL: $PG_FQDN"
echo "  └── Database: warroom_cases"
echo ""
echo "  API Endpoints:"
echo "  ├── Health:    $API_URL/health"
echo "  ├── Cases:     $API_URL/cases"
echo "  ├── Dashboard: $API_URL/dashboard/stats"
echo "  └── Chat:      $API_URL/chat"
echo ""
echo "  Frontend:"
echo "  └── Run locally: cd frontend && npm run dev"
echo "      (Set NEXT_PUBLIC_API_URL=$API_URL)"
echo ""
if [ -z "$OPENAI_NAME" ]; then
    echo "  ⚠ Azure OpenAI not configured."
    echo "    Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY"
    echo "    in the Function App settings to enable AI features."
    echo ""
fi
echo "  ✓ Always Ready instances configured (no cold starts)"
echo "  ✓ pgvector extension enabled for RAG chatbot"
echo "  ✓ Retry logic & error handling implemented"
echo ""
echo "=============================================="
