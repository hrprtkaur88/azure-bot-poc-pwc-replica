param location string = 'global'
param namePrefix string
param botEndpoint string
param userAssignedIdentityClientId string
param userAssignedIdentityResourceId string
param tenantId string

resource bot 'Microsoft.BotService/botServices@2022-09-15' = {
  name: '${namePrefix}-bot'
  location: location
  kind: 'azurebot'
  sku: {
    name: 'F0'
  }
  properties: {
    displayName: '${namePrefix}-azure-bot'
    endpoint: botEndpoint
    msaAppType: 'UserAssignedMSI'
    msaAppId: userAssignedIdentityClientId
    msaAppTenantId: tenantId
    msaAppMSIResourceId: userAssignedIdentityResourceId
    publicNetworkAccess: 'Enabled'
    isCmekEnabled: false
  }
}

output botName string = bot.name
output messagingEndpoint string = bot.properties.endpoint
