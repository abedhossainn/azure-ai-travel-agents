# Load Balancer Configuration - Simplified
# For initial MVP deployment, container instances are accessed directly via their public IPs
# Load Balancer can be added in production phase

output "api_deployment_note" {
  value = "API Container Instance is accessible directly via its public IP on port ${var.api_port}"
  description = "Access the API health check at: http://<container_public_ip>:${var.api_port}/api/health"
}

output "webui_deployment_note" {
  value = "WebUI Container Instance is accessible directly via its public IP on port 8080"
  description = "Access the Web UI at: http://<container_public_ip>:8080"
}
