# Retrieve secrets from OCI Vault
data "oci_secrets_secretmanagement_secret" "google_genai_api_key" {
  secret_id = var.google_genai_api_key_secret_id
}

data "oci_secrets_secretmanagement_secret" "amadeus_client_id" {
  secret_id = var.amadeus_client_id_secret_id
}

data "oci_secrets_secretmanagement_secret" "amadeus_client_secret" {
  secret_id = var.amadeus_client_secret_secret_id
}

# Retrieve secret versions (latest)
data "oci_secrets_secretmanagement_secret_version" "google_genai_api_key_version" {
  secret_id       = data.oci_secrets_secretmanagement_secret.google_genai_api_key.id
  secret_version_number = data.oci_secrets_secretmanagement_secret.google_genai_api_key.secret_versions[0].version_number
}

data "oci_secrets_secretmanagement_secret_version" "amadeus_client_id_version" {
  secret_id       = data.oci_secrets_secretmanagement_secret.amadeus_client_id.id
  secret_version_number = data.oci_secrets_secretmanagement_secret.amadeus_client_id.secret_versions[0].version_number
}

data "oci_secrets_secretmanagement_secret_version" "amadeus_client_secret_version" {
  secret_id       = data.oci_secrets_secretmanagement_secret.amadeus_client_secret.id
  secret_version_number = data.oci_secrets_secretmanagement_secret.amadeus_client_secret.secret_versions[0].version_number
}

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
      "REDIS_URL"      = "redis://${oci_ocache_cluster.redis_cluster.endpoint}:6379"
      "AMADEUS_HOST"   = "test"
    }

    # Secrets mounted as environment variables
    # Note: These need to be decoded from the secret base64 content
    extended_metadata = {
      "GOOGLE_GENAI_API_KEY"     = base64decode(data.oci_secrets_secretmanagement_secret_version.google_genai_api_key_version.secret_version_content[0].content)
      "AMADEUS_CLIENT_ID"        = base64decode(data.oci_secrets_secretmanagement_secret_version.amadeus_client_id_version.secret_version_content[0].content)
      "AMADEUS_CLIENT_SECRET"    = base64decode(data.oci_secrets_secretmanagement_secret_version.amadeus_client_secret_version.secret_version_content[0].content)
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

  tags = local.common_tags

  depends_on = [
    oci_core_subnet.public_subnet,
    oci_ocache_cluster.redis_cluster
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

  tags = local.common_tags

  depends_on = [
    oci_container_instances_container_instance.api
  ]
}
