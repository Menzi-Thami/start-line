// Taperday: everything the app runs on, in one resource group.
// Basic SQL is the paid production default (5 DTUs, 2 GiB); App Service and Static Web Apps stay on their free tiers.
// New test environments can explicitly choose databaseTier=free. Upgrade apiSku separately when needed.
targetScope = 'resourceGroup'

@description('Region for the API, database and monitoring. South Africa North keeps them close to runners.')
param location string = 'southafricanorth'

@description('Static Web Apps only runs in a few regions; content is served worldwide either way. West Europe was refusing new customers (Oct 2026).')
param staticWebAppLocation string = 'eastus2'

@description('Domain the website runs on (added to the Static Web App by hand, DNS at the registrar). Empty if none.')
param webDomain string = 'taperday.run'

@description('Short name used in every resource name.')
@maxLength(12)
param appName string = 'taperday'

@description('F1 is free (sleeps when idle, 60 CPU minutes a day). B1 is about $13/month and always on.')
@allowed(['F1', 'B1'])
param apiSku string = 'F1'

@description('basic = paid SQL Database, 5 DTUs and 2 GiB. free = explicit opt-in for a suitable new environment; pauses when its monthly allowance runs out.')
@allowed(['free', 'basic'])
param databaseTier string = 'basic'

@description('Who administers the database: your Entra sign-in name (email). The only admin; passwords are switched off.')
param sqlAdminLogin string

@description('Object ID of that same account (az ad signed-in-user show --query id).')
param sqlAdminObjectId string

@description('External ID sign-in for the API. Leave empty to deploy with accounts switched off.')
param externalIdInstance string = ''
param externalIdTenantId string = ''
param externalIdApiClientId string = ''

var suffix = take(uniqueString(resourceGroup().id), 6)
var names = {
  logs: 'log-${appName}-${suffix}'
  insights: 'appi-${appName}-${suffix}'
  sqlServer: 'sql-${appName}-${suffix}'
  database: 'sqldb-${appName}'
  plan: 'asp-${appName}-${suffix}'
  api: 'app-${appName}-api-${suffix}'
  web: 'swa-${appName}-${suffix}'
  vault: 'kv-${appName}-${suffix}'
}

// ---------- Monitoring: capped so a logging bug can never run up a bill ----------
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: names.logs
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    // 0.15 GB/day x 31 days stays under the 5 GB/month free allowance, so logging can never cost money.
    workspaceCapping: { dailyQuotaGb: json('0.15') }
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: names.insights
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
  }
}

// ---------- Database: Entra-only sign-in, no SQL passwords exist ----------
resource sqlServer 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: names.sqlServer
  location: location
  properties: {
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    administrators: {
      administratorType: 'ActiveDirectory'
      azureADOnlyAuthentication: true
      login: sqlAdminLogin
      sid: sqlAdminObjectId
      tenantId: subscription().tenantId
      principalType: 'User'
    }
  }
}

// Lets Azure services (the API) reach the server. The free App Service tier has no private networking.
resource allowAzure 'Microsoft.Sql/servers/firewallRules@2023-08-01-preview' = {
  parent: sqlServer
  name: 'AllowAllWindowsAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource database 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  parent: sqlServer
  name: names.database
  location: location
  sku: databaseTier == 'free'
    ? { name: 'GP_S_Gen5', tier: 'GeneralPurpose', family: 'Gen5', capacity: 2 }
    : { name: 'Basic', tier: 'Basic', capacity: 5 }
  properties: databaseTier == 'free'
    ? {
        useFreeLimit: true
        // AutoPause, never BillOverUsage: the free database must not be able to start costing money.
        freeLimitExhaustionBehavior: 'AutoPause'
        autoPauseDelay: 60
        minCapacity: json('0.5')
        maxSizeBytes: 34359738368
        requestedBackupStorageRedundancy: 'Local'
        zoneRedundant: false
      }
    : {
        useFreeLimit: false
        maxSizeBytes: 2147483648
        requestedBackupStorageRedundancy: 'Local'
        zoneRedundant: false
      }
}

// ---------- Front end ----------
resource web 'Microsoft.Web/staticSites@2023-12-01' = {
  name: names.web
  location: staticWebAppLocation
  sku: { name: 'Free', tier: 'Free' }
  properties: {}
}

// ---------- API ----------
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: names.plan
  location: location
  kind: 'linux'
  sku: { name: apiSku }
  properties: { reserved: true }
}

// ---------- Key Vault: one key that wraps the Data Protection key ring (which encrypts Strava tokens) ----------
// Software keys have no monthly fee; each wrap/unwrap is a fraction of a cent, and the API only unwraps at startup.
resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: names.vault
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    enablePurgeProtection: true
  }
}

resource tokenKey 'Microsoft.KeyVault/vaults/keys@2023-07-01' = {
  parent: vault
  name: 'data-protection'
  properties: {
    kty: 'RSA'
    keySize: 2048
    keyOps: ['wrapKey', 'unwrapKey']
  }
}

// Key Vault Crypto User: wrap and unwrap with the key, nothing else (no reading secrets, no managing the vault).
var keyVaultCryptoUser = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '12338af0-0e69-4776-bea7-57ae8d297424')

resource apiCanUseKey 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, api.id, keyVaultCryptoUser)
  scope: vault
  properties: {
    roleDefinitionId: keyVaultCryptoUser
    principalId: api.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

var accountsOn = !empty(externalIdApiClientId)
var baseSettings = [
  { name: 'ASPNETCORE_ENVIRONMENT', value: 'Production' }
  // App Service's front end forwards the real client IP; without this every runner shares one rate-limit bucket.
  { name: 'ASPNETCORE_FORWARDEDHEADERS_ENABLED', value: 'true' }
  {
    name: 'ConnectionStrings__StartLine'
    // No password: the API signs in to SQL with its own managed identity.
    value: 'Server=tcp:${sqlServer.properties.fullyQualifiedDomainName},1433;Database=${names.database};Authentication=Active Directory Managed Identity;Encrypt=True;TrustServerCertificate=False;Connect Timeout=90;'
  }
  { name: 'Cors__AllowedOrigins__0', value: 'https://${web.properties.defaultHostname}' }
  { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
]
// The website answers on its own domain and its www too; the API has to accept calls from all of them.
var domainCorsSettings = empty(webDomain)
  ? []
  : [
      { name: 'Cors__AllowedOrigins__1', value: 'https://${webDomain}' }
      { name: 'Cors__AllowedOrigins__2', value: 'https://www.${webDomain}' }
    ]
var identitySettings = accountsOn
  ? [
      { name: 'AzureAd__Instance', value: externalIdInstance }
      { name: 'AzureAd__TenantId', value: externalIdTenantId }
      { name: 'AzureAd__ClientId', value: externalIdApiClientId }
    ]
  : []

resource api 'Microsoft.Web/sites@2023-12-01' = {
  name: names.api
  location: location
  kind: 'app,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    clientAffinityEnabled: false
    siteConfig: {
      linuxFxVersion: 'DOTNETCORE|10.0'
      appCommandLine: 'dotnet StartLine.API.dll'
      alwaysOn: apiSku != 'F1'
      // Health probes hit /health/live only: /health/ready touches the database and would stop it ever pausing.
      healthCheckPath: apiSku != 'F1' ? '/health/live' : null
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
      appSettings: concat(baseSettings, domainCorsSettings, identitySettings, [
        // Versionless, so a rotated key is picked up. Strava sync refuses to start outside development without it.
        { name: 'DataProtection__KeyVaultKeyUri', value: tokenKey.properties.keyUri }
      ])
    }
  }
}

output apiName string = api.name
output apiUrl string = 'https://${api.properties.defaultHostName}'
output apiPrincipalId string = api.identity.principalId
output webName string = web.name
output webUrl string = 'https://${web.properties.defaultHostname}'
output sqlServerName string = sqlServer.name
output sqlServerHost string = sqlServer.properties.fullyQualifiedDomainName
output databaseName string = names.database
