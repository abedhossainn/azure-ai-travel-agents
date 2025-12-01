# Virtual Cloud Network (VCN)
resource "oci_core_vcn" "travel_agent_vcn" {
  compartment_id = var.compartment_ocid
  cidr_block     = var.vcn_cidr
  display_name   = local.vcn_display_name
  dns_label      = "${var.project_name}${var.environment}"

  tags = local.common_tags
}

# Internet Gateway
resource "oci_core_internet_gateway" "travel_agent_igw" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.travel_agent_vcn.id
  display_name   = local.igw_display_name
  enabled        = true

  tags = local.common_tags
}

# Public Subnet
resource "oci_core_subnet" "public_subnet" {
  compartment_id            = var.compartment_ocid
  vcn_id                    = oci_core_vcn.travel_agent_vcn.id
  cidr_block                = var.subnet_cidr
  display_name              = local.subnet_display_name
  dns_label                 = "public"
  prohibit_public_ip_on_vlan = false
  route_table_id            = oci_core_route_table.public_rt.id

  tags = local.common_tags
}

# Route Table for public subnet
resource "oci_core_route_table" "public_rt" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.travel_agent_vcn.id
  display_name   = local.route_table_display_name

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.travel_agent_igw.id
  }

  tags = local.common_tags
}

# Security List for public resources
resource "oci_core_security_list" "public_security_list" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.travel_agent_vcn.id
  display_name   = local.security_list_name

  # Egress rules - allow all outbound traffic
  egress_security_rules {
    protocol    = "all"
    destination = "0.0.0.0/0"
  }

  # Ingress rules
  # SSH access (optional, for debugging)
  ingress_security_rules {
    protocol    = "6" # TCP
    source      = "0.0.0.0/0"
    source_type = "CIDR_BLOCK"
    tcp_options {
      min = 22
      max = 22
    }
    description = "SSH"
  }

  # HTTP
  ingress_security_rules {
    protocol    = "6" # TCP
    source      = "0.0.0.0/0"
    source_type = "CIDR_BLOCK"
    tcp_options {
      min = 80
      max = 80
    }
    description = "HTTP"
  }

  # HTTPS
  ingress_security_rules {
    protocol    = "6" # TCP
    source      = "0.0.0.0/0"
    source_type = "CIDR_BLOCK"
    tcp_options {
      min = 443
      max = 443
    }
    description = "HTTPS"
  }

  # API port (4000)
  ingress_security_rules {
    protocol    = "6" # TCP
    source      = "0.0.0.0/0"
    source_type = "CIDR_BLOCK"
    tcp_options {
      min = var.api_port
      max = var.api_port
    }
    description = "API"
  }

  # WebUI port (3000)
  ingress_security_rules {
    protocol    = "6" # TCP
    source      = "0.0.0.0/0"
    source_type = "CIDR_BLOCK"
    tcp_options {
      min = 3000
      max = 3000
    }
    description = "WebUI"
  }

  # Internal Redis access (6379) from within VCN
  ingress_security_rules {
    protocol    = "6" # TCP
    source      = var.vcn_cidr
    source_type = "CIDR_BLOCK"
    tcp_options {
      min = 6379
      max = 6379
    }
    description = "Redis cache"
  }

  tags = local.common_tags
}

# Attach security list to subnet
resource "oci_core_subnet_security_list_association" "subnet_security_list" {
  subnet_id              = oci_core_subnet.public_subnet.id
  security_list_id      = oci_core_security_list.public_security_list.id
}

# Network Security Groups (optional, for finer-grained control)
resource "oci_core_network_security_group" "api_nsg" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.travel_agent_vcn.id
  display_name   = "${local.resource_prefix}-api-nsg"

  tags = local.common_tags
}

resource "oci_core_network_security_group" "cache_nsg" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.travel_agent_vcn.id
  display_name   = "${local.resource_prefix}-cache-nsg"

  tags = local.common_tags
}

# NSG Rules for API
resource "oci_core_network_security_group_security_rule" "api_ingress_http" {
  network_security_group_id = oci_core_network_security_group.api_nsg.id
  protocol                  = "6" # TCP
  direction                 = "INGRESS"
  source                    = "0.0.0.0/0"
  source_type               = "CIDR_BLOCK"
  tcp_options {
    destination_port_range {
      min = var.api_port
      max = var.api_port
    }
  }
  description = "API ingress"
}

resource "oci_core_network_security_group_security_rule" "api_egress_all" {
  network_security_group_id = oci_core_network_security_group.api_nsg.id
  protocol                  = "all"
  direction                 = "EGRESS"
  destination               = "0.0.0.0/0"
  destination_type          = "CIDR_BLOCK"
  description               = "API egress"
}

# NSG Rules for Cache
resource "oci_core_network_security_group_security_rule" "cache_ingress_redis" {
  network_security_group_id = oci_core_network_security_group.cache_nsg.id
  protocol                  = "6" # TCP
  direction                 = "INGRESS"
  source                    = var.vcn_cidr
  source_type               = "CIDR_BLOCK"
  tcp_options {
    destination_port_range {
      min = 6379
      max = 6379
    }
  }
  description = "Redis ingress from VCN"
}

resource "oci_core_network_security_group_security_rule" "cache_egress_all" {
  network_security_group_id = oci_core_network_security_group.cache_nsg.id
  protocol                  = "all"
  direction                 = "EGRESS"
  destination               = "0.0.0.0/0"
  destination_type          = "CIDR_BLOCK"
  description               = "Cache egress"
}
