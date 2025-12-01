# OCI Authentication & Tenancy
variable "tenancy_ocid" {
  description = "The OCID of the tenancy"
  type        = string
}

variable "user_ocid" {
  description = "The OCID of the user for API authentication"
  type        = string
}

variable "fingerprint" {
  description = "Fingerprint of the API key"
  type        = string
  sensitive   = true
}

variable "private_key_path" {
  description = "Path to the private API key file"
  type        = string
  sensitive   = true
}

variable "region" {
  description = "OCI region (e.g., us-ashburn-1, us-phoenix-1)"
  type        = string
  default     = "us-ashburn-1"
}

variable "home_region" {
  description = "Home region for identity and secrets (usually same as region)"
  type        = string
  default     = "us-ashburn-1"
}

# Compartment
variable "compartment_ocid" {
  description = "OCID of the compartment where resources will be created"
  type        = string
}

# Project Labels
variable "project_name" {
  description = "Project name for tagging and naming resources"
  type        = string
  default     = "travel-agent"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "prod"
}

# Networking
variable "vcn_cidr" {
  description = "CIDR block for the VCN"
  type        = string
  default     = "10.0.0.0/16"
}

variable "subnet_cidr" {
  description = "CIDR block for the public subnet"
  type        = string
  default     = "10.0.1.0/24"
}

# Container Images (OCI Container Registry)
variable "ocir_region_code" {
  description = "OCI region code for OCIR (e.g., iad, phx)"
  type        = string
  default     = "iad"
}

variable "ocir_namespace" {
  description = "OCIR namespace (usually your tenancy namespace)"
  type        = string
}

variable "api_image_uri" {
  description = "Full URI of the API Docker image in OCIR (e.g., iad.ocir.io/namespace/repo:tag)"
  type        = string
}

variable "webui_image_uri" {
  description = "Full URI of the Open WebUI Docker image (defaults to ghcr.io public image)"
  type        = string
  default     = "ghcr.io/open-webui/open-webui:main"
}

# OCI Vault Secrets
variable "vault_id" {
  description = "OCID of the OCI Vault containing secrets"
  type        = string
}

variable "google_genai_api_key_secret_id" {
  description = "OCID of the secret in OCI Vault for GOOGLE_GENAI_API_KEY"
  type        = string
  sensitive   = true
}

variable "amadeus_client_id_secret_id" {
  description = "OCID of the secret in OCI Vault for AMADEUS_CLIENT_ID"
  type        = string
  sensitive   = true
}

variable "amadeus_client_secret_secret_id" {
  description = "OCID of the secret in OCI Vault for AMADEUS_CLIENT_SECRET"
  type        = string
  sensitive   = true
}

# Container Configuration
variable "api_port" {
  description = "Port exposed by the API container"
  type        = number
  default     = 4000
}

variable "webui_port" {
  description = "Port exposed by the Open WebUI container"
  type        = number
  default     = 8080
}

variable "api_container_memory" {
  description = "Memory allocation for API container (in MB)"
  type        = number
  default     = 1024
}

variable "api_container_cpu" {
  description = "CPU allocation for API container (in OCPUs)"
  type        = string
  default     = "1"
}

variable "webui_container_memory" {
  description = "Memory allocation for WebUI container (in MB)"
  type        = number
  default     = 512
}

variable "webui_container_cpu" {
  description = "CPU allocation for WebUI container (in OCPUs)"
  type        = string
  default     = "0.5"
}

# Redis/Cache Configuration
variable "cache_shape" {
  description = "OCI Cache shape (e.g., redis.cluster.general.x7.1gb, redis.standalone.general.x7.1gb)"
  type        = string
  default     = "redis.standalone.general.x7.1gb"
}

variable "redis_node_count" {
  description = "Number of nodes in Redis cluster (1 for standalone)"
  type        = number
  default     = 1
}

# Load Balancer Configuration
variable "load_balancer_shape" {
  description = "Load Balancer shape (flexible or 100Mbps, 10Mbps, etc.)"
  type        = string
  default     = "flexible"
}

variable "load_balancer_bandwidth_mbps" {
  description = "Load Balancer bandwidth in Mbps (required for flexible shape)"
  type        = number
  default     = 10
}

# DNS Configuration
variable "dns_zone_name" {
  description = "DNS zone name (optional, e.g., example.com)"
  type        = string
  default     = ""
}

variable "domain_name" {
  description = "Full domain name to map to load balancer (e.g., travel-agent.example.com)"
  type        = string
  default     = ""
}

# SSL/TLS Configuration
variable "certificate_display_name" {
  description = "Display name for SSL certificate in OCI Certificate Authority"
  type        = string
  default     = "travel-agent-cert"
}

variable "certificate_subject_common_name" {
  description = "Common name for SSL certificate (e.g., travel-agent.example.com)"
  type        = string
  default     = ""
}

variable "use_self_signed_cert" {
  description = "If true, use self-signed certificate; if false, use OCI CA"
  type        = bool
  default     = false
}

# Container Instances
variable "api_instance_count" {
  description = "Number of API container instances (fixed, no autoscaling)"
  type        = number
  default     = 1
}

variable "webui_instance_count" {
  description = "Number of WebUI container instances (fixed, no autoscaling)"
  type        = number
  default     = 1
}

# Tags
variable "tags" {
  description = "Map of tags to apply to all resources"
  type        = map(string)
  default = {
    "Terraform"   = "true"
    "Project"     = "travel-agent"
    "ManagedBy"   = "ResourceManager"
  }
}
