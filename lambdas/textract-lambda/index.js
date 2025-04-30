const AWS = require('aws-sdk');
const textract = new AWS.Textract();
const s3 = new AWS.S3();

// Configure the destination bucket for extracted text
const DESTINATION_BUCKET = process.env.DESTINATION_BUCKET;

exports.handler = async (event) => {
  try {
    // Debug: Log the entire event
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    // Debug environment variables
    console.log("ENV DESTINATION_BUCKET:", process.env.DESTINATION_BUCKET);
    console.log("ENV SNS_TOPIC_ARN:", process.env.SNS_TOPIC_ARN);
    console.log("ENV TEXTRACT_ROLE_ARN:", process.env.TEXTRACT_ROLE_ARN);

    // Get the S3 bucket and key from the event
    const sourceBucket = event.Records[0].s3.bucket.name;
    const sourceKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
    
    console.log(`Processing file: s3://${sourceBucket}/${sourceKey}`);
    
    // Extract the directory structure and filename
    const keyParts = sourceKey.split('/');
    
    // Handle files in root, single directory, or nested directories
    let standardType = 'default';
    let fileName = '';
    
    if (keyParts.length === 1) {
      // File is in the root of the bucket
      fileName = keyParts[0];
    } else {
      // File is in a directory
      fileName = keyParts.pop(); // Get the last part (the filename)
      standardType = keyParts[0]; // Use the first directory as the standard type
    }
    
    console.log(`Processing file with standardType: ${standardType}, fileName: ${fileName}`);
    
    // Validate it's a PDF file
    if (!fileName.toLowerCase().endsWith('.pdf')) {
      throw new Error('Only PDF files can be processed');
    }
    
    // Create a Textract document detection job
    const params = {
      DocumentLocation: {
        S3Object: {
          Bucket: sourceBucket,
          Name: sourceKey
        }
      },
      FeatureTypes: ['TABLES', 'FORMS'],
      NotificationChannel: {
        SNSTopicArn: process.env.SNS_TOPIC_ARN,
        RoleArn: process.env.TEXTRACT_ROLE_ARN
      }
    };
    
    // Log parameters for debugging
    console.log("Textract parameters:", JSON.stringify(params, null, 2));
    
    // Log environment variables for debugging
    console.log('TEXTRACT_ROLE_ARN value:', JSON.stringify(process.env.TEXTRACT_ROLE_ARN));
    console.log('SNS_TOPIC_ARN value:', JSON.stringify(process.env.SNS_TOPIC_ARN));
    
    // Check if we have all required environment variables (checking for null, undefined, or empty string)
    if (!process.env.TEXTRACT_ROLE_ARN || process.env.TEXTRACT_ROLE_ARN.trim() === '' || 
        !process.env.SNS_TOPIC_ARN || process.env.SNS_TOPIC_ARN.trim() === '') {
      console.warn('TEXTRACT_ROLE_ARN or SNS_TOPIC_ARN missing or empty – running without notifications');
      delete params.NotificationChannel;
      delete params.OutputConfig;
    }
    
    // Start the async Textract job
    const textractResponse = await textract.startDocumentAnalysis(params).promise();
    console.log(`Started Textract job: ${textractResponse.JobId}`);
    
    // Create a destination filename for the extracted text
    // Use the same path structure as the input but with .txt extension
    const textFileName = fileName.replace(/\.pdf$/i, '.txt');
    const destinationKey = `${standardType}/${textFileName}`;
    
    // Store job info in S3 for tracking (since this is async)
    await s3.putObject({
      Bucket: DESTINATION_BUCKET,
      Key: `${standardType}/jobs/${textractResponse.JobId}.json`,
      Body: JSON.stringify({
        jobId: textractResponse.JobId,
        sourceBucket,
        sourceKey,
        destinationBucket: DESTINATION_BUCKET,
        destinationKey,
        startTime: new Date().toISOString()
      })
    }).promise();
    
    return {
      statusCode: 200,
      body: `Started Textract job ${textractResponse.JobId} for ${sourceKey}`
    };
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}