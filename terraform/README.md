# Terraform Configuration for Oracle Cloud Infrastructure (OCI)

This directory contains Terraform configuration to deploy the travel-agent application on OCI using Oracle Resource Manager.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   OCI Region (us-ashburn-1)                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Internet Gateway                           │   │
│  └────────────────┬─────────────────────────────────────┘   │
│                   │                                           │
│  ┌────────────────┼─────────────────────────────────────┐   │
│  │                │ VCN (10.0.0.0/16)                  │   │
│  │  ┌─────────────▼──────────────────────────────────┐ │   │
│  │  │   Public Subnet (10.0.1.0/24)                 │ │   │
│  │  │                                                │ │   │
│  │  │  ┌────────────────────────────────────────┐  │ │   │
│  │  │  │  OCI Load Balancer                     │  │ │   │
│  │  │  │  - HTTP/HTTPS listeners               │  │ │   │
│  │  │  │  - Backend sets for API & WebUI       │  │ │   │
│  │  │  └────┬───────────────────────┬──────────┘  │ │   │
│  │  │       │                       │              │ │   │
│  │  │  ┌────▼────┐            ┌─────▼────┐       │ │   │
│  │  │  │ API     │            │ WebUI    │       │ │   │
│  │  │  │ Cont    │            │ Cont     │       │ │   │
│  │  │  │ Inst    │            │ Inst     │       │ │   │
│  │  │  │ 4000    │            │ 8080     │       │ │   │
│  │  │  └─────┬───┘            └────┬─────┘       │ │   │
│  │  │        │                     │              │ │   │
│  │  │  ┌─────▼─────────────────────▼─────┐      │ │   │
│  │  │  │  OCI Cache (Redis 6379)         │      │ │   │
│  │  │  │  - Standalone node              │      │ │   │
│  │  │  │  - Automatic backups            │      │ │   │
│  │  │  └──────────────────────────────────┘     │ │   │
│  │  │                                            │ │   │
│  │  └────────────────────────────────────────────┘ │   │
│  │                                                  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │   │
│  ┌──────────────────────────────────────────────────┐  │   │
│  │           OCI Vault (Secrets Management)        │  │   │
│  │  - GOOGLE_GENAI_API_KEY                        │  │   │
│  │  - AMADEUS_CLIENT_ID                           │  │   │
│  │  - AMADEUS_CLIENT_SECRET                       │  │   │
│  └──────────────────────────────────────────────────┘  │   │
│                                                         │   │
│  ┌──────────────────────────────────────────────────┐  │   │
│  │  OCI Container Registry (OCIR)                  │  │   │
│  │  - Stores Docker images for API                 │  │   │
│  └──────────────────────────────────────────────────┘  │   │
│                                                         │   │
└─────────────────────────────────────────────────────────┘   │
         │                                                       │
         │ Optional DNS Mapping                                │
         │ (OCI DNS Management)                                │
         ▼                                                       │
    travel-agent.example.com ◄──────────────────────────────┘
```

## File Structure

```
terraform/
├── provider.tf              # OCI provider configuration
├── variables.tf             # Input variables (all configurable)
├── locals.tf                # Local values for naming conventions
├── network.tf               # VCN, subnet, internet gateway, security lists, NSGs
├── cache.tf                 # OCI Cache cluster with Redis
├── containers.tf            # Container instances (API + WebUI)
│                           # Secrets integration from OCI Vault
├── loadbalancer.tf          # Load balancer, listeners, backends, SSL
├── dns.tf                   # DNS management and SSL certificates
├── outputs.tf               # Outputs for deployment information
├── terraform.tfvars.example # Template for variables (copy to terraform.tfvars)
├── .gitignore              # Ignore tfstate, tfvars, certificates
├── DEPLOYMENT.md           # Step-by-step deployment guide
└── README.md               # This file
```

## Quick Start

### 1. Prerequisites

- OCI Account with API credentials
- Docker CLI (to build and push images)
- OCI CLI (to manage resources)
- Terraform (optional, for local validation)

### 2. Prepare Secrets in OCI Vault

Create three secrets in OCI Vault:
- `google-genai-api-key` (your Gemini API key)
- `amadeus-client-id` (Amadeus client ID)
- `amadeus-client-secret` (Amadeus client secret)

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed steps.

### 3. Build and Push Docker Image

```bash
cd ..
docker build -t iad.ocir.io/<namespace>/travel-agent/api:latest .
docker push iad.ocir.io/<namespace>/travel-agent/api:latest
```

### 4. Configure Terraform

```bash
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your OCI details
```

### 5. Deploy via Resource Manager

Follow the [DEPLOYMENT.md](./DEPLOYMENT.md) guide to:
1. Commit Terraform to GitHub
2. Create a Resource Manager stack pointing to `/terraform`
3. Run plan and apply jobs
4. Access the deployed application

---

## Key Features

### Security
- **Secrets Management:** API keys stored in OCI Vault, retrieved at runtime
- **Network Isolation:** VCN with private subnets and security lists
- **SSL/TLS:** Load balancer handles certificate termination
- **NSGs:** Network Security Groups for fine-grained access control

### High Availability
- **Load Balancer:** Distributes traffic across multiple instances
- **Health Checks:** Automatic detection and replacement of failed containers
- **Managed Cache:** OCI Cache with Redis handles session state

### Cost Optimization
- **Always Free Resources:** Leverage OCI Free Tier services
- **Flexible Shapes:** Scale containers up/down based on demand
- **Auto-Scaling:** (Future) Add auto-scaling policies based on CPU/memory

### Maintainability
- **Infrastructure as Code:** All resources defined in Terraform
- **Version Control:** Terraform config tracked in Git
- **Resource Manager:** Automatic state management and locking
- **Outputs:** Easy access to deployment URLs and endpoints

---

## Configuration Options

### Container Sizing

Adjust in `terraform.tfvars`:

```hcl
api_container_memory = 1024        # MB (1 GB)
api_container_cpu    = "1"         # 1 OCPU
webui_container_memory = 512       # MB (512 MB)
webui_container_cpu  = "0.5"       # 0.5 OCPU
```

### Instance Count

```hcl
api_instance_count   = 1           # Number of API instances
webui_instance_count = 1           # Number of WebUI instances
```

### Redis Cache

```hcl
cache_shape      = "redis.standalone.general.x7.1gb"
redis_node_count = 1               # Standalone (1 = no clustering)
```

### Load Balancer

```hcl
load_balancer_shape          = "flexible"
load_balancer_bandwidth_mbps = 10  # 10 Mbps (suitable for most workloads)
```

### DNS & SSL (Optional)

```hcl
dns_zone_name                    = "example.com"
domain_name                      = "travel-agent.example.com"
certificate_subject_common_name  = "travel-agent.example.com"
use_self_signed_cert             = false  # true for dev/test
```

---

## Deployment Outputs

After successful deployment, Terraform provides:

```
load_balancer_public_ip:     203.0.113.42
api_url:                     http://203.0.113.42:4000
webui_url:                   http://203.0.113.42:3000
redis_endpoint:              ocache123.redis.oraclecloud.com
redis_connection_string:     redis://ocache123.redis.oraclecloud.com:6379
```

---

## Managing the Deployment

### Update Configuration

1. Edit `terraform.tfvars`
2. Commit changes to GitHub
3. In Resource Manager, click **Plan** to review
4. Click **Apply** to deploy changes

### Destroy Resources

```bash
# In OCI Console: Stack → Destroy
# Or via CLI:
oci resource-manager stack delete-stack --stack-id <stack-ocid>
```

### View Logs

```bash
# In OCI Console: Stack → Jobs → Select job → Logs
# Check for errors and deployment details
```

---

## Troubleshooting

### Common Issues

1. **Docker image not found:** Verify OCIR image URI is correct and accessible
2. **Secrets not retrieved:** Check that vault secrets exist and have the correct OCIDs
3. **Load balancer unhealthy:** Verify container instances are running and health checks pass
4. **DNS not resolving:** Allow 15-30 minutes for DNS propagation

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed troubleshooting steps.

---

## References

- [Oracle Resource Manager](https://docs.oracle.com/en-us/iaas/Content/ResourceManager/home.htm)
- [OCI Terraform Provider](https://registry.terraform.io/providers/oracle/oci/latest/docs)
- [OCI Container Instances](https://docs.oracle.com/en-us/iaas/Container/container-instances/using/)
- [OCI Load Balancer](https://docs.oracle.com/en-us/iaas/Content/NetworkLoadBalancer/home.htm)
- [OCI Cache (Redis)](https://docs.oracle.com/en-us/iaas/Content/ocache/home.htm)
- [OCI Vault](https://docs.oracle.com/en-us/iaas/Content/KeyManagement/home.htm)

---

## License

This Terraform configuration is part of the azure-ai-travel-agents project and follows the same license terms.

---

## Support

For issues or questions:
1. Check [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed troubleshooting
2. Review Resource Manager job logs in OCI Console
3. Consult [OCI documentation](https://docs.oracle.com/en-us/iaas/)
