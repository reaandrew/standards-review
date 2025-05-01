#!/bin/bash
# Wrapper script to get OpenSearch endpoint and SuperDevRole ARN from Terraform outputs
# and call the main setup script

# Change to the app directory
cd "$(dirname "$0")"

# Get values from Terraform outputs
OS_ENDPOINT=$(terraform output -raw opensearch_endpoint)
ROLE_ARN=$(terraform output -raw super_dev_role_arn)

# Check if we got valid outputs
if [ -z "$OS_ENDPOINT" ] || [ "$OS_ENDPOINT" == "null" ]; then
  echo "ERROR: Failed to get OpenSearch endpoint from Terraform output"
  exit 1
fi

if [ -z "$ROLE_ARN" ] || [ "$ROLE_ARN" == "null" ]; then
  echo "ERROR: Failed to get SuperDevRole ARN from Terraform output"
  exit 1
fi

# Check if password is provided as argument or environment variable
if [ -z "$1" ] && [ -z "$OS_PASSWORD" ]; then
  echo "ERROR: Admin password not provided"
  echo "Usage: $0 <admin_password>"
  echo "Or set OS_PASSWORD environment variable"
  exit 1
fi

# Set password from argument if provided
if [ -n "$1" ]; then
  OS_PASSWORD="$1"
fi

# Export variables for the main script
export OS_ENDPOINT
export OS_PASSWORD
export ROLE_ARN

# Call the main setup script
exec ../../setup-opensearch-roles.sh