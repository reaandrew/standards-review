#!/bin/bash
set -e

# Script to set up OpenSearch roles and role mappings for the SuperDevRole

# Parse command line arguments
while getopts "e:p:r:" opt; do
  case $opt in
    e) OPENSEARCH_ENDPOINT="$OPTARG" ;;
    p) ADMIN_PASSWORD="$OPTARG" ;;
    r) SUPER_DEV_ROLE_ARN="$OPTARG" ;;
    *) echo "Usage: $0 -e <opensearch_endpoint> -p <admin_password> -r <super_dev_role_arn>" >&2
       exit 1 ;;
  esac
done

# Allow either direct arguments or environment variables
OPENSEARCH_ENDPOINT=${OPENSEARCH_ENDPOINT:-$OS_ENDPOINT}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-$OS_PASSWORD}
SUPER_DEV_ROLE_ARN=${SUPER_DEV_ROLE_ARN:-$ROLE_ARN}
ADMIN_USERNAME=${ADMIN_USERNAME:-"admin"}

# Check for required variables
if [ -z "$OPENSEARCH_ENDPOINT" ]; then
  echo "ERROR: OpenSearch endpoint not provided"
  echo "Use -e flag or set OS_ENDPOINT environment variable"
  exit 1
fi

if [ -z "$ADMIN_PASSWORD" ]; then
  echo "ERROR: Admin password not provided"
  echo "Use -p flag or set OS_PASSWORD environment variable"
  exit 1
fi

if [ -z "$SUPER_DEV_ROLE_ARN" ]; then
  echo "ERROR: SuperDevRole ARN not provided"
  echo "Use -r flag or set ROLE_ARN environment variable"
  exit 1
fi

# Check if super_dev_role already exists
echo "Checking if super_dev_role already exists..."
ROLE_EXISTS=$(curl -s -o /dev/null -w "%{http_code}" "https://$OPENSEARCH_ENDPOINT/_plugins/_security/api/roles/super_dev_role" \
  -u "$ADMIN_USERNAME:$ADMIN_PASSWORD")

if [ "$ROLE_EXISTS" = "200" ]; then
  echo "Role already exists, updating super_dev_role in OpenSearch..."
else
  echo "Creating new super_dev_role in OpenSearch..."
fi

# Create or update the super_dev_role with cluster_all and indices_all permissions
curl -X PUT "https://$OPENSEARCH_ENDPOINT/_plugins/_security/api/roles/super_dev_role" \
  -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  -H 'Content-Type: application/json' \
  -d '{
    "cluster_permissions": ["cluster_all"],
    "index_permissions": [{
      "index_patterns": ["*"],
      "allowed_actions": ["indices_all"]
    }]
  }'

if [ $? -ne 0 ]; then
  echo "Failed to create/update super_dev_role"
  exit 1
fi

echo "Role created/updated successfully"

# Check if role mapping already exists
echo "Checking if role mapping already exists..."
MAPPING_EXISTS=$(curl -s -o /dev/null -w "%{http_code}" "https://$OPENSEARCH_ENDPOINT/_plugins/_security/api/rolesmapping/super_dev_role" \
  -u "$ADMIN_USERNAME:$ADMIN_PASSWORD")

if [ "$MAPPING_EXISTS" = "200" ]; then
  echo "Role mapping already exists, updating role mapping for SuperDevRole..."
else
  echo "Creating new role mapping for SuperDevRole..."
fi

# Create or update the role mapping for the SuperDevRole IAM role
curl -X PUT "https://$OPENSEARCH_ENDPOINT/_plugins/_security/api/rolesmapping/super_dev_role" \
  -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  -H 'Content-Type: application/json' \
  -d "{
    \"backend_roles\": [\"$SUPER_DEV_ROLE_ARN\"],
    \"hosts\": [],
    \"users\": []
  }"

if [ $? -ne 0 ]; then
  echo "Failed to create/update role mapping"
  exit 1
fi

echo "Role mapping created/updated successfully"

# Verify the setup
echo "Verifying role configuration..."
curl -X GET "https://$OPENSEARCH_ENDPOINT/_plugins/_security/api/roles/super_dev_role" \
  -u "$ADMIN_USERNAME:$ADMIN_PASSWORD"

echo ""
echo "Verifying role mapping..."
curl -X GET "https://$OPENSEARCH_ENDPOINT/_plugins/_security/api/rolesmapping/super_dev_role" \
  -u "$ADMIN_USERNAME:$ADMIN_PASSWORD"

echo ""
echo "Setup complete!"
echo ""
echo "USAGE INSTRUCTIONS:"
echo "1. After applying Terraform changes with 'terraform apply':"
echo "2. Get the OpenSearch endpoint with: terraform output -raw opensearch_endpoint"
echo "3. Get the SuperDevRole ARN with: terraform output -raw super_dev_role_arn"
echo "4. Update this script with those values and your admin password"
echo "5. Run this script to configure the OpenSearch roles"
echo "6. You can now use the SuperDevRole to access OpenSearch with full permissions"