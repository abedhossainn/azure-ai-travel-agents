// Bicep template for Azure Travel Agent deployment
// Deploys: Container Instances (API, WebUI, Redis) using existing ACR

@description('Name of the Azure Container Registry')
param acrName string = 'travelagentacr13864'

@description('Name for the container group')
param containerGroupName string = 'travel-agent-container-group'

@description('Location for all resources')
param location string = resourceGroup().location

@description('API image name in ACR')
param apiImageName string = 'travel-agent-api'

@description('API image tag')
param apiImageTag string = 'latest'

@description('ACR username for authentication')
@secure()
param acrUsername string

@description('ACR password for authentication')
@secure()
param acrPassword string

@description('DNS name label for the container group')
param containerGroupDnsNameLabel string = 'travel-agent-${uniqueString(resourceGroup().id)}'

@description('Google Gemini API Key')
@secure()
param googleGenaiApiKey string = ''

@description('Amadeus Client ID')
@secure()
param amadeusClientId string = ''

@description('Amadeus Client Secret')
@secure()
param amadeusClientSecret string = ''

// ACR login server URL
var acrLoginServer = '${acrName}.azurecr.io'

// Create Container Instances - Container Group with all 3 services
resource containerGroup 'Microsoft.ContainerInstance/containerGroups@2023-05-01' = {
  name: containerGroupName
  location: location
  properties: {
    containers: [
      {
        name: 'redis'
        properties: {
          image: 'redis:7-alpine'
          resources: {
            requests: {
              cpu: 1
              memoryInGB: 1
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
        }
      }
      {
        name: 'api'
        properties: {
          image: '${acrLoginServer}/${apiImageName}:${apiImageTag}'
          resources: {
            requests: {
              cpu: 1
              memoryInGB: 2
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
              secureValue: googleGenaiApiKey
            }
            {
              name: 'AMADEUS_CLIENT_ID'
              secureValue: amadeusClientId
            }
            {
              name: 'AMADEUS_CLIENT_SECRET'
              secureValue: amadeusClientSecret
            }
          ]
        }
      }
      {
        name: 'ui'
        properties: {
          image: 'ghcr.io/open-webui/open-webui:main'
          resources: {
            requests: {
              cpu: 1
              memoryInGB: 1
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
        server: acrLoginServer
        username: acrUsername
        password: acrPassword
      }
    ]
  }
}

// Outputs
output acrLoginServer string = acrLoginServer
output containerGroupName string = containerGroup.name
output containerGroupFqdn string = containerGroup.properties.ipAddress.fqdn
output apiUrl string = 'http://${containerGroup.properties.ipAddress.fqdn}:4000'
output uiUrl string = 'http://${containerGroup.properties.ipAddress.fqdn}:8080'
