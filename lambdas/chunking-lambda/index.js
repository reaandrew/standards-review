const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

// Configure the destination bucket for chunks
const CHUNKS_BUCKET = process.env.CHUNKS_BUCKET;
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';

// Initialize Bedrock client
const bedrockClient = new BedrockRuntimeClient({ region: 'eu-west-2' });

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

/**
 * Extract pages from document text
 * @param {string} text - Document text content
 * @returns {Array} - Array of page objects with pageNumber and content
 */
function extractPages(text) {
  const pageMarkerRegex = /===== PAGE (\d+) =====/g;
  const pages = [];
  
  let match;
  let lastIndex = 0;
  
  // Find all page markers
  while ((match = pageMarkerRegex.exec(text)) !== null) {
    const pageNumber = parseInt(match[1]);
    const startIndex = match.index + match[0].length;
    
    // If this isn't the first page, add the previous page
    if (pages.length > 0) {
      const pageContent = text.substring(lastIndex, match.index).trim();
      pages.push({ pageNumber: pageNumber - 1, content: pageContent });
    }
    
    lastIndex = startIndex;
  }
  
  // Add the last page
  if (lastIndex < text.length) {
    const pageContent = text.substring(lastIndex).trim();
    const pageNumber = pages.length > 0 ? pages[pages.length - 1].pageNumber + 1 : 1;
    pages.push({ pageNumber, content: pageContent });
  }
  
  return pages;
}

/**
 * Select representative pages that are most likely to contain document structure
 * @param {Array} pages - Array of page objects
 * @returns {Array} - Array of page content strings
 */
function selectRepresentativePages(pages) {
  if (pages.length === 0) return [];
  
  const selectedPages = [];
  
  // Always include the first page
  selectedPages.push(pages[0].content);
  
  // Look for table of contents or introduction
  const tocPage = pages.find(page => {
    const lowerContent = page.content.toLowerCase();
    return lowerContent.includes('table of contents') || 
           lowerContent.includes('contents') || 
           lowerContent.includes('toc') ||
           lowerContent.includes('introduction');
  });
  
  if (tocPage && !selectedPages.includes(tocPage.content)) {
    selectedPages.push(tocPage.content);
  }
  
  // Include a middle page if we have enough pages
  if (pages.length > 3) {
    const middlePageIndex = Math.floor(pages.length / 2);
    selectedPages.push(pages[middlePageIndex].content);
  }
  
  // Include the last page if we have enough pages
  if (pages.length > 2) {
    selectedPages.push(pages[pages.length - 1].content);
  }
  
  return selectedPages;
}

/**
 * Generate document outline and metadata using Bedrock
 * @param {string} text - Document text content
 * @returns {Promise<object>} - Document outline and metadata
 */
async function generateDocumentOutline(text) {
  try {
    // Extract the pages from the document text
    const pages = extractPages(text);
    console.log(`Extracted ${pages.length} pages from document`);
    
    // For short documents (less than 10KB), use the whole first page
    // For longer documents, select representative pages
    let analysisText;
    if (text.length < 10000 && pages.length > 0) {
      analysisText = pages[0].content;
      console.log(`Document is short, using only first page for analysis`);
    } else {
      // Select representative pages for analysis
      const pagesToAnalyze = selectRepresentativePages(pages);
      console.log(`Selected ${pagesToAnalyze.length} representative pages for analysis`);
      
      // Combine the selected pages with appropriate context
      analysisText = pagesToAnalyze.join('\n\n--- Next Page ---\n\n');
    }
    
    // Remove SANS footer banners to reduce noise
    analysisText = analysisText.replace(/Copyright ©.*?terms-of-use\./gi, "");
    
    // Limit text length to avoid Bedrock token limits
    const textSample = analysisText.length > 15000 ? analysisText.substring(0, 15000) + "..." : analysisText;
    
    // Define the prompt for Claude to analyze the document
    const prompt = `
You are a security-savvy analyst with expertise in cybersecurity, cloud architecture, compliance frameworks, and enterprise policy management. Your task is to analyze the following document and extract key metadata.

<document>
${textSample}
</document>

Based on the document above, provide the following information:

1. Document Type: Identify the type of document (e.g., policy, standard, guideline, runbook, architecture diagram, report, playbook)
2. Title: Extract or infer a concise title
3. Outline: Provide main topics and subtopics (max 5 main topics)
4. Categories: List 2-5 high-level themes covered
5. Entities: Identify key organizations, technologies, frameworks mentioned
6. Audience: Specify the intended readers
7. Estimated Date: Estimate when document was created/updated
8. Topic Tags: Select the most relevant tag IDs from the taxonomy below that best describe this document

Topic Taxonomy (ID - Meaning)

GOV              Governance & Risk
GOV-POL          Strategy & Policy
GOV-RISK         Risk Management
GOV-COMP         Compliance (e.g., GDPR, SOC 2, PCI DSS)
GOV-ASSET        Asset Management
GOV-AUDIT        Audit & Assurance

AUP              Acceptable Use
AUP-GEN          Acceptable Use Policy
AUP-MON          Lawful Business Monitoring Policy
AUP-SOCIAL       Social Media Policy

SEC-IAM          Identity & Access Management
SEC-IAM-AUTH     Authentication (e.g., MFA, OAuth)
SEC-IAM-AUTHZ    Authorization (e.g., RBAC, ABAC)
SEC-IAM-PAM      Privileged Access Management
SEC-IAM-FED      Federation & SSO (e.g., SAML, OIDC)
SEC-IAM-CRED     Credential Management
SEC-IAM-CUST     Customer Identity Policy
SEC-IAM-ENT      Enterprise Identity & Access Management
SEC-IAM-3P       Third Party Access Security

SEC-AI           AI/ML Security
SEC-AI-POL       Artificial Intelligence Policy
SEC-AI-SEC       Artificial Intelligence Security Policy

SEC-ASSET        Asset Management
SEC-ASSET-POL    Asset Management Policy
SEC-ASSET-MGMT   Asset Onboarding & Decommissioning

SEC-DATA         Data Security
SEC-DATA-DAR     Data-at-Rest (e.g., encryption, tokenization)
SEC-DATA-DIT     Data-in-Transit (e.g., TLS, VPN)
SEC-DATA-DIU     Data-in-Use (e.g., confidential computing)
SEC-DATA-RET     Retention & Disposal
SEC-DATA-PRI     Privacy Engineering (e.g., GDPR, CCPA)
SEC-DATA-CLASS   Data Classification & Labeling
SEC-DATA-DLP     Data Loss Prevention

SEC-INFRA        Infrastructure Security
SEC-INFRA-RT     Runtime / OS Hardening
SEC-INFRA-BUILD  IaC & Build Security
SEC-INFRA-CON    Container Security (e.g., Docker, Kubernetes)
SEC-INFRA-VM     VM & Bare-Metal Security
SEC-INFRA-ZT     Zero Trust Architecture

SEC-APP          Application Security
SEC-APP-SDLC     Secure Software Development Lifecycle
SEC-APP-CODE     Code Quality & Static Analysis
SEC-APP-DEP      Dependency Management (e.g., SBOM)
SEC-APP-API      API Security
SEC-APP-CLIENT   Client-Side Security (e.g., XSS, CSRF)
SEC-APP-TEST     Security Testing (e.g., DAST, SAST)
SEC-APP-BASE     Secure Baseline Configuration

SEC-NET          Network Security
SEC-NET-SEG      Network Segmentation
SEC-NET-PERI     Perimeter Controls (e.g., firewalls, WAF)
SEC-NET-PROT     Secure Protocols (e.g., TLS, IPsec)
SEC-NET-RA       Remote Access (e.g., VPN, ZTNA)
SEC-NET-DNS      DNS Security
SEC-NET-NAC      Network Access Control
SEC-NET-IDS      Network Intrusion Detection & Prevention

SEC-ENCRYPT      Encryption & Key Management
SEC-ENCRYPT-POL  Encryption Policy
SEC-ENCRYPT-STD  Encryption Standard
SEC-ENCRYPT-KEY  Key & Secrets Management

SEC-ENDPT        Endpoint Security
SEC-ENDPT-POL    Endpoint Policy
SEC-ENDPT-EDR    Endpoint Detection & Response
SEC-ENDPT-AV     Anti-Virus & Malware Protection

SEC-COMP         Continual Security Compliance
SEC-COMP-POL     Continual Security Compliance Policy
SEC-COMP-PATCH   Patch Management
SEC-COMP-VULN    Vulnerability Management
SEC-COMP-TEST    Security Testing

SEC-COMM         Communication & Collaboration
SEC-COMM-UCC     Unified Communication & Collaboration
SEC-COMM-AV      Audio & Video Recording
SEC-COMM-IPR     Copyright & Intellectual Property Rights
SEC-COMM-DOM     Domains Definition & Management

SEC-PHY          Physical Security
SEC-PHY-POL      Physical Security Policy
SEC-PHY-DC       Data Center Physical Security
SEC-PHY-IOT      Edge & IoT Security
SEC-PHY-WRK      Workplace Security (e.g., badge access)

SEC-MEDIA        Media & Device Handling
SEC-MEDIA-POL    Media & Device Handling Policy
SEC-MEDIA-DLP    Data Loss Prevention

SEC-OFF          Offshoring
SEC-OFF-POL      Offshoring Policy

SEC-PERS         Personnel Security
SEC-PERS-POL     Personnel Security Policy

SEC-CUST         Special Customer Records
SEC-CUST-POL     Special Customer Records Policy

MON              Monitoring & Observability
MON-LOG          Logging
MON-DET          Detection Engineering (e.g., IDS/IPS)
MON-SIEM         SIEM & Analytics
MON-MET          Metrics & KPIs
MON-THRT         Threat Intelligence
MON-PROT         Protective Monitoring

IR               Incident Response
IR-RESP          Incident Response Planning
IR-INV           Investigation & Forensics
IR-REC           Recovery & Lessons Learned
IR-DRILL         Tabletop Exercises & Drills
IR-FOREN         Forensic Readiness

BC               Business Continuity
BC-RES           Resilience & Disaster Recovery
BC-BACK          Backup & Restore
BC-CRIS          Crisis Management
BC-CNI           Critical National Infrastructure Security
BC-CYBER         Cyber Resilience

OPS              Operations
OPS-CHG          Change Management
OPS-CFG          Configuration Management
OPS-OBS          Observability
OPS-SRE          Site Reliability Engineering

DEV              Development & DevSecOps
DEV-PIPE         CI/CD Pipeline Security
DEV-ENV          Environment Parity
DEV-AUTO         Automation & ChatOps
DEV-SUPPLY       Software Supply Chain Security

TPM              Third-Party Management
TPM-VRM          Vendor Risk Management
TPM-ART          Marketplace Artifacts
TPM-OSS          Open-Source Assurance
TPM-SCA          Software Composition Analysis
TPM-3P           Third Party Supplier Assurance

RET              Retention & Backup
RET-POL          Backup, Archive & Data Retention Policy
RET-REC          Records Management, Retention & Disposal
RET-SEC          Backup, Archive & Data Retention Security

PERF             Performance
PERF-CPU         Compute Performance
PERF-STO         Storage Performance
PERF-NET         Network Performance

COST             Cost Management
COST-USE         Resource Utilization
COST-LIC         Licensing
COST-FIN         FinOps Governance

DOC              Documentation
DOC-ARC          Architecture Documentation
DOC-RUN          Runbooks & SOPs
DOC-KT           Knowledge Transfer
DOC-TRAIN        Training & Awareness

CLOUD            Cloud Security
CLOUD-NATIVE     Cloud-Native Security (e.g., CSPM, CWPP)
CLOUD-SVC        Cloud Service Security (e.g., AWS S3, Azure AD)
CLOUD-MULTI      Multi-Cloud & Hybrid Cloud Security

Respond only with complete, valid JSON in the exact format below (do not include any text before or after the JSON):
{
  "documentType": "",
  "title": "",
  "outline": [
    {
      "topic": "",
      "subtopics": [""]
    }
  ],
  "categories": [""],
  "entities": [""],
  "audience": "",
  "estimatedDate": "",
  "topicTags": [""]
}
`;

    // Invoke Claude via Bedrock
    const payload = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1024,
      temperature: 0,
      messages: [
        { role: "user", content: prompt }
      ]
    };
    
    const command = new InvokeModelCommand({
      modelId: BEDROCK_MODEL_ID,
      contentType: "application/json",
      body: JSON.stringify(payload)
    });
    
    const response = await bedrockClient.send(command);
    
    // Parse the response
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    // Handle different Bedrock response formats
    let content;
    if (responseBody.content && Array.isArray(responseBody.content)) {
      content = responseBody.content[0]?.text || '';
    } else if (responseBody.completion) {
      content = responseBody.completion;
    } else {
      content = responseBody.content || '';
    }
    
    console.log('Document outline generation successful');
    
    // Return the document analysis
    try {
      // Log the raw content for debugging (truncated if too long)
      if (content.length > 500) {
        console.log('Content to parse (truncated):', content.substring(0, 500) + '...');
      } else {
        console.log('Content to parse:', content);
      }
      
      if (!content || content.trim() === '') {
        console.warn('Empty content returned from Bedrock');
        throw new Error('Empty content from Bedrock');
      }
      
      // Handle incomplete JSON by attempting to complete it
      let jsonContent = content;
      
      // Try to extract complete JSON if possible
      if (content.includes('{') && content.includes('}')) {
        const jsonStart = content.indexOf('{');
        const jsonEnd = content.lastIndexOf('}') + 1;
        
        // Only use this approach if we have a complete JSON object
        if (jsonEnd > jsonStart) {
          jsonContent = content.substring(jsonStart, jsonEnd);
        }
      }
      
      // Check if JSON is incomplete and try to complete it
      if (jsonContent.includes('{') && !jsonContent.endsWith('}')) {
        console.log('Detected incomplete JSON, attempting to complete it');
        
        // Count open and close braces to see if we can fix it
        let openBraces = 0;
        let closeBraces = 0;
        
        for (const char of jsonContent) {
          if (char === '{') openBraces++;
          if (char === '}') closeBraces++;
        }
        
        // Add missing closing braces if needed
        if (openBraces > closeBraces) {
          const missingBraces = openBraces - closeBraces;
          jsonContent += '}'.repeat(missingBraces);
          console.log(`Added ${missingBraces} closing braces to complete the JSON`);
        }
      }
      
      // Try to parse the JSON response
      const parsed = JSON.parse(jsonContent);
      
      // Basic sanity check
      if (!parsed.documentType) parsed.documentType = "unknown";
      if (!parsed.title) parsed.title = "untitled document";
      if (!Array.isArray(parsed.outline)) parsed.outline = [];
      if (!Array.isArray(parsed.categories)) parsed.categories = [];
      if (!Array.isArray(parsed.entities)) parsed.entities = [];
      if (!parsed.audience) parsed.audience = "";
      if (!parsed.estimatedDate) parsed.estimatedDate = "";
      if (!Array.isArray(parsed.topicTags)) parsed.topicTags = [];
      
      return parsed;
    } catch (e) {
      console.error('Failed to parse JSON from Bedrock response:', e);
      console.log('Raw response:', content);
      
      // Return a simplified placeholder
      return {
        documentType: "unknown",
        title: "untitled document",
        outline: [],
        categories: [],
        entities: [],
        audience: "",
        estimatedDate: "",
        topicTags: []
      };
    }
  } catch (error) {
    console.error('Error generating document outline:', error);
    
    // Return a default structure in case of errors
    return {
      documentType: "unknown",
      title: "untitled document",
      outline: [],
      categories: [],
      entities: [],
      audience: "",
      estimatedDate: "",
      topicTags: []
    };
  }
}

exports.handler = async (event) => {
  try {
    // Debug: Log the entire event
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    // Debug environment variables
    console.log("ENV CHUNKS_BUCKET:", process.env.CHUNKS_BUCKET);
    console.log("ENV BEDROCK_MODEL_ID:", BEDROCK_MODEL_ID || 'not set');

    // Get the S3 bucket and key from the event
    const sourceBucket = event.Records[0].s3.bucket.name;
    const sourceKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
    
    // Skip processing if this is a job info or chunks file
    if (sourceKey.includes('/jobs/') || sourceKey.includes('/chunks/') || sourceKey.includes('/metadata/')) {
      console.log(`Skipping processing of job info, chunks, or metadata file: ${sourceKey}`);
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
    
    // Generate document outline and metadata
    console.log('Generating document outline and metadata...');
    const documentAnalysis = await generateDocumentOutline(textContent);
    console.log('Document analysis complete:', JSON.stringify(documentAnalysis, null, 2));
    
    // Save the document analysis to S3
    await s3.putObject({
      Bucket: CHUNKS_BUCKET,
      Key: `${directoryPath}/metadata/${fileName.replace(/\.[^/.]+$/, '')}_outline.json`,
      Body: JSON.stringify(documentAnalysis, null, 2),
      ContentType: 'application/json'
    }).promise();
    
    console.log(`Saved document outline to s3://${CHUNKS_BUCKET}/${directoryPath}/metadata/${fileName.replace(/\.[^/.]+$/, '')}_outline.json`);
    
    // Remove SANS footer banners to reduce noise
    const cleanedText = textContent.replace(/Copyright ©.*?terms-of-use\./gi, "");
    
    // Split the text into chunks using our custom function with smaller overlap
    const chunkTexts = splitTextIntoChunks(cleanedText, 1000, 50);
    console.log(`Split text into ${chunkTexts.length} chunks`);
    
    // Create a metadata file that includes all chunks with their enhanced metadata
    const chunksMetadata = chunkTexts.map((chunkText, index) => ({
      id: `${sourceKey}-chunk-${index}`,
      text: chunkText,
      metadata: {
        sourceBucket,
        sourceKey,
        sourceFile: fileName,
        chunkIndex: index,
        totalChunks: chunkTexts.length,
        documentType: documentAnalysis.documentType,
        documentTitle: documentAnalysis.title,
        categories: documentAnalysis.categories || [],
        audience: documentAnalysis.audience || "",
        entities: documentAnalysis.entities || [],
        estimatedDate: documentAnalysis.estimatedDate || "",
        topicTags: documentAnalysis.topicTags || []
      }
    }));
    
    // Save the chunks metadata to S3
    await s3.putObject({
      Bucket: CHUNKS_BUCKET,
      Key: `${directoryPath}/chunks/${fileName.replace(/\.[^/.]+$/, '')}.json`,
      Body: JSON.stringify(chunksMetadata, null, 2),
      ContentType: 'application/json'
    }).promise();
    
    console.log(`Saved ${chunkTexts.length} chunks with enhanced metadata to s3://${CHUNKS_BUCKET}/${directoryPath}/chunks/${fileName.replace(/\.[^/.]+$/, '')}.json`);
    
    return {
      statusCode: 200,
      body: `Processed ${sourceKey}, generated document outline, and created ${chunkTexts.length} chunks with enhanced metadata`
    };
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};