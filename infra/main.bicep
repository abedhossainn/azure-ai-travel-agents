// Bicep template for Azure Travel Agent deployment
// Deploys: Container Instances (API, WebUI, Redis) using existing ACR and Key Vault

@minLength(5)
@maxLength(50)
param acrName string = 'travelagentacr13864'

@minLength(1)
@maxLength(64)
param containerGroupName string = 'travel-agent-container-group'

param location string = resourceGroup().location

param keyVaultName string = 'AITravelAgent'

param keyVaultResourceGroup string = 'AzureAiTravelAgent'

param apiImageName string = 'travel-agent-api'

param apiImageTag string = 'latest'

param containerGroupDnsNameLabel string = 'travel-agent-${uniqueString(resourceGroup().id)}'

var redisContainerName = 'redis'
var apiContainerName = 'api'
var uiContainerName = 'ui'

// Get reference to existing Azure Container Registry
resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: acrName
}

// Get reference to Key Vault (assumes it exists)
resource keyVault 'Microsoft.KeyVault/vaults@2024-04-01-preview' existing = {
  name: keyVaultName
  scope: resourceGroup(keyVaultResourceGroup)
}

// Create Container Instances - Container Group with all 3 services
resource containerGroup 'Microsoft.ContainerInstance/containerGroups@2023-12-01-preview' = {
  name: containerGroupName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    containers: [
      {
        name: redisContainerName
        properties: {
          image: 'redis:7-alpine'
          resources: {
            requests: {
              cpu: 0.5
              memoryInGb: 0.5
            }
          }
          ports: [
            {
              port: 6379
              protocol: 'TCP'
            }
          ]
          command: [
            'redis-server'
            '--appendonly'
            'yes'
            '--maxmemory'
            '256mb'
            '--maxmemory-policy'
            'allkeys-lru'
          ]
          environmentVariables: []
          volumeMounts: []
        }
      }
      {
        name: apiContainerName
        properties: {
          image: '${acr.properties.loginServer}/${apiImageName}:${apiImageTag}'
          resources: {
            requests: {
              cpu: 1.0
              memoryInGb: 1.5
            }
          }
          ports: [
            {
              port: 4000
              protocol: 'TCP'
            }
          ]
          environmentVariables: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'LLM_PROVIDER'
              value: 'gemini'
            }
            {
              name: 'MODEL'
              value: 'gemini-2.0-flash-lite'
            }
            {
              name: 'REDIS_URL'
              value: 'redis://localhost:6379'
            }
            {
              name: 'GOOGLE_GENAI_API_KEY'
              secureValue: keyVault.getSecret('GOOGLE-GENAI-API-KEY')
            }
            {
              name: 'AMADEUS_CLIENT_ID'
              secureValue: keyVault.getSecret('AMADEUS-CLIENT-ID')
            }
            {
              name: 'AMADEUS_CLIENT_SECRET'
              secureValue: keyVault.getSecret('AMADEUS-CLIENT-SECRET')
            }
          ]
          volumeMounts: []
        }
      }
      {
        name: uiContainerName
        properties: {
          image: 'ghcr.io/open-webui/open-webui:main'
          resources: {
            requests: {
              cpu: 0.5
              memoryInGb: 0.5
            }
          }
          ports: [
            {
              port: 8080
              protocol: 'TCP'
            }
          ]
          environmentVariables: [
            {
              name: 'OPENAI_API_BASE_URL'
              value: 'http://localhost:4000/v1'
            }
            {
              name: 'OPENAI_API_KEY'
              value: 'sk-dummy'
            }
            {
              name: 'WEBUI_NAME'
              value: 'Travel Agent'
            }
            {
              name: 'WEBUI_URL'
              value: 'http://localhost:3000'
            }
            {
              name: 'WEBUI_AUTH'
              value: 'false'
            }
          ]
          volumeMounts: []
        }
      }
    ]
    osType: 'Linux'
    restartPolicy: 'Always'
    ipAddress: {
      type: 'Public'
      dnsNameLabel: containerGroupDnsNameLabel
      ports: [
        {
          port: 4000
          protocol: 'TCP'
        }
        {
          port: 8080
          protocol: 'TCP'
        }
      ]
    }
    imageRegistryCredentials: [
      {
        server: acr.properties.loginServer
        username: acr.listCredentials().username
        password: acr.listCredentials().passwords[0].value
      }
    ]
  }
}

// Grant container group managed identity access to Key Vault
resource keyVaultAccessPolicy 'Microsoft.KeyVault/vaults/accessPolicies@2024-04-01-preview' = {
  name: 'add'
  parent: keyVault
  properties: {
    accessPolicies: [
      {
        tenantId: subscription().tenantId
        objectId: containerGroup.identity.principalId
        permissions: {
          secrets: [
            'get'
            'list'
          ]
        }
      }
    ]
  }
}

// Outputs
output acrLoginServer string = acr.properties.loginServer
output acrName string = acr.name
output containerGroupName string = containerGroup.name
output containerGroupFqdn string = containerGroup.properties.ipAddress.fqdn
output apiUrl string = 'http://${containerGroup.properties.ipAddress.fqdn}:4000'
output uiUrl string = 'http://${containerGroup.properties.ipAddress.fqdn}:8080'
