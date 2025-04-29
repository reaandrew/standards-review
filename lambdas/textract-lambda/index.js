const AWS = require('aws-sdk');
const textract = new AWS.Textract();
const s3 = new AWS.S3();

// Configure the destination bucket for extracted text
const DESTINATION_BUCKET = process.env.DESTINATION_BUCKET;

exports.handler = async (event) => {
  try {
    // Get the S3 bucket and key from the event
    const sourceBucket = event.Records[0].s3.bucket.name;
    const sourceKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
    
    console.log(`Processing file: s3://${sourceBucket}/${sourceKey}`);
    
    // Validate that the key has a top-level directory but no subdirectories
    const keyParts = sourceKey.split('/');
    
    if (keyParts.length !== 2) {
      throw new Error('Invalid file path. Files must be stored in a top-level directory with no subdirectories. Example: nist/document.pdf');
    }
    
    const standardType = keyParts[0]; // e.g., 'sans', 'nist', 'ncsc'
    const fileName = keyParts[1];
    
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
      OutputConfig: {
        S3Bucket: DESTINATION_BUCKET,
        S3Prefix: `${standardType}/textract-output/`
      },
      FeatureTypes: ['TABLES', 'FORMS']
    };
    
    // Start the async Textract job
    const textractResponse = await textract.startDocumentAnalysis(params).promise();
    console.log(`Started Textract job: ${textractResponse.JobId}`);
    
    // Create a destination filename for the extracted text
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