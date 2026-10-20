param location string
param namePrefix string
param workspaceResourceId string

resource appi 'Microsoft.Insights/components@2020-02-02' = {
  name: '${namePrefix}-appi'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspaceResourceId
  }
}

output applicationInsightsName string = appi.name
output connectionString string = appi.properties.ConnectionString
