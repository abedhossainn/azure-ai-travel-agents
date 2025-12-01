locals {
  # Resource naming convention
  resource_prefix = "${var.project_name}-${var.environment}"

  # Common tags
  common_tags = merge(
    var.tags,
    {
      CreatedAt = timestamp()
      Project   = var.project_name
      Environment = var.environment
    }
  )

  # OCIR endpoint
  ocir_endpoint = "${var.ocir_region_code}.ocir.io"

  # API instance display name
  api_instance_name = "${local.resource_prefix}-api"

  # WebUI instance display name
  webui_instance_name = "${local.resource_prefix}-ui"

  # Redis cache cluster display name
  cache_cluster_name = "${local.resource_prefix}-redis"

  # Load balancer display name
  lb_display_name = "${local.resource_prefix}-lb"

  # VCN display name
  vcn_display_name = "${local.resource_prefix}-vcn"

  # Subnet display name
  subnet_display_name = "${local.resource_prefix}-subnet"

  # Security list display name
  security_list_name = "${local.resource_prefix}-security-list"

  # Internet gateway display name
  igw_display_name = "${local.resource_prefix}-igw"

  # Route table display name
  route_table_display_name = "${local.resource_prefix}-rt"
}
