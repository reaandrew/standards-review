/*  index.js – OpenSearch document search by taxonomy or text query
    ──────────────────────────────────────────────────────────────
    - Searches by taxonomy/category tag
    - Supports keyword-based document retrieval
    - Returns matching documents with metadata
*/
const AWS = require('aws-sdk');
const { Client } = require('@opensearch-project/opensearch');
const { TaxonomyUtils } = require('./taxonomy');

/* ───── env ──────────────────────────────────────────────────── */
const {
  OPENSEARCH_ENDPOINT,
  OPENSEARCH_USERNAME,
  OPENSEARCH_PASSWORD,
  DEFAULT_INDEX = '_all',
  MAX_RESULTS = '50',
  MIN_SCORE = '0.1'
} = process.env;

const client = new Client({
  node: OPENSEARCH_ENDPOINT,
  auth: { username: OPENSEARCH_USERNAME, password: OPENSEARCH_PASSWORD }
});

/* ───── lambda handler ──────────────────────────────────────── */
exports.handler = async (event) => {
  try {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    // Debug mode: List all taxonomy tags that exist in the OpenSearch index
    if (event.debug_tags === true) {
      try {
        console.log('Running debug mode: Listing all taxonomy tags in OpenSearch');
        const response = await client.search({
          index: event.index || DEFAULT_INDEX,
          body: {
            size: 0,
            aggs: {
              tags: {
                terms: { 
                  field: "topicTags", 
                  size: 1000 
                }
              }
            }
          }
        });
        
        const tagBuckets = response.body?.aggregations?.tags?.buckets || [];
        console.log('Found taxonomy tags:', JSON.stringify(tagBuckets, null, 2));
        
        return {
          debug: true,
          tagCount: tagBuckets.length,
          tags: tagBuckets.map(b => ({tag: b.key, count: b.doc_count}))
        };
      } catch (error) {
        console.error('Error in debug mode:', error);
        return { error: `Debug mode failed: ${error.message}` };
      }
    }
    
    // Regular search mode
    // Default parameters
    const params = {
      taxonomyId: event.taxonomyId?.toUpperCase(),
      query: event.query,
      documentType: event.documentType,
      index: event.index || DEFAULT_INDEX,
      size: event.size ? Math.min(parseInt(event.size), 100) : parseInt(MAX_RESULTS),
      includeContent: event.includeContent === true || event.includeContent === 'true',
      includeChildTaxonomies: event.includeChildTaxonomies === true || event.includeChildTaxonomies === 'true',
      from: event.from !== undefined ? parseInt(event.from) : undefined,
      minScore: parseFloat(MIN_SCORE),
      // Add strict taxonomy search options
      strictMode: event.strictMode === true || event.strictMode === 'true',
      strictTaxonomySearch: event.strictTaxonomySearch === true || event.strictTaxonomySearch === 'true'
    };
    
    // Validate parameters
    if (!params.taxonomyId && !params.query && !params.documentType) {
      return {
        error: 'At least one search parameter is required: taxonomyId, query, or documentType'
      };
    }
    
    // If taxonomyId is provided, validate it against the taxonomy
    if (params.taxonomyId && !TaxonomyUtils.isValid(params.taxonomyId)) {
      return {
        error: `Invalid taxonomy ID: ${params.taxonomyId}`
      };
    }
    
    // Choose search strategy based on parameters
    let searchResults;
    if (params.taxonomyId) {
      // Search by taxonomy ID
      searchResults = await searchByTaxonomy(params.taxonomyId, params);
    } else if (params.query) {
      // Search by text query
      searchResults = await searchByQuery(params.query, params);
    } else {
      // List documents (with optional filters)
      searchResults = await listDocuments(params);
    }
    
    return searchResults;
  } catch (error) {
    console.error('Error processing search request:', error);
    return { 
      error: 'Internal server error', 
      message: error.message 
    };
  }
};

/* ───── search by taxonomy ID ───────────────────────────────── */
async function searchByTaxonomy(taxonomyId, params) {
  let taxonomyIds = [taxonomyId];
  
  // Include child taxonomies if requested
  if (params.includeChildTaxonomies) {
    const children = TaxonomyUtils.getChildren(taxonomyId);
    taxonomyIds = [...taxonomyIds, ...children.map(child => child.id)];
  }
  
  // Check if we should use strict matching (exact tag matches only)
  const useStrictMode = params.strictMode || params.strictTaxonomySearch;
  
  // Build query for searching by taxonomy ID
  const query = {
    bool: useStrictMode ? 
      {
        // STRICT MODE: Only search in topicTags array
        must: [
          {
            terms: {
              "topicTags.keyword": taxonomyIds
            }
          }
        ]
      } : 
      {
        // REGULAR MODE: Looser matching including categories
        should: [
          // Look for exact match in topicTags array
          {
            terms: {
              "topicTags.keyword": taxonomyIds
            }
          },
          // Also check categories which might contain the taxonomy description
          {
            match: {
              "categories": TaxonomyUtils.findById(taxonomyId)?.description || taxonomyId
            }
          }
        ],
        minimum_should_match: 1
      }
  };
  
  // Add document type filter if specified
  if (params.documentType) {
    query.bool.filter = [
      { term: { "documentType": params.documentType } }
    ];
  }
  
  // Execute the search
  return executeSearch(query, params);
}

/* ───── search by text query ───────────────────────────────── */
async function searchByQuery(query, params) {
  // Build query for text search
  const searchQuery = {
    bool: {
      should: [
        // Search in document title (high weight)
        {
          match: {
            "documentTitle": {
              query: query,
              boost: 3.0
            }
          }
        },
        // Search in text content
        {
          match: {
            "text": {
              query: query,
              boost: 1.0
            }
          }
        },
        // Search in categories
        {
          match: {
            "categories": {
              query: query,
              boost: 2.0
            }
          }
        }
      ],
      minimum_should_match: 1
    }
  };
  
  // Add document type filter if specified
  if (params.documentType) {
    searchQuery.bool.filter = [
      { term: { "documentType": params.documentType } }
    ];
  }
  
  // Execute the search
  return executeSearch(searchQuery, params);
}

/* ───── list documents with optional filters ───────────────── */
async function listDocuments(params) {
  // Base query to match all documents
  let query = { match_all: {} };
  
  // Add document type filter if specified
  if (params.documentType) {
    query = {
      bool: {
        must: { match_all: {} },
        filter: [
          { term: { "documentType": params.documentType } }
        ]
      }
    };
  }
  
  // Execute the search
  return executeSearch(query, params);
}

/* ───── execute search against OpenSearch ───────────────────── */
async function executeSearch(query, params) {
  const searchBody = {
    query: query,
    size: params.size,
    _source: {
      excludes: params.includeContent ? [] : ["text", "vector_embedding"]
    },
    min_score: params.minScore
  };
  
  // Add pagination if 'from' parameter is set
  if (params.from !== undefined) {
    searchBody.from = params.from;
  }
  
  console.log(`Executing search against ${params.index} with query:`, JSON.stringify(searchBody, null, 2));
  
  try {
    const response = await client.search({
      index: params.index,
      body: searchBody
    });
    
    return formatSearchResults(response, params);
  } catch (error) {
    console.error('OpenSearch error:', error);
    throw new Error(`OpenSearch search failed: ${error.message}`);
  }
}

/* ───── format search results ────────────────────────────────── */
function formatSearchResults(response, params) {
  const hits = response.body?.hits?.hits || [];
  const total = response.body?.hits?.total?.value || 0;
  
  const results = hits.map(hit => {
    const source = hit._source;
    
    // Build a clean document response
    const document = {
      id: hit._id,
      score: hit._score,
      index: hit._index,
      document_id: source.document_id || '',
      title: source.documentTitle || source.title || 'Untitled',
      documentType: source.documentType || 'unknown',
      categories: source.categories || [],
      topicTags: source.topicTags || [],
      source_key: source.source_key || '',
      estimated_date: source.estimatedDate || ''
    };
    
    // Include text content if requested
    if (params.includeContent && source.text) {
      document.text = source.text;
    }
    
    // Add taxonomy information for each topic tag
    if (source.topicTags && source.topicTags.length > 0) {
      document.taxonomy_info = source.topicTags.map(tag => {
        const info = TaxonomyUtils.findById(tag);
        return info ? {
          id: info.id,
          description: info.description
        } : { id: tag, description: 'Unknown' };
      });
    }
    
    return document;
  });
  
  return {
    total,
    results,
    taxonomyInfo: params.taxonomyId ? TaxonomyUtils.findById(params.taxonomyId) : null,
    query: params.query || null
  };
}