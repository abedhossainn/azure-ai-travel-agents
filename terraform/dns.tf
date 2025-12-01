# OCI DNS Management and SSL Configuration
# Reference: https://docs.oracle.com/en-us/iaas/Content/DNS/home.htm

# DNS Zone (requires pre-existing zone in OCI DNS)
# Only create if domain_name is provided
data "oci_dns_zones" "existing_zone" {
  compartment_id = var.compartment_ocid
  name           = var.dns_zone_name

  filter {
    name   = "name"
    values = [var.dns_zone_name]
  }
}

# DNS A Record pointing to Load Balancer public IP
resource "oci_dns_rrset" "api_record" {
  count           = var.domain_name != "" ? 1 : 0
  zone_name_or_id = data.oci_dns_zones.existing_zone.zones[0].id
  domain          = var.domain_name
  rtype           = "A"
  ttl             = 300

  items {
    domain = var.domain_name
    rdata  = oci_load_balancer_load_balancer.travel_agent_lb.ip_address_details[0].ip_address
    rtype  = "A"
    ttl    = 300
  }

  depends_on = [oci_load_balancer_load_balancer.travel_agent_lb]
}

# DNS CNAME for WebUI (optional)
resource "oci_dns_rrset" "webui_record" {
  count           = var.domain_name != "" ? 1 : 0
  zone_name_or_id = data.oci_dns_zones.existing_zone.zones[0].id
  domain          = "ui.${var.domain_name}"
  rtype           = "CNAME"
  ttl             = 300

  items {
    domain = "ui.${var.domain_name}"
    rdata  = var.domain_name
    rtype  = "CNAME"
    ttl    = 300
  }

  depends_on = [oci_dns_rrset.api_record]
}

# OCI Certificate Authority (optional, for managed certificates)
# Simplified: Uses self-signed certificate for now
# For production, integrate with OCI Certificate Management Service
resource "tls_self_signed_cert" "api_cert" {
  count = var.use_self_signed_cert && var.certificate_subject_common_name != "" ? 1 : 0

  private_key_pem = tls_private_key.api_key[0].private_key_pem

  subject {
    common_name  = var.certificate_subject_common_name
    organization = "Travel Agent"
  }

  validity_period_hours = 8760 # 1 year

  allowed_uses = [
    "key_encipherment",
    "digital_signature",
    "server_auth",
  ]
}

# Private key for self-signed certificate
resource "tls_private_key" "api_key" {
  count = var.use_self_signed_cert && var.certificate_subject_common_name != "" ? 1 : 0

  algorithm = "RSA"
  rsa_bits  = 2048
}

# WAF Policy (optional, for security)
# Uncomment if you want to add Web Application Firewall rules
/*
resource "oci_waf_web_app_firewall" "travel_agent_waf" {
  compartment_id = var.compartment_ocid
  display_name   = "${local.resource_prefix}-waf"

  backend_type = "LOAD_BALANCER"

  waf_policy_id = oci_waf_web_app_firewall_policy.travel_agent_waf_policy.id

  load_balancer_id = oci_load_balancer_load_balancer.travel_agent_lb.id

  tags = local.common_tags
}

resource "oci_waf_web_app_firewall_policy" "travel_agent_waf_policy" {
  compartment_id = var.compartment_ocid
  display_name   = "${local.resource_prefix}-waf-policy"

  tags = local.common_tags
}
*/
