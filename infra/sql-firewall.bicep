// Opens the SQL server to the API's own outbound addresses, one rule per address. A module because the list is only
// known once the API exists, and a loop in the main template must be sized at the start of the deployment.

@description('The SQL server the API reads and writes.')
param sqlServerName string

@description('Every address the API can call out from: the App Service plan\'s possibleOutboundIpAddresses.')
param apiOutboundIps array

resource sqlServer 'Microsoft.Sql/servers@2023-08-01-preview' existing = {
  name: sqlServerName
}

// Named after the address, so a redeploy with the same addresses changes nothing and a new address adds one rule.
resource apiRules 'Microsoft.Sql/servers/firewallRules@2023-08-01-preview' = [for ip in apiOutboundIps: {
  parent: sqlServer
  name: 'api-outbound-${replace(ip, '.', '-')}'
  properties: {
    startIpAddress: ip
    endIpAddress: ip
  }
}]
