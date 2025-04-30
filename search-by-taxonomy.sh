#!/bin/bash
# search-by-taxonomy.sh - Invokes the search lambda by taxonomy ID
# Usage: ./search-by-taxonomy.sh <taxonomy_id> [include_child_taxonomies]
# Example: ./search-by-taxonomy.sh SEC-MEDIA-POL true
#
# Working taxonomy examples:
# - SEC-MEDIA-POL (Media & Device Handling Policy)
# - SEC-DATA-DAR (Data-at-Rest)
# - SEC-DATA-DIT (Data-in-Transit)
# - SEC-INFRA-CON (Container Security)
# - GOV-POL (Strategy & Policy)

if [ -z "$1" ]; then
  echo "Error: Taxonomy ID is required"
  echo "Usage: ./search-by-taxonomy.sh <taxonomy_id> [include_child_taxonomies]"
  exit 1
fi

TAXONOMY_ID=$1
INCLUDE_CHILDREN=${2:-false}

echo "Searching for documents with taxonomy ID: $TAXONOMY_ID"
echo "Include child taxonomies: $INCLUDE_CHILDREN"

aws-vault exec ee-sandbox -- aws lambda invoke \
  --function-name poc-standards-review-search-lambda \
  --payload "{\"taxonomyId\": \"$TAXONOMY_ID\", \"includeChildTaxonomies\": $INCLUDE_CHILDREN}" \
  --cli-binary-format raw-in-base64-out \
  response.json

echo "Search results saved to response.json"
cat response.json | jq