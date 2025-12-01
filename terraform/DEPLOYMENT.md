# Oracle Cloud Infrastructure - Terraform Deployment Guide

This guide walks you through deploying the travel-agent application on Oracle Cloud Infrastructure (OCI) using Oracle Resource Manager with Terraform.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [OCI Setup](#oci-setup)
3. [Prepare Secrets in OCI Vault](#prepare-secrets-in-oci-vault)
4. [Build and Push Docker Image to OCIR](#build-and-push-docker-image-to-ocir)
5. [Configure Terraform Variables](#configure-terraform-variables)
6. [Deploy via Oracle Resource Manager](#deploy-via-oracle-resource-manager)
7. [Post-Deployment](#post-deployment)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### OCI Account
- Active OCI Free Tier or paid account
- Tenancy OCID and compartment OCID
- OCI API credentials (user OCID, fingerprint, private key)

### Local Development
- Docker installed (for building and pushing container images)
- OCI CLI installed: `brew install oci-cli` (macOS) or [install guide](https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/cliinstall.htm)
- Terraform (optional, for local validation)

### GitHub
- Terraform code already in `/terraform` folder (this directory)
- GitHub PAT (Personal Access Token) authenticated with OCI Resource Manager

---

## OCI Setup

### 1. Get Your Tenancy and User Details

```bash
# Retrieve tenancy OCID
oci iam compartment list-in-tenancy --compartment-id-in-subtree true --all

# Get your user OCID
oci iam user get
```

### 2. Create or Select a Compartment

```bash
# List compartments
oci iam compartment list --compartment-id <tenancy-ocid> --all

# Create a new compartment (optional)
oci iam compartment create --name travel-agent-prod --description "Travel Agent Production"
```

Save the compartment OCID for later.

### 3. Generate API Credentials

```bash
# Generate API key pair (if not already done)
oci setup repair-file-permissions --file <path-to-private-key>

# Retrieve fingerprint
oci iam user api-key list
```

Keep your private API key file secure and note the fingerprint.

---

## Prepare Secrets in OCI Vault

### 1. Create an OCI Vault

In OCI Console:
1. Navigate to **Developer Services** → **Vault**
2. Click **Create Vault**
3. Name it `travel-agent-vault`
4. Select your compartment
5. Click **Create**

Wait for the vault to be ACTIVE, then note its OCID.

### 2. Create Master Encryption Key

1. In the vault details page, go to **Master Encryption Keys**
2. Click **Create Key**
3. Name it `travel-agent-key`, select algorithm `AES`, and click **Create**
4. Wait for the key to be ACTIVE

### 3. Add Secrets to the Vault

Create three secrets in the vault:

#### Secret 1: GOOGLE_GENAI_API_KEY
1. Click **Secrets** in the vault
2. Click **Create Secret**
3. **Name:** `google-genai-api-key`
4. **Description:** "Google Gemini API Key for LLM"
5. **Encryption Key:** Select the key you created above
6. **Secret Contents:** Paste your actual API key
7. Click **Create Secret**
8. **Note the secret OCID**

#### Secret 2: AMADEUS_CLIENT_ID
1. Repeat the process with:
   - **Name:** `amadeus-client-id`
   - **Secret Contents:** Your Amadeus client ID

#### Secret 3: AMADEUS_CLIENT_SECRET
1. Repeat the process with:
   - **Name:** `amadeus-client-secret`
   - **Secret Contents:** Your Amadeus client secret

### 4. Grant Resource Manager Access to Vault

Create a dynamic group and policy for Resource Manager:

```bash
# Create dynamic group for Resource Manager instances
oci iam dynamic-group create \
  --name travel-agent-rm-group \
  --description "Dynamic group for Resource Manager instances" \
  --matching-rule 'resource.type="resourcemanager_stack"'

# Create policy granting vault access
oci iam policy create \
  --name travel-agent-rm-policy \
  --description "Allows Resource Manager to access vault secrets" \
  --statements '[
    "Allow dynamic-group travel-agent-rm-group to manage secrets in compartment <compartment-name>",
    "Allow dynamic-group travel-agent-rm-group to use keys in compartment <compartment-name>"
  ]'
```

---

## Build and Push Docker Image to OCIR

### 1. Authenticate with OCIR

```bash
# Get your namespace
OCIR_NAMESPACE=$(oci os ns get --query data --raw-output)
echo "OCIR Namespace: $OCIR_NAMESPACE"

# Log in to OCIR (region: ashburn = iad, phoenix = phx)
docker login iad.ocir.io
# Username: <tenancy-namespace>/<username>
# Password: auth-token (from your OCI Console > Identity > Users > Auth Tokens)
```

### 2. Build the Docker Image

From the repo root:

```bash
# Build the image
docker build -t iad.ocir.io/${OCIR_NAMESPACE}/travel-agent/api:latest .

# Tag for version (optional)
docker tag iad.ocir.io/${OCIR_NAMESPACE}/travel-agent/api:latest \
           iad.ocir.io/${OCIR_NAMESPACE}/travel-agent/api:v1.0.0
```

### 3. Push to OCIR

```bash
# Push to OCIR
docker push iad.ocir.io/${OCIR_NAMESPACE}/travel-agent/api:latest
docker push iad.ocir.io/${OCIR_NAMESPACE}/travel-agent/api:v1.0.0

# Verify image is in OCIR
oci artifacts container image list --compartment-id <compartment-ocid>
```

**Note the full image URI:** `iad.ocir.io/<namespace>/travel-agent/api:latest`

---

## Configure Terraform Variables

### 1. Copy the Template

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

### 2. Edit terraform.tfvars

```bash
# macOS/Linux
vi terraform.tfvars

# Windows
notepad terraform.tfvars
```

Fill in the following fields:

```hcl
# OCI Authentication
tenancy_ocid     = "ocid1.tenancy.oc1..aaaa..."
user_ocid        = "ocid1.user.oc1..aaaa..."
fingerprint      = "12:34:56:78:90:..."
private_key_path = "/Users/yourname/.oci/oci_api_key.pem"

# Region
region      = "us-ashburn-1"
home_region = "us-ashburn-1"

# Compartment
compartment_ocid = "ocid1.compartment.oc1..aaaa..."

# OCIR Images
ocir_region_code = "iad"
ocir_namespace   = "tenancy123456"
api_image_uri    = "iad.ocir.io/tenancy123456/travel-agent/api:latest"

# OCI Vault Secrets (from previous section)
vault_id                        = "ocid1.vault.oc1..aaaa..."
google_genai_api_key_secret_id  = "ocid1.vaultsecret.oc1..aaaa..."
amadeus_client_id_secret_id     = "ocid1.vaultsecret.oc1..aaaa..."
amadeus_client_secret_secret_id = "ocid1.vaultsecret.oc1..aaaa..."

# DNS (optional, leave empty to skip)
dns_zone_name = ""
domain_name   = ""

# SSL (optional)
certificate_subject_common_name = ""
use_self_signed_cert            = false
```

### 3. (Optional) Validate Locally

```bash
# Initialize Terraform
terraform init

# Validate syntax
terraform validate

# Preview changes
terraform plan
```

**DO NOT commit `terraform.tfvars` to Git.** It contains sensitive information.

---

## Deploy via Oracle Resource Manager

### 1. Commit Terraform to GitHub

```bash
cd ../..
git add terraform/
git commit -m "Add Oracle Resource Manager Terraform configuration"
git push origin ai-travel-agent-phase2
```

### 2. Create Stack in OCI Console

1. Navigate to **Developer Services** → **Resource Manager** → **Stacks**
2. Click **Create Stack**
3. Choose **Source Code Control System**
4. Select **GitHub** (already authenticated)
5. Choose your repository: `azure-ai-travel-agents`
6. Branch: `ai-travel-agent-phase2`
7. **Working directory:** `/terraform`
8. Click **Next**

### 3. Configure Stack

1. **Stack Name:** `travel-agent-prod` (or your preferred name)
2. **Compartment:** Select the compartment from step 1
3. **Terraform Version:** Latest (6.0 or newer)
4. Click **Next**

### 4. Input Variables

The Resource Manager UI will display all variables from `variables.tf`.

Fill in (or leave defaults):

- **Tenancy OCID:** Your tenancy OCID
- **User OCID:** Your OCI user OCID
- **Fingerprint:** Your API key fingerprint
- **Private Key Path:** `/home/resourcemanager/.oci/oci_api_key.pem`
  - Note: You'll need to upload your private key to Resource Manager (see below)
- **Region:** `us-ashburn-1` (adjust to your region)
- **Compartment OCID:** Your compartment OCID
- **OCIR Namespace:** Your tenancy namespace
- **API Image URI:** Full OCIR image URI from section 3
- **Vault ID, Secret IDs:** From section 2
- **Domain Name:** Leave empty unless you have DNS configured

### 5. Upload Private Key to Resource Manager

Since Terraform needs access to your OCI API private key:

**Option A: Direct Path (Recommended for Resource Manager)**

Create the key in Resource Manager's environment:

```bash
# SSH into a temporary OCI Compute instance
# Or use OCI Cloud Shell (free)

mkdir -p /home/resourcemanager/.oci
# Upload your private key file
cat << 'EOF' > /home/resourcemanager/.oci/oci_api_key.pem
<paste-your-private-key-content>
EOF

chmod 600 /home/resourcemanager/.oci/oci_api_key.pem
```

**Option B: Use Resource Manager Variables**

1. In the stack creation form, under **Variable Definitions**, create a new secret variable for `private_key_content`
2. Paste your private key content
3. Update `provider.tf` to use this variable instead of a file path

### 6. Create and Run Plan Job

1. Review the variables summary
2. Click **Next** → **Create Stack**
3. Once created, click **Plan** to review infrastructure changes
4. Review the execution plan logs
5. If everything looks correct, click **Apply**

### 7. Monitor Apply Job

1. Watch the apply job progress in real-time
2. Check logs for any errors
3. Once successful, Terraform outputs appear at the bottom

---

## Post-Deployment

### 1. Retrieve Deployment Outputs

After successful apply:

```bash
# In OCI Console, view stack outputs
# Stack → Outputs

# Or via CLI
oci resource-manager stack get-stack-tf-state \
  --stack-id <stack-ocid> \
  --output file \
  --file state.tfstate

# Extract outputs
terraform output
```

### 2. Access the Application

From the Terraform outputs:

```
API:     http://<load-balancer-ip>:4000
WebUI:   http://<load-balancer-ip>:3000
Redis:   redis://<cache-endpoint>:6379
```

### 3. Verify Deployment

```bash
# Check API health
curl http://<load-balancer-ip>:4000/api/health

# Access Open WebUI
# Open browser: http://<load-balancer-ip>:3000
```

### 4. Configure DNS (Optional)

If you provided a domain name:

1. In **OCI Console → Networking → DNS Management**
2. Check that DNS record points to load balancer public IP
3. Wait for DNS propagation (15-30 minutes)
4. Access via domain: `https://travel-agent.example.com`

### 5. Configure SSL Certificate (Optional)

If using a custom domain:

1. **For self-signed cert (dev/test):**
   - Already configured in Terraform
   - Browser will show warning; ignore for testing

2. **For valid SSL cert:**
   - Obtain certificate from Let's Encrypt or OCI CA
   - Update `loadbalancer.tf` with certificate files
   - Re-apply Terraform

---

## Troubleshooting

### Container Instances Not Starting

**Check container logs:**

```bash
# Via OCI Console: Container Instances → Select instance → Container → Logs

# Via CLI
oci container-instances container-instance-get --container-instance-id <instance-id>
```

**Common issues:**
- Docker image not found in OCIR (verify image URI and access)
- Missing secrets in OCI Vault (verify secret OCIDs)
- Insufficient memory/CPU allocation

### API Not Responding

1. Check load balancer backend health: **OCI Console → Load Balancers → Backend Sets**
2. Verify container instance public IP: `curl <public-ip>:4000/api/health`
3. Check security list rules allow port 4000

### Redis Connection Issues

```bash
# Test Redis connectivity
redis-cli -h <redis-endpoint> -p 6379 ping
# Should return: PONG

# Check Redis logs in OCI Cache cluster details
```

### DNS Not Resolving

```bash
# Check DNS propagation
nslookup travel-agent.example.com

# Verify DNS record in OCI Console: DNS Management → Zone → Records
```

### Terraform Apply Failures

1. **Check Resource Manager job logs:** Stack → Jobs → Select failed job → Logs
2. **Review error messages** for:
   - Missing permissions (IAM policies)
   - Resource quota exceeded
   - Network connectivity issues
3. **Fix and re-apply:** Update `terraform.tfvars` → Stack → Plan → Apply

---

## Cleanup

To delete all resources:

```bash
# In OCI Console: Resource Manager → Stacks → Select stack → Destroy

# Or via CLI
oci resource-manager stack delete-stack --stack-id <stack-ocid>
```

**This will:**
- Delete load balancer, container instances, Redis cache
- Delete VCN, subnets, security groups
- **NOT delete:** Vault secrets, OCIR images, DNS records

---

## Next Steps

1. **CI/CD Integration:** Set up GitHub Actions to automatically rebuild and push Docker images on release
2. **Monitoring:** Add OCI Monitoring and Logging
3. **Scaling:** Extend Terraform to support auto-scaling policies
4. **Backup:** Configure automated backups for Redis cache
5. **Cost Optimization:** Monitor OCI usage and adjust instance shapes

For more information, refer to:
- [OCI Resource Manager Documentation](https://docs.oracle.com/en-us/iaas/Content/ResourceManager/home.htm)
- [OCI Terraform Provider](https://registry.terraform.io/providers/oracle/oci/latest/docs)
- [OCI Container Instances](https://docs.oracle.com/en-us/iaas/Container/container-instances/using/)
