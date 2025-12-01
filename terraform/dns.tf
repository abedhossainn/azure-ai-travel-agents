# DNS and Certificate Configuration - Simplified for MVP

# Note: DNS and SSL/TLS can be added in production
# For now, access services via public IP addresses of container instances

# Future: DNS Zone Management
# resource "oci_dns_zone" "travel_agent_zone" {
#   compartment_id = var.compartment_ocid
#   name           = var.domain_name
# }

# Future: A Record for API
# resource "oci_dns_rrset" "api_record" {
#   zone_name     = oci_dns_zone.travel_agent_zone.name
#   domain        = "api.${var.domain_name}"
#   rtype         = "A"
#   ttl           = 3600
#   items = [{
#     rdata = oci_load_balancer_load_balancer.travel_agent_lb.public_ips[0]
#   }]
# }

output "dns_note" {
  value = "DNS configuration skipped for MVP. Access services via direct container public IPs."
}

output "ssl_note" {
  value = "SSL/TLS can be added in production with a domain name and certificate."
}
