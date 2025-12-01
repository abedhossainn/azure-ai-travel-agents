# OCI Cache with Redis
# Reference: https://docs.oracle.com/en-us/iaas/Content/ocache/home.htm

resource "oci_ocache_cluster" "redis_cluster" {
  compartment_id = var.compartment_ocid
  display_name   = local.cache_cluster_name

  node_count = var.redis_node_count
  shape      = var.cache_shape

  software_version = "7.0"

  # Placement (use first availability domain in region)
  placement_configs {
    availability_domain = data.oci_identity_availability_domains.ad.availability_domains[0].name
  }

  # Network
  subnet_id = oci_core_subnet.public_subnet.id
  nsg_ids   = [oci_core_network_security_group.cache_nsg.id]

  tags = local.common_tags

  depends_on = [
    oci_core_subnet.public_subnet
  ]
}

# Output Redis connection endpoint
data "oci_ocache_clusters" "redis_endpoint" {
  compartment_id = var.compartment_ocid
  depends_on     = [oci_ocache_cluster.redis_cluster]
}
