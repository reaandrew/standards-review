provider "aws" {
  region = "us-east-1"
}

terraform {
  backend "s3" {
    bucket         = "standards-review-terraform-state"
    key            = "ci-setup/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "standards-review-terraform-locks"
    encrypt        = true
  }
}

resource "aws_iam_role" "ci_role" {
  name = "standards-review-ci-role"

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
  name        = "standards-review-ci-policy"
  description = "IAM policy for CI terraform operations"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "*"
        Resource = [
          "arn:aws:s3:::standards-review-terraform-state*",
          "arn:aws:s3:::standards-review-pdf-source*",
          "arn:aws:s3:::standards-review-text-destination*",
          "arn:aws:dynamodb:*:*:table/standards-review-terraform-locks",
          "arn:aws:iam::*:role/standards-review-*",
          "arn:aws:lambda:*:*:function/standards-review-*",
          "arn:aws:apigateway:*:*:*/standards-review-*",
          "arn:aws:sns:*:*:standards-review-*"
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