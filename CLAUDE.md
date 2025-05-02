# Claude Helper Document

This document contains important information for Claude to use when working with this codebase.

## Deployment Commands

- **Full deployment**: `aws-vault exec ee-sandbox -- make deploy`
- **Lambda packaging only**: `aws-vault exec ee-sandbox -- make package-lambda`
- **Deploy app only**: `aws-vault exec ee-sandbox -- make deploy-app`
- **Setup OpenSearch roles**: `aws-vault exec ee-sandbox -- make setup-opensearch-roles PASSWORD=<password>`

## OpenSearch Configuration

### Field Mapping Considerations

- When searching for exact matches on fields like `topicTags` that are mapped as text fields with keyword subfields, use `.keyword` suffix in the query
- Example: Use `topicTags.keyword` instead of `topicTags` when doing terms queries
- This is important for taxonomy searches where exact matches are needed

### Authentication

- OpenSearch uses fine-grained access control with basic auth
- Master user credentials are defined in Terraform and provided to Lambdas via environment variables:
  - Username: `admin`
  - Password: `StrongPasswordHere123!`