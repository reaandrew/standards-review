# Create a "SuperDevRole" IAM role for development access to OpenSearch
resource "aws_iam_role" "super_dev_role" {
  name = "SuperDevRole"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Action = "sts:AssumeRole",
      Effect = "Allow",
      Principal = {
        AWS = data.aws_caller_identity.current.account_id
      }
    }]
  })

  tags = {
    Description = "Role for development access to OpenSearch with full permissions"
  }
}

# Policy that grants full access to OpenSearch
resource "aws_iam_policy" "super_dev_policy" {
  name        = "SuperDevOpenSearchPolicy"
  description = "Policy granting full access to OpenSearch for development"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = "es:*",
        Resource = [
          aws_opensearch_domain.semantic_search.arn,
          "${aws_opensearch_domain.semantic_search.arn}/*"
        ]
      }
    ]
  })
}

# Attach the policy to the SuperDevRole
resource "aws_iam_role_policy_attachment" "super_dev_policy_attachment" {
  role       = aws_iam_role.super_dev_role.name
  policy_arn = aws_iam_policy.super_dev_policy.arn
}

# Output the Super Dev Role ARN for use in role mapping setup
output "super_dev_role_arn" {
  value       = aws_iam_role.super_dev_role.arn
  description = "ARN of the SuperDevRole for OpenSearch access"
}