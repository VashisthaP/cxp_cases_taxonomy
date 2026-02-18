// ==========================================================================
// Bicep Parameters File - Production Deployment
// ==========================================================================

using './main.bicep'

param projectName = 'warroom'
param location = 'centralindia'
param openAiLocation = 'eastus2'
param pgAdminUser = 'warroom_admin'
// param pgAdminPassword = '' // Set via CLI: --parameters pgAdminPassword='...'
param pgSkuName = 'Standard_B1ms'
param pgStorageGB = 32
param environment = 'production'
