const AWS = require('aws-sdk');
const s3 = new AWS.S3();

// Configure the destination bucket for chunks
const CHUNKS_BUCKET = process.env.CHUNKS_BUCKET;

// Custom text splitter function
function splitTextIntoChunks(text, chunkSize = 1000, chunkOverlap = 200) {
  // First try to split by double newlines (paragraphs)
  const paragraphs = text.split('\n\n');
  let chunks = [];
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    // If adding this paragraph would exceed chunk size, save current chunk and start a new one
    if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk);
      // Keep overlap from the end of the current chunk
      currentChunk = currentChunk.slice(-chunkOverlap) + paragraph;
    } else {
      // Add paragraph to current chunk
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }
  
  // Add the last chunk if it's not empty
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  
  // If chunks are still too large, split them further by newlines
  const result = [];
  for (const chunk of chunks) {
    if (chunk.length > chunkSize) {
      result.push(...splitByDelimiter(chunk, '\n', chunkSize, chunkOverlap));
    } else {
      result.push(chunk);
    }
  }
  
  return result;
}

// Helper function to split text by a specific delimiter
function splitByDelimiter(text, delimiter, chunkSize, chunkOverlap) {
  const lines = text.split(delimiter);
  let chunks = [];
  let currentChunk = '';
  
  for (const line of lines) {
    // If adding this line would exceed chunk size, save current chunk and start a new one
    if (currentChunk.length + line.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk);
      // Keep overlap from the end of the current chunk
      currentChunk = currentChunk.slice(-chunkOverlap) + line;
    } else {
      // Add line to current chunk
      currentChunk += (currentChunk ? delimiter : '') + line;
    }
  }
  
  // Add the last chunk if it's not empty
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  
  // If chunks are still too large, split them further by spaces
  const result = [];
  for (const chunk of chunks) {
    if (chunk.length > chunkSize) {
      result.push(...splitByDelimiter(chunk, ' ', chunkSize, chunkOverlap));
    } else {
      result.push(chunk);
    }
  }
  
  return result;
}

exports.handler = async (event) => {
  try {
    // Debug: Log the entire event
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    // Debug environment variables
    console.log("ENV CHUNKS_BUCKET:", process.env.CHUNKS_BUCKET);

    // Get the S3 bucket and key from the event
    const sourceBucket = event.Records[0].s3.bucket.name;
    const sourceKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
    
    // Skip processing if this is a job info or chunks file
    if (sourceKey.includes('/jobs/') || sourceKey.includes('/chunks/')) {
      console.log(`Skipping processing of job info or chunks file: ${sourceKey}`);
      return {
        statusCode: 200,
        body: `Skipped processing of ${sourceKey}`
      };
    }
    
    console.log(`Processing file: s3://${sourceBucket}/${sourceKey}`);
    
    // Extract directory path from key for maintaining the same structure
    const keyParts = sourceKey.split('/');
    const fileName = keyParts.pop();
    const directoryPath = keyParts.join('/');
    
    // Get the object from S3
    const data = await s3.getObject({
      Bucket: sourceBucket,
      Key: sourceKey
    }).promise();
    
    // Convert the Buffer to a string
    const textContent = data.Body.toString('utf-8');
    
    // Split the text into chunks using our custom function
    const chunkTexts = splitTextIntoChunks(textContent, 1000, 200);
    console.log(`Split text into ${chunkTexts.length} chunks`);
    
    // Create a metadata file that includes all chunks with their metadata
    const chunksMetadata = chunkTexts.map((chunkText, index) => ({
      id: `${sourceKey}-chunk-${index}`,
      text: chunkText,
      metadata: {
        sourceBucket,
        sourceKey,
        sourceFile: fileName,
        chunkIndex: index,
        totalChunks: chunkTexts.length
      }
    }));
    
    // Save the chunks metadata to S3
    await s3.putObject({
      Bucket: CHUNKS_BUCKET,
      Key: `${directoryPath}/chunks/${fileName.replace(/\.[^/.]+$/, '')}.json`,
      Body: JSON.stringify(chunksMetadata, null, 2),
      ContentType: 'application/json'
    }).promise();
    
    console.log(`Saved ${chunkTexts.length} chunks to s3://${CHUNKS_BUCKET}/${directoryPath}/chunks/${fileName.replace(/\.[^/.]+$/, '')}.json`);
    
    return {
      statusCode: 200,
      body: `Processed ${sourceKey} and generated ${chunkTexts.length} chunks`
    };
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};