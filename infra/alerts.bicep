// Alerts for production, all on free features: an action group (email and Azure mobile app push are free up to 1,000
// a month) and Application Insights' Failure Anomalies rule (smart detection, no charge). No metric, log or
// availability alert rules: those are billed per rule per month. See docs/monitoring.md for how alerts are triaged.
// Deploy on its own (it changes nothing else):
//   az deployment group create -g rg-taperday -f infra/alerts.bicep -p insightsName=<appi-...> alertEmail=<you@example.com>

@description('The production Application Insights resource (appi-taperday-*).')
param insightsName string

@description('Where alerts are emailed. Kept out of the repository: pass it when you deploy.')
param alertEmail string

@description('The account you sign in to the Azure mobile app with, for push alerts. Empty for email only.')
param alertAppAccount string = ''

@description('Short name used in the action group name.')
param appName string = 'taperday'

resource insights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: insightsName
}

resource owner 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: 'ag-${appName}-owner'
  location: 'global'
  properties: {
    groupShortName: take(appName, 12)
    enabled: true
    emailReceivers: [
      { name: 'owner-email', emailAddress: alertEmail, useCommonAlertSchema: true }
    ]
    azureAppPushReceivers: empty(alertAppAccount) ? [] : [
      { name: 'owner-app', emailAddress: alertAppAccount }
    ]
  }
}

// Learns the normal failure rate of requests and dependency calls and fires within minutes of an unusual rise.
// Azure creates this rule automatically only for resources made in the portal, so Bicep has to declare it.
resource failureAnomalies 'Microsoft.AlertsManagement/smartDetectorAlertRules@2021-04-01' = {
  name: 'Failure Anomalies - ${insights.name}'
  location: 'global'
  properties: {
    description: 'An unusual rise in failed requests or dependency calls (smart detection, free).'
    state: 'Enabled'
    severity: 'Sev1'
    frequency: 'PT1M'
    detector: { id: 'FailureAnomaliesDetector' }
    scope: [insights.id]
    actionGroups: { groupIds: [owner.id] }
  }
}

output actionGroupId string = owner.id
