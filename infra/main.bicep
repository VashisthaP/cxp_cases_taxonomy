// ==========================================================================
// War Room Case Taxonomy Portal - Azure Bicep Deployment Template
// Resources:
//   1. Azure Database for PostgreSQL (Flexible Server) with pgvector
//   2. Azure Functions (Consumption) - Node.js backend
//   3. Azure OpenAI (GPT-4o + text-embedding-ada-002) - provisioned
//   4. Azure Storage Account (Functions runtime storage)
//   5. Application Insights (monitoring)
//   6. Log Analytics Workspace
// ==========================================================================

// --------------------------------------------------------------------------
// Parameters
// --------------------------------------------------------------------------

@description('The name prefix for all resources.')
@minLength(3)
@maxLength(20)
param projectName string = 'warroom'

@description('Primary Azure region for compute/database resources.')
param location string = 'centralindia'

@description('Azure OpenAI region (GPT-4o availability). Use eastus2, swedencentral, etc.')
param openAiLocation string = 'eastus2'

@description('PostgreSQL administrator username.')
param pgAdminUser string = 'warroom_admin'

@description('PostgreSQL administrator password.')
@secure()
param pgAdminPassword string

@description('SKU for PostgreSQL Flexible Server.')
@allowed(['Standard_B1ms', 'Standard_B2s', 'Standard_D2s_v3'])
param pgSkuName string = 'Standard_B1ms'

@description('PostgreSQL storage size in GB.')
param pgStorageGB int = 32

@description('Environment tag.')
@allowed(['dev', 'staging', 'production'])
param environment string = 'production'

// --------------------------------------------------------------------------
// Variables
// --------------------------------------------------------------------------

var uniqueSuffix = uniqueString(resourceGroup().id, projectName)
var storageAccountName = toLower('${take(projectName, 8)}st${take(uniqueSuffix, 8)}')
var functionAppName = '${projectName}-api-${take(uniqueSuffix, 6)}'
var appServicePlanName = '${projectName}-plan-${take(uniqueSuffix, 6)}'
var appInsightsName = '${projectName}-insights-${take(uniqueSuffix, 6)}'
var logAnalyticsName = '${projectName}-logs-${take(uniqueSuffix, 6)}'
var pgServerName = '${projectName}-pg-${take(uniqueSuffix, 6)}'
var pgDatabaseName = 'warroom_cases'
var openAiName = '${projectName}-openai-${take(uniqueSuffix, 6)}'

// --------------------------------------------------------------------------
// Resource: Log Analytics Workspace
// --------------------------------------------------------------------------
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: location
  tags: {
    project: projectName
    environment: environment
  }
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// --------------------------------------------------------------------------
// Resource: Application Insights
// --------------------------------------------------------------------------
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  tags: {
    project: projectName
    environment: environment
  }
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// --------------------------------------------------------------------------
// Resource: Storage Account (Azure Functions runtime)
// SFI Compliance: HTTPS-only, TLS 1.2, no blob public access,
//   disable shared key access (use Entra ID auth in production)
// --------------------------------------------------------------------------
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  tags: {
    project: projectName
    environment: environment
  }
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    // SFI: Disable shared key access — forces Entra ID (AAD) authN
    // NOTE: Azure Functions Consumption plan requires shared key for AzureWebJobsStorage.
    // Set to true only when using Managed Identity binding for Functions storage.
    allowSharedKeyAccess: true
    defaultToOAuthAuthentication: true
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

// --------------------------------------------------------------------------
// Resource: Azure OpenAI (Cognitive Services)
// Deployed in a region that supports GPT-4o and embeddings
// SFI Compliance: Disable local auth (use Entra ID / managed identity)
// --------------------------------------------------------------------------
resource openAi 'Microsoft.CognitiveServices/accounts@2024-04-01-preview' = {
  name: openAiName
  location: openAiLocation
  tags: {
    project: projectName
    environment: environment
  }
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: openAiName
    publicNetworkAccess: 'Enabled'
    // SFI: Disable local API key auth — use Managed Identity in production
    // NOTE: Currently using API key in Function App settings; set to true
    // and switch to DefaultAzureCredential when Managed Identity is configured.
    disableLocalAuth: false
  }
}

// GPT-4o deployment for chat completions
resource gpt4oDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-04-01-preview' = {
  parent: openAi
  name: 'gpt-4o'
  sku: {
    name: 'Standard'
    capacity: 30
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4o'
      version: '2024-08-06'
    }
  }
}

// text-embedding-ada-002 deployment for vector embeddings
resource embeddingDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-04-01-preview' = {
  parent: openAi
  name: 'text-embedding-ada-002'
  dependsOn: [gpt4oDeployment]
  sku: {
    name: 'Standard'
    capacity: 30
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'text-embedding-ada-002'
      version: '2'
    }
  }
}

// --------------------------------------------------------------------------
// Resource: Azure Database for PostgreSQL (Flexible Server)
// Configured with pgvector extension for RAG chatbot embeddings
// SFI Compliance: SSL enforced via PGSSLMODE=require in app settings
// --------------------------------------------------------------------------
resource pgServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-03-01-preview' = {
  name: pgServerName
  location: location
  tags: {
    project: projectName
    environment: environment
  }
  sku: {
    name: pgSkuName
    tier: contains(pgSkuName, 'Standard_B') ? 'Burstable' : 'GeneralPurpose'
  }
  properties: {
    version: '16'
    administratorLogin: pgAdminUser
    administratorLoginPassword: pgAdminPassword
    storage: {
      storageSizeGB: pgStorageGB
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
  }
}

// PostgreSQL Database
resource pgDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-03-01-preview' = {
  parent: pgServer
  name: pgDatabaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// Enable pgvector extension on the PostgreSQL server
resource pgVectorExtension 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2023-03-01-preview' = {
  parent: pgServer
  name: 'azure.extensions'
  properties: {
    value: 'VECTOR'
    source: 'user-override'
  }
}

// Allow Azure services to access PostgreSQL
resource pgFirewallAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-03-01-preview' = {
  parent: pgServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// --------------------------------------------------------------------------
// Resource: App Service Plan (Consumption - Y1 Dynamic)
// --------------------------------------------------------------------------
resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: appServicePlanName
  location: location
  tags: {
    project: projectName
    environment: environment
  }
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  kind: 'functionapp'
  properties: {
    reserved: true // Linux
  }
}

// --------------------------------------------------------------------------
// Resource: Azure Functions App (Node.js backend)
// SFI Compliance: HTTPS-only, Linux, TLS 1.2 via App Service defaults
// --------------------------------------------------------------------------
resource functionApp 'Microsoft.Web/sites@2023-01-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  tags: {
    project: projectName
    environment: environment
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'Node|20'
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net'
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~20'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        // PostgreSQL connection settings
        {
          name: 'PGHOST'
          value: pgServer.properties.fullyQualifiedDomainName
        }
        {
          name: 'PGPORT'
          value: '5432'
        }
        {
          name: 'PGUSER'
          value: pgAdminUser
        }
        {
          name: 'PGPASSWORD'
          value: pgAdminPassword
        }
        {
          name: 'PGDATABASE'
          value: pgDatabaseName
        }
        {
          name: 'PGSSLMODE'
          value: 'require'
        }
        // Azure OpenAI configuration (auto-populated from provisioned resource)
        {
          name: 'AZURE_OPENAI_ENDPOINT'
          value: openAi.properties.endpoint
        }
        {
          name: 'AZURE_OPENAI_API_KEY'
          value: openAi.listKeys().key1
        }
        {
          name: 'AZURE_OPENAI_DEPLOYMENT_NAME'
          value: 'gpt-4o'
        }
        {
          name: 'AZURE_OPENAI_EMBEDDING_DEPLOYMENT'
          value: 'text-embedding-ada-002'
        }
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
      ]
      cors: {
        allowedOrigins: [
          'http://localhost:3000'
          'https://${functionAppName}.azurewebsites.net'
          '*'
        ]
        supportCredentials: false
      }
    }
  }
}

// --------------------------------------------------------------------------
// Outputs
// --------------------------------------------------------------------------

@description('Azure Functions API base URL')
output apiUrl string = 'https://${functionApp.properties.defaultHostName}/api'

@description('PostgreSQL server FQDN')
output pgServerFqdn string = pgServer.properties.fullyQualifiedDomainName

@description('PostgreSQL database name')
output pgDatabaseName string = pgDatabaseName

@description('Application Insights connection string')
output appInsightsConnectionString string = appInsights.properties.ConnectionString

@description('Function App name')
output functionAppName string = functionApp.name

@description('Storage Account name')
output storageAccountName string = storageAccount.name

@description('Azure OpenAI endpoint')
output openAiEndpoint string = openAi.properties.endpoint

@description('Azure OpenAI resource name')
output openAiResourceName string = openAi.name
