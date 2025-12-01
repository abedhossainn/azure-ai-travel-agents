# Availability Domains (for placement)
data "oci_identity_availability_domains" "ad" {
  compartment_id = var.tenancy_ocid
}

# API Container Instances
resource "oci_container_instances_container_instance" "api" {
  count = var.api_instance_count

  compartment_id = var.compartment_ocid
  display_name   = "${local.api_instance_name}-${count.index + 1}"

  availability_domain = data.oci_identity_availability_domains.ad.availability_domains[count.index % length(data.oci_identity_availability_domains.ad.availability_domains)].name
  shape               = "CI.Standard.E4.Flex"
  shape_config {
    memory_in_gbs = var.api_container_memory / 1024
    ocpus         = var.api_container_cpu
  }

  subnet_id              = oci_core_subnet.public_subnet.id
  nsg_ids                = [oci_core_network_security_group.api_nsg.id]
  assign_public_ip       = true

  # Container configuration
  containers {
    image_url = var.api_image_uri
    display_name = "travel-agent-api"

    # Port mapping
    port_mappings {
      port         = var.api_port
      protocol     = "TCP"
    }

    # Environment variables from secrets
    environment_variables = {
      "NODE_ENV"       = "production"
      "LLM_PROVIDER"   = "gemini"
      "MODEL"          = "gemini-2.0-flash-lite"
      "REDIS_URL"      = "redis://redis:6379"  # Configure external Redis or disable caching
      "AMADEUS_HOST"   = "test"
      # Vault secret OCIDs - container will fetch values at runtime
      "OCI_VAULT_ID"   = var.vault_id
      "GOOGLE_GENAI_API_KEY_SECRET_ID" = var.google_genai_api_key_secret_id
      "AMADEUS_CLIENT_ID_SECRET_ID"    = var.amadeus_client_id_secret_id
      "AMADEUS_CLIENT_SECRET_SECRET_ID" = var.amadeus_client_secret_secret_id
    }

    # Health check
    health_checks {
      health_check_type = "HTTP"
      port              = var.api_port
      url_path          = "/api/health"
      interval_in_seconds = 30
      timeout_in_seconds  = 10
      failure_threshold   = 3
      success_threshold   = 2
    }

    # Logging
    is_resource_principal_auth_enabled = false

    # Container startup
    working_directory = "/app/packages/api"
    entrypoint = ["node"]
    command = ["dist/index.js"]
  }

  # Restart policy
  restart_policy = "UNLESS_STOPPED"

  freeform_tags = local.common_tags

  depends_on = [
    oci_core_subnet.public_subnet
  ]
}

# Open WebUI Container Instances
resource "oci_container_instances_container_instance" "webui" {
  count = var.webui_instance_count

  compartment_id = var.compartment_ocid
  display_name   = "${local.webui_instance_name}-${count.index + 1}"

  availability_domain = data.oci_identity_availability_domains.ad.availability_domains[count.index % length(data.oci_identity_availability_domains.ad.availability_domains)].name
  shape               = "CI.Standard.E4.Flex"
  shape_config {
    memory_in_gbs = var.webui_container_memory / 1024
    ocpus         = var.webui_container_cpu
  }

  subnet_id              = oci_core_subnet.public_subnet.id
  nsg_ids                = [oci_core_network_security_group.api_nsg.id]
  assign_public_ip       = true

  # Container configuration
  containers {
    image_url = var.webui_image_uri
    display_name = "open-webui"

    # Port mapping (Open WebUI uses 8080 internally)
    port_mappings {
      port         = 8080
      protocol     = "TCP"
    }

    # Environment variables
    environment_variables = {
      "OPENAI_API_BASE_URL" = "http://${oci_container_instances_container_instance.api[0].container_instance_hostname}:${var.api_port}/v1"
      "OPENAI_API_KEY"      = "sk-dummy"
      "WEBUI_NAME"          = "Travel Agent"
      "WEBUI_AUTH"          = "false"
    }

    # Health check
    health_checks {
      health_check_type = "HTTP"
      port              = 8080
      url_path          = "/"
      interval_in_seconds = 30
      timeout_in_seconds  = 10
      failure_threshold   = 3
      success_threshold   = 2
    }

    # Container startup
    working_directory = "/app"
  }

  # Restart policy
  restart_policy = "UNLESS_STOPPED"

  freeform_tags = local.common_tags

  depends_on = [
    oci_container_instances_container_instance.api
  ]
}
