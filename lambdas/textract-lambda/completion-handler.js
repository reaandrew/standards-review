const AWS = require('aws-sdk');
const textract = new AWS.Textract();
const s3 = new AWS.S3();

// Configure the destination bucket for extracted text
const DESTINATION_BUCKET = process.env.DESTINATION_BUCKET;

exports.handler = async (event) => {
  try {
    // Extract job details from SNS message
    const message = JSON.parse(event.Records[0].Sns.Message);
    const jobId = message.JobId;
    
    console.log(`Processing completed Textract job: ${jobId}`);
    
    // Get the job information we stored
    const jobInfoObjects = await s3.listObjects({
      Bucket: DESTINATION_BUCKET,
      Prefix: `jobs/${jobId}`
    }).promise();
    
    if (!jobInfoObjects.Contents || jobInfoObjects.Contents.length === 0) {
      throw new Error(`Could not find job info for job ID: ${jobId}`);
    }
    
    const jobInfoObject = await s3.getObject({
      Bucket: DESTINATION_BUCKET,
      Key: jobInfoObjects.Contents[0].Key
    }).promise();
    
    const jobInfo = JSON.parse(jobInfoObject.Body.toString());
    const destinationKey = jobInfo.destinationKey;
    
    // Get the Textract results
    let nextToken = null;
    let pages = [];
    
    do {
      const params = {
        JobId: jobId,
        NextToken: nextToken
      };
      
      const textractResponse = await textract.getDocumentAnalysis(params).promise();
      pages = pages.concat(textractResponse.Blocks);
      nextToken = textractResponse.NextToken;
    } while (nextToken);
    
    // Extract text content from the Textract results
    const extractedText = extractTextFromBlocks(pages);
    
    // Save the extracted text to S3
    await s3.putObject({
      Bucket: DESTINATION_BUCKET,
      Key: destinationKey,
      Body: extractedText,
      ContentType: 'text/plain'
    }).promise();
    
    console.log(`Saved extracted text to s3://${DESTINATION_BUCKET}/${destinationKey}`);
    
    return {
      statusCode: 200,
      body: `Successfully processed Textract job ${jobId} and saved results to ${destinationKey}`
    };
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};

// Helper function to extract text from Textract blocks
function extractTextFromBlocks(blocks) {
  const textBlocks = blocks.filter(block => block.BlockType === 'LINE');
  const sortedBlocks = textBlocks.sort((a, b) => {
    // Sort by page, then y-coordinate, then x-coordinate
    if (a.Page !== b.Page) return a.Page - b.Page;
    if (Math.abs(a.Geometry.BoundingBox.Top - b.Geometry.BoundingBox.Top) > 0.01) {
      return a.Geometry.BoundingBox.Top - b.Geometry.BoundingBox.Top;
    }
    return a.Geometry.BoundingBox.Left - b.Geometry.BoundingBox.Left;
  });
  
  return sortedBlocks.map(block => block.Text).join('\n');
}