/*  index.js – S3-to-OpenSearch embeddings ingestor
    ──────────────────────────────────────────────────────────────
    - Skips manifest & metadata files
    - Decodes S3 keys
    - Uses correct field names: vector_embedding & chunk_id
    - Validates vector length before indexing
*/
const AWS = require('aws-sdk');
const { Client } = require('@opensearch-project/opensearch');

/* ───── env ──────────────────────────────────────────────────── */
const {
  OPENSEARCH_ENDPOINT,
  OPENSEARCH_USERNAME,
  OPENSEARCH_PASSWORD,
  EXPECTED_EMBED_DIM = '1024'          // Set to 1024 for Amazon Titan embeddings
} = process.env;

const EXPECTED_DIM = Number(EXPECTED_EMBED_DIM);

const s3 = new AWS.S3();
const client = new Client({
  node: OPENSEARCH_ENDPOINT,
  auth: { username: OPENSEARCH_USERNAME, password: OPENSEARCH_PASSWORD }
});

/* ───── lambda handler ──────────────────────────────────────── */
exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  await Promise.all(event.Records.map(processRecord));

  console.log('✅  All embeddings processed');
  return { statusCode: 200, body: 'success' };
};

/* ───── per-record processing ───────────────────────────────── */
async function processRecord(record) {
  const bucket = record.s3.bucket.name;
  const keyRaw = record.s3.object.key;
  const key = decodeURIComponent(keyRaw.replace(/\+/g, ' '));

  /* 1. skip manifests / metadata folders */
  if (key.endsWith('_manifest.json') || key.includes('/metadata/')) {
    console.log(`↩️  Skip manifest/metadata: ${key}`);
    return;
  }

  console.log(`🎯  Processing ${bucket}/${key}`);

  /* 2. index name = top-level folder (e.g. "sans-infosec") */
  const indexName = key.split('/')[0].toLowerCase();

  /* 3. fetch & parse chunk JSON */
  const { Body } = await s3.getObject({ Bucket: bucket, Key: key }).promise();
  const chunk = JSON.parse(Body.toString('utf-8'));

  const {
    embedding,
    vector_embedding = embedding, // Try both field names
    chunkId,
    chunk_id = chunkId, // Try both field names
    text = '',
    documentId,
    document_id = documentId,
    pageNumbers,
    page_numbers = pageNumbers || [],
    metadata = {},
    ...otherProps
  } = chunk;

  /* 4. validate */
  // Find the embedding vector regardless of whether it's a top-level field or inside metadata
  let actualEmbedding = vector_embedding || embedding;
  
  // If embedding not found at top level, check metadata
  if (!actualEmbedding && metadata.embedding) {
    actualEmbedding = metadata.embedding;
    console.log(`Found embedding in metadata.embedding field`);
  }
  
  // If still not found, check for vector_embedding in metadata
  if (!actualEmbedding && metadata.vector_embedding) {
    actualEmbedding = metadata.vector_embedding;
    console.log(`Found embedding in metadata.vector_embedding field`);
  }
  
  // Check for chunk ID in various locations (top level or in metadata)
  const actualChunkId = chunk_id || chunkId || metadata.chunkId || metadata.chunk_id || 
                       (metadata.id ? metadata.id.toString() : undefined);
  
  if (!Array.isArray(actualEmbedding) || actualEmbedding.length !== EXPECTED_DIM) {
    console.warn(`⚠️  Invalid embedding – skip ${key}`);
    console.warn(`Expected dimension: ${EXPECTED_DIM}, actual: ${actualEmbedding ? actualEmbedding.length : 'undefined'}`);
    return;
  }
  
  if (actualChunkId === undefined) {
    console.warn(`⚠️  Missing chunk ID – skip ${key}`);
    return;
  }

  /* 5. create index on-demand (idempotent) */
  await createIndexIfNotExists(indexName);

  /* 6. index document */
  // Prepare document body, flattening metadata if needed
  const documentBody = {
    vector_embedding: actualEmbedding,
    text,
    chunk_id: actualChunkId,
    document_id: document_id || metadata.document_id || metadata.documentId || '',
    page_numbers: page_numbers || metadata.page_numbers || metadata.pageNumbers || [],
    source_key: key
  };
  
  // Add all metadata fields, but avoid duplicating fields already added
  const skipKeys = ['vector_embedding', 'embedding', 'text', 'chunk_id', 'chunkId', 
                    'document_id', 'documentId', 'page_numbers', 'pageNumbers'];
                    
  // Add metadata fields from top level
  Object.keys(otherProps).forEach(key => {
    if (!skipKeys.includes(key)) {
      documentBody[key] = otherProps[key];
    }
  });
  
  // Add metadata fields from nested metadata object
  if (metadata && typeof metadata === 'object') {
    Object.keys(metadata).forEach(key => {
      if (!skipKeys.includes(key) && !documentBody.hasOwnProperty(key)) {
        documentBody[key] = metadata[key];
      }
    });
  }
  
  await client.index({
    index: indexName,
    id: String(actualChunkId),
    refresh: true,
    body: documentBody
  });

  console.log(`✅  Indexed ${indexName}/${actualChunkId}`);
}

/* ───── index bootstrapper ──────────────────────────────────── */
async function createIndexIfNotExists(indexName) {
  try {
    /* exists() returns { body: boolean } – no exception if 404 */
    const { body: exists } = await client.indices.exists({ index: indexName });
    if (exists) return;

    console.log(`🏗️  Creating index ${indexName}`);

    await client.indices.create({
      index: indexName,
      body: {
        settings: {
          index: {
            knn: true,
            number_of_shards: 2,
            number_of_replicas: 1,
            'knn.algo_param.ef_search': 100
          }
        },
        mappings: {
          properties: {
            vector_embedding: {
              type: 'knn_vector',
              dimension: EXPECTED_DIM,
              method: {
                name: 'hnsw',
                space_type: 'cosinesimil',
                engine: 'nmslib',
                parameters: { ef_construction: 128, m: 16 }
              }
            },
            text: { type: 'text' },
            chunk_id: { type: 'keyword' },
            document_id: { type: 'keyword' },
            page_numbers: { type: 'keyword' },
            source_key: { type: 'keyword' },
            metadata: { type: 'object' }
          }
        }
      }
    });

    console.log(`🆗  Index ${indexName} created`);
  } catch (error) {
    // Handle the case where the index already exists (race condition)
    if (error.meta && error.meta.body && error.meta.body.error &&
      error.meta.body.error.type === 'resource_already_exists_exception') {
      console.log(`Index ${indexName} already exists (created by another process)`);
      return;
    }
    console.error(`Error creating index ${indexName}:`, error);
    throw error;
  }
}