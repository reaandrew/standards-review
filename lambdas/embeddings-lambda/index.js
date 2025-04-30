const AWS = require('aws-sdk');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

// Configure S3 and Bedrock clients
const s3 = new AWS.S3();
const bedrockClient = new BedrockRuntimeClient({ region: 'eu-west-2' });

// Environment variables
const EMBEDDINGS_BUCKET = process.env.EMBEDDINGS_BUCKET;
const EMBEDDING_MODEL_ID = process.env.EMBEDDING_MODEL_ID || 'amazon.titan-embed-text-v2:0';
const MAX_BATCH_SIZE = 10; // Maximum items to process in one batch

/**
 * Generate embeddings for text using Amazon Titan
 * @param {string} text - Text content to embed
 * @returns {Promise<Array<number>>} - Vector embedding
 */
async function generateEmbedding(text) {
  try {
    // Clean and prepare the text
    const cleanedText = text.trim();
    
    // Skip if text is empty
    if (!cleanedText) {
      console.warn('Empty text provided for embedding, returning empty vector');
      return [];
    }
    
    // Create payload for Titan embedding model
    const payload = {
      inputText: cleanedText
    };
    
    // Invoke the Titan embedding model
    const command = new InvokeModelCommand({
      modelId: EMBEDDING_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload)
    });
    
    // Send the request
    const response = await bedrockClient.send(command);
    
    // Parse the response body
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    // Extract the embedding vector
    const embedding = responseBody.embedding;
    
    return embedding;
  } catch (error) {
    console.error(`Error generating embedding: ${error.message}`);
    throw error;
  }
}

/**
 * Process chunks file from S3 and generate embeddings
 * @param {string} bucket - Source S3 bucket
 * @param {string} key - S3 object key
 * @returns {Promise<object>} - Processing results
 */
async function processChunksFile(bucket, key) {
  try {
    console.log(`Processing chunks file: s3://${bucket}/${key}`);
    
    // Get the chunks file from S3
    const data = await s3.getObject({
      Bucket: bucket,
      Key: key
    }).promise();
    
    // Parse the chunks file
    const chunksData = JSON.parse(data.Body.toString('utf-8'));
    
    // Extract directory path and filename
    const keyParts = key.split('/');
    const fileName = keyParts.pop().replace('.json', '');
    const directoryPath = keyParts.join('/');
    
    // Results tracking
    const results = {
      processedChunks: 0,
      failedChunks: 0,
      errors: []
    };
    
    // Process chunks in batches to manage memory and execution time
    for (let i = 0; i < chunksData.length; i += MAX_BATCH_SIZE) {
      const batchChunks = chunksData.slice(i, i + MAX_BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / MAX_BATCH_SIZE) + 1} of ${Math.ceil(chunksData.length / MAX_BATCH_SIZE)}, size: ${batchChunks.length}`);
      
      // Process each chunk in the batch concurrently
      const batchPromises = batchChunks.map(async (chunk) => {
        try {
          // Generate embedding for this chunk
          const embedding = await generateEmbedding(chunk.text);
          
          // Create the enhanced chunk with embedding
          const enhancedChunk = {
            ...chunk,
            embedding: embedding
          };
          
          // Save the individual chunk with embedding to S3
          const chunkKey = `${directoryPath}/embeddings/${fileName}-chunk-${chunk.metadata.chunkId}.json`;
          await s3.putObject({
            Bucket: EMBEDDINGS_BUCKET,
            Key: chunkKey,
            Body: JSON.stringify(enhancedChunk),
            ContentType: 'application/json'
          }).promise();
          
          results.processedChunks++;
          return { success: true, chunkId: chunk.metadata.chunkId };
        } catch (error) {
          console.error(`Error processing chunk ${chunk.metadata.chunkId}: ${error.message}`);
          results.failedChunks++;
          results.errors.push({
            chunkId: chunk.metadata.chunkId,
            error: error.message
          });
          return { success: false, chunkId: chunk.metadata.chunkId, error: error.message };
        }
      });
      
      // Wait for all chunks in this batch to be processed
      await Promise.all(batchPromises);
      
      // Small delay between batches to avoid rate limiting
      if (i + MAX_BATCH_SIZE < chunksData.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    // Create and save a manifest file
    const manifest = {
      source: {
        bucket: bucket,
        key: key
      },
      output: {
        bucket: EMBEDDINGS_BUCKET,
        prefix: `${directoryPath}/embeddings/`
      },
      stats: {
        totalChunks: chunksData.length,
        processedChunks: results.processedChunks,
        failedChunks: results.failedChunks
      },
      model: EMBEDDING_MODEL_ID,
      timestamp: new Date().toISOString()
    };
    
    // Save the embeddings manifest
    await s3.putObject({
      Bucket: EMBEDDINGS_BUCKET,
      Key: `${directoryPath}/metadata/${fileName}_embeddings_manifest.json`,
      Body: JSON.stringify(manifest, null, 2),
      ContentType: 'application/json'
    }).promise();
    
    console.log(`Embedding processing completed for ${key}. Processed ${results.processedChunks} chunks, failed ${results.failedChunks} chunks.`);
    
    return {
      status: 'success',
      manifest: manifest,
      results: results
    };
  } catch (error) {
    console.error(`Error processing chunks file ${key}: ${error.message}`);
    throw error;
  }
}

/**
 * Lambda handler
 */
exports.handler = async (event) => {
  try {
    console.log('Event:', JSON.stringify(event, null, 2));
    console.log('EMBEDDINGS_BUCKET:', EMBEDDINGS_BUCKET);
    console.log('EMBEDDING_MODEL_ID:', EMBEDDING_MODEL_ID);
    
    if (!EMBEDDINGS_BUCKET) {
      throw new Error('EMBEDDINGS_BUCKET environment variable is required');
    }
    
    // Process each record (S3 notification)
    const results = [];
    
    for (const record of event.Records) {
      // Verify this is an S3 event
      if (record.eventSource !== 'aws:s3') {
        console.log('Skipping non-S3 event');
        continue;
      }
      
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
      
      // Only process chunk files
      if (!key.includes('/chunks/') || !key.endsWith('.json')) {
        console.log(`Skipping non-chunks file: ${key}`);
        continue;
      }
      
      // Process the chunks file
      const result = await processChunksFile(bucket, key);
      results.push(result);
    }
    
    return {
      statusCode: 200,
      body: {
        message: `Processed ${results.length} chunks files`,
        results: results
      }
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: {
        message: `Error processing embeddings: ${error.message}`
      }
    };
  }
};