# OCI Load Balancer
# Reference: https://docs.oracle.com/en-us/iaas/Content/NetworkLoadBalancer/home.htm

resource "oci_load_balancer_load_balancer" "travel_agent_lb" {
  compartment_id = var.compartment_ocid
  display_name   = local.lb_display_name
  shape          = var.load_balancer_shape

  subnet_ids = [oci_core_subnet.public_subnet.id]

  # Flexible shape configuration
  dynamic "shape_details" {
    for_each = var.load_balancer_shape == "flexible" ? [1] : []
    content {
      bandwidth_in_mbps = var.load_balancer_bandwidth_mbps
    }
  }

  is_private = false

  tags = local.common_tags

  depends_on = [oci_core_subnet.public_subnet]
}

# Backend Set for API
resource "oci_load_balancer_backend_set" "api_backend_set" {
  load_balancer_id = oci_load_balancer_load_balancer.travel_agent_lb.id
  name             = "api-backend-set"
  policy           = "ROUND_ROBIN"

  health_checker {
    port            = var.api_port
    protocol        = "HTTP"
    url_path        = "/api/health"
    interval_ms     = 30000
    timeout_ms      = 10000
    unhealthy_threshold = 3
    healthy_threshold   = 2
  }

  depends_on = [oci_load_balancer_load_balancer.travel_agent_lb]
}

# Backend Set for WebUI
resource "oci_load_balancer_backend_set" "webui_backend_set" {
  load_balancer_id = oci_load_balancer_load_balancer.travel_agent_lb.id
  name             = "webui-backend-set"
  policy           = "ROUND_ROBIN"

  health_checker {
    port            = 8080
    protocol        = "HTTP"
    url_path        = "/"
    interval_ms     = 30000
    timeout_ms      = 10000
    unhealthy_threshold = 3
    healthy_threshold   = 2
  }

  depends_on = [oci_load_balancer_load_balancer.travel_agent_lb]
}

# Register API backends
resource "oci_load_balancer_backend" "api_backend" {
  count            = var.api_instance_count
  load_balancer_id = oci_load_balancer_load_balancer.travel_agent_lb.id
  backendset_name  = oci_load_balancer_backend_set.api_backend_set.name
  ip_address       = oci_container_instances_container_instance.api[count.index].private_ip_address
  port             = var.api_port
  weight           = 1

  depends_on = [
    oci_load_balancer_backend_set.api_backend_set,
    oci_container_instances_container_instance.api
  ]
}

# Register WebUI backends
resource "oci_load_balancer_backend" "webui_backend" {
  count            = var.webui_instance_count
  load_balancer_id = oci_load_balancer_load_balancer.travel_agent_lb.id
  backendset_name  = oci_load_balancer_backend_set.webui_backend_set.name
  ip_address       = oci_container_instances_container_instance.webui[count.index].private_ip_address
  port             = 8080
  weight           = 1

  depends_on = [
    oci_load_balancer_backend_set.webui_backend_set,
    oci_container_instances_container_instance.webui
  ]
}

# Listener for HTTP (API)
resource "oci_load_balancer_listener" "api_listener_http" {
  load_balancer_id       = oci_load_balancer_load_balancer.travel_agent_lb.id
  name                   = "api-http-listener"
  default_backend_set_name = oci_load_balancer_backend_set.api_backend_set.name
  port                   = 80
  protocol               = "HTTP"

  depends_on = [oci_load_balancer_backend_set.api_backend_set]
}

# Listener for HTTPS (API) - requires SSL certificate
resource "oci_load_balancer_listener" "api_listener_https" {
  count = var.certificate_subject_common_name != "" ? 1 : 0

  load_balancer_id       = oci_load_balancer_load_balancer.travel_agent_lb.id
  name                   = "api-https-listener"
  default_backend_set_name = oci_load_balancer_backend_set.api_backend_set.name
  port                   = 443
  protocol               = "HTTPS"
  ssl_configuration {
    certificate_name = oci_load_balancer_certificate.cert[0].certificate_name
  }

  depends_on = [
    oci_load_balancer_backend_set.api_backend_set,
    oci_load_balancer_certificate.cert
  ]
}

# Listener for HTTP (WebUI)
resource "oci_load_balancer_listener" "webui_listener_http" {
  load_balancer_id       = oci_load_balancer_load_balancer.travel_agent_lb.id
  name                   = "webui-http-listener"
  default_backend_set_name = oci_load_balancer_backend_set.webui_backend_set.name
  port                   = 3000
  protocol               = "HTTP"

  depends_on = [oci_load_balancer_backend_set.webui_backend_set]
}

# Listener for HTTPS (WebUI) - requires SSL certificate
resource "oci_load_balancer_listener" "webui_listener_https" {
  count = var.certificate_subject_common_name != "" ? 1 : 0

  load_balancer_id       = oci_load_balancer_load_balancer.travel_agent_lb.id
  name                   = "webui-https-listener"
  default_backend_set_name = oci_load_balancer_backend_set.webui_backend_set.name
  port                   = 8443
  protocol               = "HTTPS"
  ssl_configuration {
    certificate_name = oci_load_balancer_certificate.cert[0].certificate_name
  }

  depends_on = [
    oci_load_balancer_backend_set.webui_backend_set,
    oci_load_balancer_certificate.cert
  ]
}

# SSL Certificate (self-signed or from OCI CA)
resource "tls_private_key" "cert_key" {
  count       = var.use_self_signed_cert ? 1 : 0
  algorithm   = "RSA"
  rsa_bits    = 2048
}

resource "tls_self_signed_cert" "cert" {
  count           = var.use_self_signed_cert ? 1 : 0
  private_key_pem = tls_private_key.cert_key[0].private_key_pem

  subject {
    common_name  = var.certificate_subject_common_name != "" ? var.certificate_subject_common_name : "travel-agent.example.com"
    organization = "Travel Agent"
  }

  validity_period_hours = 8760 # 1 year

  allowed_uses = [
    "key_encipherment",
    "digital_signature",
    "server_auth",
  ]
}

# Load Balancer Certificate
resource "oci_load_balancer_certificate" "cert" {
  count             = var.certificate_subject_common_name != "" ? 1 : 0
  load_balancer_id  = oci_load_balancer_load_balancer.travel_agent_lb.id
  certificate_name  = "${local.resource_prefix}-cert"

  # Self-signed certificate
  certificate_body = var.use_self_signed_cert ? tls_self_signed_cert.cert[0].cert_pem : file("${path.module}/cert.pem")
  private_key      = var.use_self_signed_cert ? tls_private_key.cert_key[0].private_key_pem : file("${path.module}/key.pem")

  depends_on = [oci_load_balancer_load_balancer.travel_agent_lb]
}
