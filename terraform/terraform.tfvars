# Terraform Variables - Fetched from OCI CLI Configuration
# Generated: 2025-12-01

# ===== OCI Authentication (from ~/.oci/config) =====
tenancy_ocid     = "ocid1.tenancy.oc1..aaaaaaaa7pqe5dp3l3ggrdau7wiomtljituox7z73yqmlwslkijaudxo4f3q"
user_ocid        = "ocid1.user.oc1..aaaaaaaa5wvg4x7r5plgmranwdim6ezft6yxddul5t5kg6wujqlllqhx5u2q"
fingerprint      = "91:c6:02:af:05:65:0b:df:73:83:ff:1e:47:b4:3d:59"
private_key_path = "/home/abed/.oci/oci_api_key.pem"

# ===== OCI Region =====
region      = "us-ashburn-1"
home_region = "us-ashburn-1"

# ===== Compartment (Root compartment = Tenancy) =====
compartment_ocid = "ocid1.tenancy.oc1..aaaaaaaa7pqe5dp3l3ggrdau7wiomtljituox7z73yqmlwslkijaudxo4f3q"

# ===== Project Labels =====
project_name = "travel-agent"
environment  = "prod"

# ===== Networking =====
vcn_cidr    = "10.0.0.0/16"
subnet_cidr = "10.0.1.0/24"

# ===== Container Images (OCI Container Registry - OCIR) =====
ocir_region_code = "iad"
ocir_namespace   = "idlfbd7vlac7"
api_image_uri    = "iad.ocir.io/idlfbd7vlac7/travel-agent/api:latest"
webui_image_uri  = "ghcr.io/open-webui/open-webui:main"  # Public image, no auth needed

# ===== OCI Vault Secrets =====
# These secret OCIDs are from your OCI Vault
vault_id                        = "ocid1.vault.oc1.iad.ejus2l3baahhe.abuwcljrgkidtcx62k7nm63arncxqab4d5desr3uo75qgzfuc5louxzqgdaa"
google_genai_api_key_secret_id  = "ocid1.vaultsecret.oc1.iad.aaaaaaaa"  # TODO: Replace after creating secret in OCI Console
amadeus_client_id_secret_id     = "ocid1.vaultsecret.oc1.iad.aaaaaaaa"  # TODO: Replace after creating secret in OCI Console
amadeus_client_secret_secret_id = "ocid1.vaultsecret.oc1.iad.aaaaaaaa"  # TODO: Replace after creating secret in OCI Console

# ===== Container Configuration =====
api_port              = 4000
webui_port            = 8080
api_container_memory  = 1024    # MB
api_container_cpu     = "1"     # OCPUs
webui_container_memory = 512    # MB
webui_container_cpu   = "0.5"   # OCPUs

# ===== Redis/Cache Configuration =====
cache_shape  = "redis.standalone.general.x7.1gb"
redis_node_count = 1

# ===== Load Balancer Configuration =====
load_balancer_shape          = "flexible"
load_balancer_bandwidth_mbps = 10

# ===== DNS Configuration (Optional) =====
dns_zone_name = ""
domain_name   = ""

# ===== SSL/TLS Configuration =====
certificate_display_name         = "travel-agent-cert"
certificate_subject_common_name  = ""
use_self_signed_cert             = false

# ===== Container Instances =====
api_instance_count   = 1
webui_instance_count = 1

# ===== Tags =====
tags = {
  "Terraform"   = "true"
  "Project"     = "travel-agent"
  "ManagedBy"   = "ResourceManager"
}
