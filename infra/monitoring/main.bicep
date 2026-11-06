// Monitoring baseline for one Parenthesis environment (#86): two availability tests, three alert rules and the action
// group they notify. Deploy it into the environment's resource group; the Application Insights resource must already
// exist (docs/runbooks/azure-environments.md, step 2). Thresholds, costs and how to verify each alert are in
// docs/runbooks/application-insights-monitoring.md.
//
// Deploying this file creates billable Azure Monitor resources. Only deploy it with the owner's approval.
targetScope = 'resourceGroup'

@description('Environment short name, as used in resource names.')
@allowed([
  'dev'
  'prod'
])
param env string

@description('The site\'s public address without a trailing slash, for example https://dev.parenthesisfamily.com.')
param appUrl string

@description('Email address that receives alerts. Passed at deployment; never committed.')
param alertEmail string

@description('Existing Application Insights resource for this environment.')
param appInsightsName string = 'appi-parenthesis-${env}'

@description('Seconds between availability checks from each location. 900 is the longest Azure allows.')
@allowed([
  300
  600
  900
])
param testFrequencySeconds int = 900

@description('Availability test locations. Each extra location adds executions (cost) and keeps the app awake more.')
param testLocations array = [
  'us-tx-sn1-azr' // South Central US
]

@description('Application Insights location; the tests and alerts sit beside it.')
param location string = resourceGroup().location

// API 5xx share per 15 minutes before the error-rate alert fires (see the runbook for why these numbers).
var errorRateMinRequests = 20
var errorRatePercent = 5

resource appInsights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: appInsightsName
}

resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: 'ag-parenthesis-${env}'
  location: 'global'
  properties: {
    groupShortName: 'parenth-${env}'
    enabled: true
    emailReceivers: [
      {
        name: 'owner-email'
        emailAddress: alertEmail
        useCommonAlertSchema: true
      }
    ]
  }
}

// Each test passes only on a 200 with the expected text, so a proxy error page or empty response still fails.
var tests = [
  {
    key: 'frontend'
    title: 'Frontend'
    path: '/'
    contentMatch: '<app-root'
    description: 'The Angular app shell is not loading.'
  }
  {
    key: 'ready'
    title: 'Database readiness'
    path: '/health/ready'
    contentMatch: 'Healthy'
    description: 'The API cannot reach PostgreSQL (/health/ready is not 200 Healthy).'
  }
]

resource webTests 'Microsoft.Insights/webtests@2022-06-15' = [
  for test in tests: {
    name: 'webtest-parenthesis-${env}-${test.key}'
    location: location
    tags: {
      'hidden-link:${appInsights.id}': 'Resource'
    }
    kind: 'standard'
    properties: {
      SyntheticMonitorId: 'webtest-parenthesis-${env}-${test.key}'
      Name: '${toUpper(env)} · Parenthesis · ${test.title}'
      Description: test.description
      Enabled: true
      Kind: 'standard'
      Frequency: testFrequencySeconds
      // Scale-to-zero cold starts can take a while; allow the longest timeout and one retry before a failure counts.
      Timeout: 120
      RetryEnabled: true
      Locations: [for id in testLocations: { Id: id }]
      Request: {
        RequestUrl: '${appUrl}${test.path}'
        HttpVerb: 'GET'
        ParseDependentRequests: false
      }
      ValidationRules: {
        ExpectedHttpStatusCode: 200
        SSLCheck: true
        SSLCertRemainingLifetimeCheck: 7
        ContentValidation: {
          ContentMatch: test.contentMatch
          IgnoreCase: true
          PassIfTextFound: true
        }
      }
    }
  }
]

resource availabilityAlerts 'Microsoft.Insights/metricAlerts@2018-03-01' = [
  for (test, i) in tests: {
    name: 'alert-parenthesis-${env}-${test.key}-unavailable'
    location: 'global'
    properties: {
      description: '${test.description} Every test location failed.'
      severity: 1
      enabled: true
      scopes: [
        webTests[i].id
        appInsights.id
      ]
      evaluationFrequency: 'PT5M'
      windowSize: 'PT15M'
      criteria: {
        'odata.type': 'Microsoft.Azure.Monitor.WebtestLocationAvailabilityCriteria'
        webTestId: webTests[i].id
        componentId: appInsights.id
        failedLocationCount: length(testLocations)
      }
      autoMitigate: true
      actions: [
        {
          actionGroupId: actionGroup.id
        }
      ]
    }
  }
]

resource errorRateAlert 'Microsoft.Insights/scheduledQueryRules@2023-12-01' = {
  name: 'alert-parenthesis-${env}-api-error-rate'
  location: location
  properties: {
    displayName: '${toUpper(env)} · Parenthesis · API error rate'
    description: 'At least ${errorRatePercent}% of API requests returned 5xx in 15 minutes (minimum ${errorRateMinRequests} requests; health checks excluded).'
    severity: 2
    enabled: true
    scopes: [
      appInsights.id
    ]
    evaluationFrequency: 'PT15M'
    windowSize: 'PT15M'
    criteria: {
      allOf: [
        {
          // 4xx are excluded on purpose: signed-out 401s and validation 400s are normal traffic, not outages.
          // Multi-line strings can't interpolate, so the thresholds are substituted below.
          query: replace(replace('''
requests
| where url !contains "/health/"
| summarize total = sum(itemCount), failed = sumif(itemCount, toint(resultCode) >= 500)
| extend failurePercent = iff(total == 0, 0.0, 100.0 * failed / total)
| where total >= MIN_REQUESTS and failurePercent >= MIN_PERCENT
''', 'MIN_REQUESTS', string(errorRateMinRequests)), 'MIN_PERCENT', string(errorRatePercent))
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    autoMitigate: true
    actions: {
      actionGroups: [
        actionGroup.id
      ]
    }
  }
}

output actionGroupId string = actionGroup.id
output webTestNames array = [for (test, i) in tests: webTests[i].name]
