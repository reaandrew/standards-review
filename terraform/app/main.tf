provider "aws" {
  region = "us-east-1"
}

terraform {
  backend "s3" {
    bucket         = "standards-review-terraform-state"
    key            = "app/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "standards-review-terraform-locks"
    encrypt        = true
  }
}

# Source and destination S3 buckets
resource "aws_s3_bucket" "pdf_source" {
  bucket = "standards-review-pdf-source"
}

resource "aws_s3_bucket_ownership_controls" "pdf_source" {
  bucket = aws_s3_bucket.pdf_source.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_acl" "pdf_source" {
  depends_on = [aws_s3_bucket_ownership_controls.pdf_source]
  bucket = aws_s3_bucket.pdf_source.id
  acl    = "private"
}

resource "aws_s3_bucket" "text_destination" {
  bucket = "standards-review-text-destination"
}

resource "aws_s3_bucket_ownership_controls" "text_destination" {
  bucket = aws_s3_bucket.text_destination.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_acl" "text_destination" {
  depends_on = [aws_s3_bucket_ownership_controls.text_destination]
  bucket = aws_s3_bucket.text_destination.id
  acl    = "private"
}

# IAM role for the Textract Lambda function
resource "aws_iam_role" "textract_lambda_role" {
  name = "standards-review-textract-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Action = "sts:AssumeRole",
      Effect = "Allow",
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

# Policy for Textract Lambda
resource "aws_iam_policy" "textract_lambda_policy" {
  name        = "standards-review-textract-lambda-policy"
  description = "Policy for Textract Lambda function"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow",
        Action = [
          "s3:GetObject"
        ],
        Resource = "${aws_s3_bucket.pdf_source.arn}/*"
      },
      {
        Effect = "Allow",
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket"
        ],
        Resource = [
          "${aws_s3_bucket.text_destination.arn}",
          "${aws_s3_bucket.text_destination.arn}/*"
        ]
      },
      {
        Effect = "Allow",
        Action = [
          "textract:StartDocumentAnalysis",
          "textract:GetDocumentAnalysis"
        ],
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "textract_lambda_policy_attachment" {
  role       = aws_iam_role.textract_lambda_role.name
  policy_arn = aws_iam_policy.textract_lambda_policy.arn
}

# Basic Lambda execution policy
resource "aws_iam_role_policy_attachment" "textract_lambda_basic_execution" {
  role       = aws_iam_role.textract_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# SNS Topic for Textract job notifications
resource "aws_sns_topic" "textract_completion" {
  name = "standards-review-textract-completion"
}

# SNS Topic policy
resource "aws_sns_topic_policy" "textract_completion" {
  arn    = aws_sns_topic.textract_completion.arn
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Principal = {
          Service = "textract.amazonaws.com"
        },
        Action = "sns:Publish",
        Resource = aws_sns_topic.textract_completion.arn
      }
    ]
  })
}

# Lambda function for initiating Textract analysis
resource "aws_lambda_function" "textract_lambda" {
  function_name = "standards-review-textract-lambda"
  filename      = "../lambdas/textract-lambda.zip"
  handler       = "index.handler"
  runtime       = "nodejs16.x"
  timeout       = 30
  role          = aws_iam_role.textract_lambda_role.arn
  
  environment {
    variables = {
      DESTINATION_BUCKET = aws_s3_bucket.text_destination.bucket
      SNS_TOPIC_ARN     = aws_sns_topic.textract_completion.arn
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.textract_lambda_basic_execution,
    aws_iam_role_policy_attachment.textract_lambda_policy_attachment
  ]

  lifecycle {
    ignore_changes = [filename]
  }
}

# Lambda function for handling Textract completion notifications
resource "aws_lambda_function" "textract_completion_lambda" {
  function_name = "standards-review-textract-completion-handler"
  filename      = "../lambdas/textract-completion-handler.zip"
  handler       = "completion-handler.handler"
  runtime       = "nodejs16.x"
  timeout       = 120
  role          = aws_iam_role.textract_lambda_role.arn
  
  environment {
    variables = {
      DESTINATION_BUCKET = aws_s3_bucket.text_destination.bucket
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.textract_lambda_basic_execution,
    aws_iam_role_policy_attachment.textract_lambda_policy_attachment
  ]

  lifecycle {
    ignore_changes = [filename]
  }
}

# Subscribe the completion handler Lambda to the SNS topic
resource "aws_sns_topic_subscription" "textract_completion_subscription" {
  topic_arn = aws_sns_topic.textract_completion.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.textract_completion_lambda.arn
}

# Permission for SNS to invoke the Lambda
resource "aws_lambda_permission" "textract_completion_lambda_permission" {
  statement_id  = "AllowExecutionFromSNS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.textract_completion_lambda.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.textract_completion.arn
}

# S3 event notification to trigger the Lambda when a PDF is uploaded
resource "aws_s3_bucket_notification" "pdf_upload_notification" {
  bucket = aws_s3_bucket.pdf_source.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.textract_lambda.arn
    events              = ["s3:ObjectCreated:*"]
    filter_suffix       = ".pdf"
  }

  depends_on = [aws_lambda_permission.allow_s3]
}

# Permission for S3 to invoke the Lambda
resource "aws_lambda_permission" "allow_s3" {
  statement_id  = "AllowExecutionFromS3"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.textract_lambda.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.pdf_source.arn
}