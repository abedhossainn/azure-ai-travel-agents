# Outputs
output "load_balancer_public_ip" {
  description = "Public IP address of the load balancer"
  value       = oci_load_balancer_load_balancer.travel_agent_lb.ip_address_details[0].ip_address
}

output "api_url" {
  description = "URL to access the API"
  value       = "http://${oci_load_balancer_load_balancer.travel_agent_lb.ip_address_details[0].ip_address}:${var.api_port}"
}

output "api_health_check_url" {
  description = "URL for API health check"
  value       = "http://${oci_load_balancer_load_balancer.travel_agent_lb.ip_address_details[0].ip_address}:${var.api_port}/api/health"
}

output "webui_url" {
  description = "URL to access the Open WebUI"
  value       = "http://${oci_load_balancer_load_balancer.travel_agent_lb.ip_address_details[0].ip_address}:3000"
}

output "redis_endpoint" {
  description = "Redis cache endpoint"
  value       = oci_ocache_cluster.redis_cluster.endpoint
}

output "redis_connection_string" {
  description = "Redis connection string for containers"
  value       = "redis://${oci_ocache_cluster.redis_cluster.endpoint}:6379"
  sensitive   = false
}

output "vcn_id" {
  description = "OCID of the VCN"
  value       = oci_core_vcn.travel_agent_vcn.id
}

output "subnet_id" {
  description = "OCID of the public subnet"
  value       = oci_core_subnet.public_subnet.id
}

output "api_instance_ids" {
  description = "OCIDs of API container instances"
  value       = [for inst in oci_container_instances_container_instance.api : inst.id]
}

output "api_instance_public_ips" {
  description = "Public IP addresses of API container instances"
  value       = [for inst in oci_container_instances_container_instance.api : inst.container_instance_hostname]
}

output "webui_instance_ids" {
  description = "OCIDs of WebUI container instances"
  value       = [for inst in oci_container_instances_container_instance.webui : inst.id]
}

output "webui_instance_public_ips" {
  description = "Public IP addresses of WebUI container instances"
  value       = [for inst in oci_container_instances_container_instance.webui : inst.container_instance_hostname]
}

output "load_balancer_id" {
  description = "OCID of the load balancer"
  value       = oci_load_balancer_load_balancer.travel_agent_lb.id
}

output "domain_name" {
  description = "Domain name mapped to load balancer (if configured)"
  value       = var.domain_name != "" ? "https://${var.domain_name}" : "Not configured"
}

output "ssl_certificate_status" {
  description = "SSL certificate configuration status"
  value       = var.certificate_subject_common_name != "" ? (var.use_self_signed_cert ? "Self-signed" : "OCI CA managed") : "Not configured"
}

output "cache_cluster_id" {
  description = "OCID of the OCI Cache cluster"
  value       = oci_ocache_cluster.redis_cluster.id
}

output "compartment_id" {
  description = "OCID of the compartment containing all resources"
  value       = var.compartment_ocid
}

output "region" {
  description = "OCI region where resources are deployed"
  value       = var.region
}

output "access_instructions" {
  description = "Instructions to access the application"
  value = <<-EOT
    ===== Travel Agent Deployment Complete =====

    API Access:
    - HTTP:  http://${oci_load_balancer_load_balancer.travel_agent_lb.ip_address_details[0].ip_address}:${var.api_port}
    - Health: http://${oci_load_balancer_load_balancer.travel_agent_lb.ip_address_details[0].ip_address}:${var.api_port}/api/health

    WebUI Access:
    - HTTP:  http://${oci_load_balancer_load_balancer.travel_agent_lb.ip_address_details[0].ip_address}:3000

    Redis Cache:
    - Endpoint: ${oci_ocache_cluster.redis_cluster.endpoint}:6379
    - Connection string: redis://${oci_ocache_cluster.redis_cluster.endpoint}:6379

    Domain (if configured):
    - API:   https://${var.domain_name != "" ? var.domain_name : "Not configured"}
    - WebUI: https://${var.domain_name != "" ? var.domain_name : "Not configured"}:3000

    Security Notes:
    - Secrets (API keys) are stored in OCI Vault and retrieved at runtime
    - All outbound traffic from containers requires egress rules
    - Load balancer handles SSL/TLS termination
  EOT
}
