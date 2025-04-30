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
    
    // Log the full SNS message for debugging
    console.log('Complete SNS message:', JSON.stringify(message, null, 2));
    
    // Get the job information we stored
    console.log(`Looking for job info for job ID: ${jobId}`);
    
    // Look for the job info file
    const jobFiles = await s3.listObjects({
      Bucket: DESTINATION_BUCKET,
      Prefix: `jobs/${jobId}.json`
    }).promise();
    
    // If no results found, try looking in the standard type subdirectories
    let foundJobInfo = false;
    let jobInfo;
    let destinationKey;
    
    if (jobFiles.Contents && jobFiles.Contents.length > 0) {
      foundJobInfo = true;
      const jobInfoObject = await s3.getObject({
        Bucket: DESTINATION_BUCKET,
        Key: jobFiles.Contents[0].Key
      }).promise();
      
      jobInfo = JSON.parse(jobInfoObject.Body.toString());
      console.log(`Found job info: ${JSON.stringify(jobInfo)}`);
      destinationKey = jobInfo.destinationKey;
    } else {
      // Search in all directories
      const allObjects = await s3.listObjects({
        Bucket: DESTINATION_BUCKET
      }).promise();
      
      // Filter to find job info files matching this job ID
      const matchingFiles = allObjects.Contents.filter(item => 
        item.Key.includes('/jobs/') && item.Key.includes(jobId)
      );
      
      if (matchingFiles.length > 0) {
        foundJobInfo = true;
        console.log(`Found job info in location: ${matchingFiles[0].Key}`);
        
        const jobInfoObject = await s3.getObject({
          Bucket: DESTINATION_BUCKET,
          Key: matchingFiles[0].Key
        }).promise();
        
        jobInfo = JSON.parse(jobInfoObject.Body.toString());
        console.log(`Found job info: ${JSON.stringify(jobInfo)}`);
        destinationKey = jobInfo.destinationKey;
      } else {
        // Fallback if job info not found
        console.warn(`Could not find job info for job ID: ${jobId}`);
        // Use a default destination key based on job ID as fallback
        destinationKey = `extracted/${jobId}.txt`;
      }
    }
    
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
    const bucket = jobInfo && jobInfo.destinationBucket ? jobInfo.destinationBucket : DESTINATION_BUCKET;
    
    await s3.putObject({
      Bucket: bucket,
      Key: destinationKey,
      Body: extractedText,
      ContentType: 'text/plain'
    }).promise();
    
    console.log(`Saved extracted text to s3://${bucket}/${destinationKey}`);
    
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
  
  // Group blocks by page
  const pageGroups = {};
  sortedBlocks.forEach(block => {
    const pageNum = block.Page || 1; // Default to page 1 if not specified
    if (!pageGroups[pageNum]) {
      pageGroups[pageNum] = [];
    }
    pageGroups[pageNum].push(block);
  });
  
  // Build text with page numbers
  let extractedText = '';
  Object.keys(pageGroups).sort((a, b) => parseInt(a) - parseInt(b)).forEach(pageNum => {
    extractedText += `\n\n===== PAGE ${pageNum} =====\n\n`;
    extractedText += pageGroups[pageNum].map(block => block.Text).join('\n');
  });
  
  return extractedText.trim();
}