@description('Name of the existing user-assigned managed identity to attach the federated credential to.')
param identityName string

@description('AKS cluster OIDC issuer URL (from aks.bicep output oidcIssuerUrl).')
param aksOidcIssuerUrl string

@description('Kubernetes namespace of the bot workload.')
param k8sNamespace string = 'azure-bot'

@description('Kubernetes ServiceAccount name annotated for workload identity.')
param k8sServiceAccountName string = 'azure-bot-workload-identity'

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: identityName
}

// Matches the architecture diagram: AKS OIDC issuer projects a Kubernetes
// service-account token, which Microsoft Entra ID trusts via this federated
// credential for the user-assigned managed identity. No client secret.
resource federatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: identity
  name: 'aks-federated-credential'
  properties: {
    issuer: aksOidcIssuerUrl
    subject: 'system:serviceaccount:${k8sNamespace}:${k8sServiceAccountName}'
    audiences: [
      'api://AzureADTokenExchange'
    ]
  }
}

output federatedCredentialName string = federatedCredential.name
