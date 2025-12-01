# Outputs - Container Public IPs
output "api_instance_public_ips" {
  description = "Public IP addresses of API container instances"
  value       = [for inst in oci_container_instances_container_instance.api : inst.vnics[0].public_ip_address]
}

output "api_urls" {
  description = "URLs to access the API instances"
  value       = [for inst in oci_container_instances_container_instance.api : "http://${inst.vnics[0].public_ip_address}:4000"]
}

output "api_health_check_urls" {
  description = "URLs for API health checks"
  value       = [for inst in oci_container_instances_container_instance.api : "http://${inst.vnics[0].public_ip_address}:4000/api/health"]
}

output "webui_instance_public_ips" {
  description = "Public IP addresses of WebUI container instances"
  value       = [for inst in oci_container_instances_container_instance.webui : inst.vnics[0].public_ip_address]
}

output "webui_urls" {
  description = "URLs to access the WebUI instances"
  value       = [for inst in oci_container_instances_container_instance.webui : "http://${inst.vnics[0].public_ip_address}:8080"]
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

output "webui_instance_ids" {
  description = "OCIDs of WebUI container instances"
  value       = [for inst in oci_container_instances_container_instance.webui : inst.id]
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

    API Access (direct via container public IPs):
    ${join("\n    ", [for i, ip in oci_container_instances_container_instance.api[*].vnics[0].public_ip_address : "- Instance ${i + 1}: http://${ip}:4000"])}

    API Health Check:
    ${join("\n    ", [for i, ip in oci_container_instances_container_instance.api[*].vnics[0].public_ip_address : "- Instance ${i + 1}: http://${ip}:4000/api/health"])}

    WebUI Access (direct via container public IPs):
    ${join("\n    ", [for i, ip in oci_container_instances_container_instance.webui[*].vnics[0].public_ip_address : "- Instance ${i + 1}: http://${ip}:8080"])}

    Network Configuration:
    - VCN: ${oci_core_vcn.travel_agent_vcn.display_name}
    - Subnet: ${oci_core_subnet.public_subnet.display_name}
    - Region: ${var.region}

    Security Notes:
    - Secrets (API keys) are stored in OCI Vault and retrieved at runtime
    - Containers have public IP addresses (ensure security groups are properly configured)
    - Configure DNS records to point to container public IPs for production use
  EOT
}
