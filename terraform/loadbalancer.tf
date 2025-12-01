# Load Balancer Configuration - Simplified
# For initial MVP deployment, container instances are accessed directly via their public IPs
# Load Balancer can be added in production phase

output "api_deployment_note" {
  value = "API Container Instance is accessible directly via its public IP on port 4000"
}

output "webui_deployment_note" {
  value = "WebUI Container Instance is accessible directly via its public IP on port 8080"
}
