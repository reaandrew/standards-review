provider "aws" {
  region = "eu-west-2"
}

terraform {
  backend "s3" {
    bucket         = "poc-standards-review-terraform-state"
    key            = "ci-setup/terraform.tfstate"
    region         = "eu-west-2"
    dynamodb_table = "poc-standards-review-terraform-locks"
    encrypt        = true
  }
}

resource "aws_iam_role" "ci_role" {
  name = "poc-standards-review-ci-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = "arn:aws:iam::889772146711:oidc-provider/token.actions.githubusercontent.com"
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = [
              "repo:reaandrew/standards-review:ref:refs/heads/main",
              "repo:reaandrew/standards-review:ref:refs/heads/feature/*",
              "repo:reaandrew/standards-review:ref:refs/tags/*"
            ]
          }
        }
      }
    ]
  })
}

resource "aws_iam_policy" "ci_policy" {
  name        = "poc-standards-review-ci-policy"
  description = "IAM policy for CI terraform operations"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "*"
        Resource = [
          "arn:aws:s3:::poc-standards-review-terraform-state*",
          "arn:aws:s3:::poc-standards-review-pdf-source*",
          "arn:aws:s3:::poc-standards-review-text-destination*",
          "arn:aws:dynamodb:*:*:table/poc-standards-review-terraform-locks",
          "arn:aws:iam::*:role/poc-standards-review-*",
          "arn:aws:lambda:*:*:function/poc-standards-review-*",
          "arn:aws:apigateway:*:*:*/poc-standards-review-*",
          "arn:aws:sns:*:*:poc-standards-review-*"
        ]
      },
      {
        Effect   = "Allow"
        Action   = [
          "textract:*"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ci_policy_attach" {
  role       = aws_iam_role.ci_role.name
  policy_arn = aws_iam_policy.ci_policy.arn
}