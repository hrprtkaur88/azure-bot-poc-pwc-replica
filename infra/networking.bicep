param location string
param namePrefix string

resource vnet 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: '${namePrefix}-vnet'
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.50.0.0/16'
      ]
    }
    subnets: [
      {
        name: 'aks'
        properties: {
          addressPrefix: '10.50.0.0/22'
        }
      }
    ]
  }
}

output aksSubnetResourceId string = vnet.properties.subnets[0].id
