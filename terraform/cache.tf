# Redis Cache Configuration
# Note: Using environment variable for now
# For production, integrate with OCI Cache cluster or external Redis service
# This can be deployed separately or using a container instance

# Placeholder for future OCI Cache integration
# When available, uncomment and configure:
# resource "oci_cache_cluster" "redis_cluster" {
#   compartment_id = var.compartment_ocid
#   display_name   = local.cache_cluster_name
#   node_count     = var.redis_node_count
#   shape          = var.cache_shape
# }

# For now, Redis can be:
# 1. Deployed separately outside Terraform
# 2. Replaced with in-memory caching
# 3. Using external Redis service (e.g., Redis Cloud)

output "redis_note" {
  value = "Redis not deployed via Terraform. Configure REDIS_URL environment variable separately or disable caching in the application."
}
