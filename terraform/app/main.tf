provider "aws" {
  region = "eu-west-2"
}

terraform {
  backend "s3" {
    bucket         = "poc-standards-review-terraform-state"
    key            = "app/terraform.tfstate"
    region         = "eu-west-2"
    dynamodb_table = "poc-standards-review-terraform-locks"
    encrypt        = true
  }
}

# Source and destination S3 buckets
resource "aws_s3_bucket" "pdf_source" {
  bucket = "poc-standards-review-pdf-source"
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
  bucket = "poc-standards-review-text-destination"
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
  name = "poc-standards-review-textract-lambda-role"

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

# IAM role that allows Textract to publish to SNS
resource "aws_iam_role" "textract_service_role" {
  name = "poc-standards-review-textract-service-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Action = "sts:AssumeRole",
      Effect = "Allow",
      Principal = {
        Service = "textract.amazonaws.com"
      }
    }]
  })
}

# Policy for Textract Lambda
resource "aws_iam_policy" "textract_lambda_policy" {
  name        = "poc-standards-review-textract-lambda-policy"
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
          "textract:GetDocumentAnalysis",
          "textract:AnalyzeDocument",
          "textract:DetectDocumentText",
          "textract:GetDocumentTextDetection"
        ],
        Resource = "*"
      },
      {
        Effect = "Allow",
        Action = [
          "sns:Publish"
        ],
        Resource = aws_sns_topic.textract_completion.arn
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
  name = "poc-standards-review-textract-completion"
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

# Policy for Textract service role to publish to SNS
resource "aws_iam_policy" "textract_service_policy" {
  name        = "poc-standards-review-textract-service-policy"
  description = "Policy for Textract service to publish to SNS"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "sns:Publish"
        ],
        Resource = aws_sns_topic.textract_completion.arn
      }
    ]
  })
}

# Attach the policy to the Textract service role
resource "aws_iam_role_policy_attachment" "textract_service_policy_attachment" {
  role       = aws_iam_role.textract_service_role.name
  policy_arn = aws_iam_policy.textract_service_policy.arn
}

# Lambda function for initiating Textract analysis
resource "aws_lambda_function" "textract_lambda" {
  function_name = "poc-standards-review-textract-lambda"
  filename      = "${path.module}/../lambdas/textract-lambda.zip"
  source_code_hash = filebase64sha256("${path.module}/../lambdas/textract-lambda.zip")
  handler       = "index.handler"
  runtime       = "nodejs18.x"
  timeout       = 30
  role          = aws_iam_role.textract_lambda_role.arn
  
  environment {
    variables = {
      DESTINATION_BUCKET = aws_s3_bucket.text_destination.bucket
      SNS_TOPIC_ARN     = aws_sns_topic.textract_completion.arn
      TEXTRACT_ROLE_ARN = aws_iam_role.textract_service_role.arn
    }
  }

  depends_on = [
    aws_iam_role.textract_service_role,
    aws_iam_role_policy_attachment.textract_service_policy_attachment,
    aws_iam_role_policy_attachment.textract_lambda_basic_execution,
    aws_iam_role_policy_attachment.textract_lambda_policy_attachment,
    aws_sns_topic.textract_completion,
    aws_sns_topic_policy.textract_completion
  ]
}

# Lambda function for handling Textract completion notifications
resource "aws_lambda_function" "textract_completion_lambda" {
  function_name = "poc-standards-review-textract-completion-handler"
  filename      = "${path.module}/../lambdas/textract-lambda.zip"
  source_code_hash = filebase64sha256("${path.module}/../lambdas/textract-lambda.zip")
  handler       = "completion-handler.handler"
  runtime       = "nodejs18.x"
  timeout       = 120
  role          = aws_iam_role.textract_lambda_role.arn
  
  environment {
    variables = {
      DESTINATION_BUCKET = aws_s3_bucket.text_destination.bucket
      SNS_TOPIC_ARN     = aws_sns_topic.textract_completion.arn
      TEXTRACT_ROLE_ARN = aws_iam_role.textract_service_role.arn
    }
  }

  depends_on = [
    aws_iam_role.textract_service_role,
    aws_iam_role_policy_attachment.textract_service_policy_attachment,
    aws_iam_role_policy_attachment.textract_lambda_basic_execution,
    aws_iam_role_policy_attachment.textract_lambda_policy_attachment,
    aws_sns_topic.textract_completion,
    aws_sns_topic_policy.textract_completion
  ]
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

# Permission for S3 to invoke the Lambda
resource "aws_lambda_permission" "allow_s3" {
  statement_id  = "AllowExecutionFromS3ForTextractLambda"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.textract_lambda.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.pdf_source.arn
}

# S3 event notification to trigger the Lambda when a PDF is uploaded
resource "aws_s3_bucket_notification" "pdf_upload_notification" {
  bucket = aws_s3_bucket.pdf_source.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.textract_lambda.arn
    events              = ["s3:ObjectCreated:*"]
    filter_suffix       = ".pdf"
  }

  depends_on = [
    aws_lambda_permission.allow_s3,
    aws_s3_bucket.pdf_source
  ]
}

# Bucket for storing text chunks
resource "aws_s3_bucket" "chunks_destination" {
  bucket = "poc-standards-review-chunks-destination"
}

resource "aws_s3_bucket_ownership_controls" "chunks_destination" {
  bucket = aws_s3_bucket.chunks_destination.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_acl" "chunks_destination" {
  depends_on = [aws_s3_bucket_ownership_controls.chunks_destination]
  bucket = aws_s3_bucket.chunks_destination.id
  acl    = "private"
}

# IAM role for the chunking Lambda function
resource "aws_iam_role" "chunking_lambda_role" {
  name = "poc-standards-review-chunking-lambda-role"

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

# Policy for chunking Lambda
resource "aws_iam_policy" "chunking_lambda_policy" {
  name        = "poc-standards-review-chunking-lambda-policy"
  description = "Policy for chunking Lambda function"

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
        Resource = "${aws_s3_bucket.text_destination.arn}/*"
      },
      {
        Effect = "Allow",
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket"
        ],
        Resource = [
          "${aws_s3_bucket.chunks_destination.arn}",
          "${aws_s3_bucket.chunks_destination.arn}/*"
        ]
      },
      {
        Effect = "Allow",
        Action = [
          "bedrock:InvokeModel"
        ],
        Resource = [
          "arn:aws:bedrock:eu-west-2::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0",
          "arn:aws:bedrock:eu-west-2::foundation-model/anthropic.claude-3-haiku-20240307-v1:0"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "chunking_lambda_policy_attachment" {
  role       = aws_iam_role.chunking_lambda_role.name
  policy_arn = aws_iam_policy.chunking_lambda_policy.arn
}

# Basic Lambda execution policy
resource "aws_iam_role_policy_attachment" "chunking_lambda_basic_execution" {
  role       = aws_iam_role.chunking_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Lambda function for chunking text files
resource "aws_lambda_function" "chunking_lambda" {
  function_name = "poc-standards-review-chunking-lambda"
  filename      = "${path.module}/../lambdas/chunking-lambda.zip"
  source_code_hash = filebase64sha256("${path.module}/../lambdas/chunking-lambda.zip")
  handler       = "index.handler"
  runtime       = "nodejs18.x"
  timeout       = 60  # Allow up to 1 minute for processing large files
  memory_size   = 256 # Allocate more memory for text processing
  role          = aws_iam_role.chunking_lambda_role.arn
  
  environment {
    variables = {
      CHUNKS_BUCKET = aws_s3_bucket.chunks_destination.bucket,
      BEDROCK_MODEL_ID = "anthropic.claude-3-sonnet-20240229-v1:0"
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.chunking_lambda_basic_execution,
    aws_iam_role_policy_attachment.chunking_lambda_policy_attachment
  ]
}

# Permission for S3 to invoke the Lambda
resource "aws_lambda_permission" "allow_text_bucket" {
  statement_id  = "AllowExecutionFromS3ForChunkingLambda"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.chunking_lambda.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.text_destination.arn
}

# S3 event notification to trigger the Lambda when a text file is uploaded
resource "aws_s3_bucket_notification" "text_upload_notification" {
  bucket = aws_s3_bucket.text_destination.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.chunking_lambda.arn
    events              = ["s3:ObjectCreated:*"]
    filter_suffix       = ".txt"
  }

  depends_on = [
    aws_lambda_permission.allow_text_bucket,
    aws_s3_bucket.text_destination
  ]
}

# Output the Textract Service Role ARN for verification
output "textract_service_role_arn" {
  value = aws_iam_role.textract_service_role.arn
  description = "ARN of the IAM role for Textract to publish to SNS"
}