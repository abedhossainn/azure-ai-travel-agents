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

@description('Storage account name for persistent volumes')
param storageAccountName string = 'wagent${substring(uniqueString(resourceGroup().id), 0, 8)}'

@description('Log Analytics workspace name')
param logAnalyticsWorkspaceName string = 'travel-agent-logs-${uniqueString(resourceGroup().id)}'

// ACR login server URL
var acrLoginServer = '${acrName}.azurecr.io'

// Log Analytics Workspace for container logging
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsWorkspaceName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// Create Storage Account for persistent volumes
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
  }
}

// Create File Share for Open WebUI data
resource webuiFileShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01' = {
  name: '${storageAccountName}/default/webui-data'
  dependsOn: [
    storageAccount
  ]
  properties: {
    shareQuota: 5
  }
}

// Create File Share for Redis data
resource redisFileShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01' = {
  name: '${storageAccountName}/default/redis-data'
  dependsOn: [
    storageAccount
  ]
  properties: {
    shareQuota: 5
  }
}

// Create Container Instances - Container Group with all 3 services
resource containerGroup 'Microsoft.ContainerInstance/containerGroups@2023-05-01' = {
  name: containerGroupName
  location: location
  properties: {
    containers: [
      {
        name: 'redis'
        properties: {
          image: '${acrLoginServer}/redis:7-alpine'
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
            '--dir'
            '/data'
          ]
          volumeMounts: [
            {
              name: 'redis-data'
              mountPath: '/data'
            }
          ]
          livenessProbe: {
            exec: {
              command: [
                'redis-cli'
                'ping'
              ]
            }
            initialDelaySeconds: 15
            periodSeconds: 10
          }
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
              value: 'gemini-2.5-flash-lite'
            }
            {
              name: 'REDIS_URL'
              value: 'redis://localhost:6379'
            }
            {
              name: 'GOOGLE_GENAI_API_KEY'
              value: googleGenaiApiKey
            }
            {
              name: 'AMADEUS_CLIENT_ID'
              value: amadeusClientId
            }
            {
              name: 'AMADEUS_CLIENT_SECRET'
              value: amadeusClientSecret
            }
          ]
        }
      }
      {
        name: 'ui'
        properties: {
          image: '${acrLoginServer}/open-webui:main'
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
          volumeMounts: [
            {
              name: 'webui-data'
              mountPath: '/app/backend/data'
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
              value: 'true'
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
    volumes: [
      {
        name: 'webui-data'
        azureFile: {
          shareName: 'webui-data'
          storageAccountName: storageAccountName
          storageAccountKey: storageAccount.listKeys().keys[0].value
        }
      }
      {
        name: 'redis-data'
        azureFile: {
          shareName: 'redis-data'
          storageAccountName: storageAccountName
          storageAccountKey: storageAccount.listKeys().keys[0].value
        }
      }
    ]
    imageRegistryCredentials: [
      {
        server: acrLoginServer
        username: acrUsername
        password: acrPassword
      }
    ]
    diagnostics: {
      logAnalytics: {
        workspaceId: logAnalyticsWorkspace.properties.customerId
        workspaceKey: logAnalyticsWorkspace.listKeys().primarySharedKey
      }
    }
  }
  dependsOn: [
    webuiFileShare
    redisFileShare
  ]
}

// Outputs
output acrLoginServer string = acrLoginServer
output containerGroupName string = containerGroup.name
output containerGroupFqdn string = containerGroup.properties.ipAddress.fqdn
output apiUrl string = 'http://${containerGroup.properties.ipAddress.fqdn}:4000'
output uiUrl string = 'http://${containerGroup.properties.ipAddress.fqdn}:8080'
