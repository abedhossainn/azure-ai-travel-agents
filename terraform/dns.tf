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
# Note: Requires manual setup or approval process in OCI CA
resource "oci_certificatesmanagement_certificate" "api_cert" {
  count = !var.use_self_signed_cert && var.certificate_subject_common_name != "" ? 1 : 0

  compartment_id = var.compartment_ocid
  certificate_config {
    config_type = "IMPORTED"
    # For managed certificates, use CONFIG_TYPE = "ISSUED" and configure CA
  }

  display_name = var.certificate_display_name

  tags = local.common_tags
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
