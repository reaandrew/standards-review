/**
 * Structured taxonomy for security standards categorization
 * Each entry has an ID and description for categorizing security documents
 */
const TAXONOMY = [
  // Governance & Risk
  { id: 'GOV', description: 'Governance & Risk' },
  { id: 'GOV-POL', description: 'Strategy & Policy' },
  { id: 'GOV-RISK', description: 'Risk Management' },
  { id: 'GOV-COMP', description: 'Compliance (e.g., GDPR, SOC 2, PCI DSS)' },
  { id: 'GOV-ASSET', description: 'Asset Management' },
  { id: 'GOV-AUDIT', description: 'Audit & Assurance' },

  // Acceptable Use
  { id: 'AUP', description: 'Acceptable Use' },
  { id: 'AUP-GEN', description: 'Acceptable Use Policy' },
  { id: 'AUP-MON', description: 'Lawful Business Monitoring Policy' },
  { id: 'AUP-SOCIAL', description: 'Social Media Policy' },

  // Identity & Access Management
  { id: 'SEC-IAM', description: 'Identity & Access Management' },
  { id: 'SEC-IAM-AUTH', description: 'Authentication (e.g., MFA, OAuth)' },
  { id: 'SEC-IAM-AUTHZ', description: 'Authorization (e.g., RBAC, ABAC)' },
  { id: 'SEC-IAM-PAM', description: 'Privileged Access Management' },
  { id: 'SEC-IAM-FED', description: 'Federation & SSO (e.g., SAML, OIDC)' },
  { id: 'SEC-IAM-CRED', description: 'Credential Management' },
  { id: 'SEC-IAM-CUST', description: 'Customer Identity Policy' },
  { id: 'SEC-IAM-ENT', description: 'Enterprise Identity & Access Management' },
  { id: 'SEC-IAM-3P', description: 'Third Party Access Security' },

  // AI/ML Security
  { id: 'SEC-AI', description: 'AI/ML Security' },
  { id: 'SEC-AI-POL', description: 'Artificial Intelligence Policy' },
  { id: 'SEC-AI-SEC', description: 'Artificial Intelligence Security Policy' },

  // Asset Management
  { id: 'SEC-ASSET', description: 'Asset Management' },
  { id: 'SEC-ASSET-POL', description: 'Asset Management Policy' },
  { id: 'SEC-ASSET-MGMT', description: 'Asset Onboarding & Decommissioning' },

  // Data Security
  { id: 'SEC-DATA', description: 'Data Security' },
  { id: 'SEC-DATA-DAR', description: 'Data-at-Rest (e.g., encryption, tokenization)' },
  { id: 'SEC-DATA-DIT', description: 'Data-in-Transit (e.g., TLS, VPN)' },
  { id: 'SEC-DATA-DIU', description: 'Data-in-Use (e.g., confidential computing)' },
  { id: 'SEC-DATA-RET', description: 'Retention & Disposal' },
  { id: 'SEC-DATA-PRI', description: 'Privacy Engineering (e.g., GDPR, CCPA)' },
  { id: 'SEC-DATA-CLASS', description: 'Data Classification & Labeling' },
  { id: 'SEC-DATA-DLP', description: 'Data Loss Prevention' },

  // Infrastructure Security
  { id: 'SEC-INFRA', description: 'Infrastructure Security' },
  { id: 'SEC-INFRA-RT', description: 'Runtime / OS Hardening' },
  { id: 'SEC-INFRA-BUILD', description: 'IaC & Build Security' },
  { id: 'SEC-INFRA-CON', description: 'Container Security (e.g., Docker, Kubernetes)' },
  { id: 'SEC-INFRA-VM', description: 'VM & Bare-Metal Security' },
  { id: 'SEC-INFRA-ZT', description: 'Zero Trust Architecture' },

  // Application Security
  { id: 'SEC-APP', description: 'Application Security' },
  { id: 'SEC-APP-SDLC', description: 'Secure Software Development Lifecycle' },
  { id: 'SEC-APP-CODE', description: 'Code Quality & Static Analysis' },
  { id: 'SEC-APP-DEP', description: 'Dependency Management (e.g., SBOM)' },
  { id: 'SEC-APP-API', description: 'API Security' },
  { id: 'SEC-APP-CLIENT', description: 'Client-Side Security (e.g., XSS, CSRF)' },
  { id: 'SEC-APP-TEST', description: 'Security Testing (e.g., DAST, SAST)' },
  { id: 'SEC-APP-BASE', description: 'Secure Baseline Configuration' },

  // Network Security
  { id: 'SEC-NET', description: 'Network Security' },
  { id: 'SEC-NET-SEG', description: 'Network Segmentation' },
  { id: 'SEC-NET-PERI', description: 'Perimeter Controls (e.g., firewalls, WAF)' },
  { id: 'SEC-NET-PROT', description: 'Secure Protocols (e.g., TLS, IPsec)' },
  { id: 'SEC-NET-RA', description: 'Remote Access (e.g., VPN, ZTNA)' },
  { id: 'SEC-NET-DNS', description: 'DNS Security' },
  { id: 'SEC-NET-NAC', description: 'Network Access Control' },
  { id: 'SEC-NET-IDS', description: 'Network Intrusion Detection & Prevention' },

  // Encryption & Key Management
  { id: 'SEC-ENCRYPT', description: 'Encryption & Key Management' },
  { id: 'SEC-ENCRYPT-POL', description: 'Encryption Policy' },
  { id: 'SEC-ENCRYPT-STD', description: 'Encryption Standard' },
  { id: 'SEC-ENCRYPT-KEY', description: 'Key & Secrets Management' },

  // Endpoint Security
  { id: 'SEC-ENDPT', description: 'Endpoint Security' },
  { id: 'SEC-ENDPT-POL', description: 'Endpoint Policy' },
  { id: 'SEC-ENDPT-EDR', description: 'Endpoint Detection & Response' },
  { id: 'SEC-ENDPT-AV', description: 'Anti-Virus & Malware Protection' },

  // Continual Security Compliance
  { id: 'SEC-COMP', description: 'Continual Security Compliance' },
  { id: 'SEC-COMP-POL', description: 'Continual Security Compliance Policy' },
  { id: 'SEC-COMP-PATCH', description: 'Patch Management' },
  { id: 'SEC-COMP-VULN', description: 'Vulnerability Management' },
  { id: 'SEC-COMP-TEST', description: 'Security Testing' },

  // Communication & Collaboration
  { id: 'SEC-COMM', description: 'Communication & Collaboration' },
  { id: 'SEC-COMM-UCC', description: 'Unified Communication & Collaboration' },
  { id: 'SEC-COMM-AV', description: 'Audio & Video Recording' },
  { id: 'SEC-COMM-IPR', description: 'Copyright & Intellectual Property Rights' },
  { id: 'SEC-COMM-DOM', description: 'Domains Definition & Management' },

  // Physical Security
  { id: 'SEC-PHY', description: 'Physical Security' },
  { id: 'SEC-PHY-POL', description: 'Physical Security Policy' },
  { id: 'SEC-PHY-DC', description: 'Data Center Physical Security' },
  { id: 'SEC-PHY-IOT', description: 'Edge & IoT Security' },
  { id: 'SEC-PHY-WRK', description: 'Workplace Security (e.g., badge access)' },

  // Media & Device Handling
  { id: 'SEC-MEDIA', description: 'Media & Device Handling' },
  { id: 'SEC-MEDIA-POL', description: 'Media & Device Handling Policy' },
  { id: 'SEC-MEDIA-DLP', description: 'Data Loss Prevention' },

  // Offshoring
  { id: 'SEC-OFF', description: 'Offshoring' },
  { id: 'SEC-OFF-POL', description: 'Offshoring Policy' },

  // Personnel Security
  { id: 'SEC-PERS', description: 'Personnel Security' },
  { id: 'SEC-PERS-POL', description: 'Personnel Security Policy' },

  // Special Customer Records
  { id: 'SEC-CUST', description: 'Special Customer Records' },
  { id: 'SEC-CUST-POL', description: 'Special Customer Records Policy' },

  // Monitoring & Observability
  { id: 'MON', description: 'Monitoring & Observability' },
  { id: 'MON-LOG', description: 'Logging' },
  { id: 'MON-DET', description: 'Detection Engineering (e.g., IDS/IPS)' },
  { id: 'MON-SIEM', description: 'SIEM & Analytics' },
  { id: 'MON-MET', description: 'Metrics & KPIs' },
  { id: 'MON-THRT', description: 'Threat Intelligence' },
  { id: 'MON-PROT', description: 'Protective Monitoring' },

  // Incident Response
  { id: 'IR', description: 'Incident Response' },
  { id: 'IR-RESP', description: 'Incident Response Planning' },
  { id: 'IR-INV', description: 'Investigation & Forensics' },
  { id: 'IR-REC', description: 'Recovery & Lessons Learned' },
  { id: 'IR-DRILL', description: 'Tabletop Exercises & Drills' },
  { id: 'IR-FOREN', description: 'Forensic Readiness' },

  // Business Continuity
  { id: 'BC', description: 'Business Continuity' },
  { id: 'BC-RES', description: 'Resilience & Disaster Recovery' },
  { id: 'BC-BACK', description: 'Backup & Restore' },
  { id: 'BC-CRIS', description: 'Crisis Management' },
  { id: 'BC-CNI', description: 'Critical National Infrastructure Security' },
  { id: 'BC-CYBER', description: 'Cyber Resilience' },

  // Operations
  { id: 'OPS', description: 'Operations' },
  { id: 'OPS-CHG', description: 'Change Management' },
  { id: 'OPS-CFG', description: 'Configuration Management' },
  { id: 'OPS-OBS', description: 'Observability' },
  { id: 'OPS-SRE', description: 'Site Reliability Engineering' },

  // Development & DevSecOps
  { id: 'DEV', description: 'Development & DevSecOps' },
  { id: 'DEV-PIPE', description: 'CI/CD Pipeline Security' },
  { id: 'DEV-ENV', description: 'Environment Parity' },
  { id: 'DEV-AUTO', description: 'Automation & ChatOps' },
  { id: 'DEV-SUPPLY', description: 'Software Supply Chain Security' },

  // Third-Party Management
  { id: 'TPM', description: 'Third-Party Management' },
  { id: 'TPM-VRM', description: 'Vendor Risk Management' },
  { id: 'TPM-ART', description: 'Marketplace Artifacts' },
  { id: 'TPM-OSS', description: 'Open-Source Assurance' },
  { id: 'TPM-SCA', description: 'Software Composition Analysis' },
  { id: 'TPM-3P', description: 'Third Party Supplier Assurance' },

  // Retention & Backup
  { id: 'RET', description: 'Retention & Backup' },
  { id: 'RET-POL', description: 'Backup, Archive & Data Retention Policy' },
  { id: 'RET-REC', description: 'Records Management, Retention & Disposal' },
  { id: 'RET-SEC', description: 'Backup, Archive & Data Retention Security' },

  // Performance
  { id: 'PERF', description: 'Performance' },
  { id: 'PERF-CPU', description: 'Compute Performance' },
  { id: 'PERF-STO', description: 'Storage Performance' },
  { id: 'PERF-NET', description: 'Network Performance' },

  // Cost Management
  { id: 'COST', description: 'Cost Management' },
  { id: 'COST-USE', description: 'Resource Utilization' },
  { id: 'COST-LIC', description: 'Licensing' },
  { id: 'COST-FIN', description: 'FinOps Governance' },

  // Documentation
  { id: 'DOC', description: 'Documentation' },
  { id: 'DOC-ARC', description: 'Architecture Documentation' },
  { id: 'DOC-RUN', description: 'Runbooks & SOPs' },
  { id: 'DOC-KT', description: 'Knowledge Transfer' },
  { id: 'DOC-TRAIN', description: 'Training & Awareness' },

  // Cloud Security
  { id: 'CLOUD', description: 'Cloud Security' },
  { id: 'CLOUD-NATIVE', description: 'Cloud-Native Security (e.g., CSPM, CWPP)' },
  { id: 'CLOUD-SVC', description: 'Cloud Service Security (e.g., AWS S3, Azure AD)' },
  { id: 'CLOUD-MULTI', description: 'Multi-Cloud & Hybrid Cloud Security' }
];

/**
 * Helper functions for working with taxonomy
 */
const TaxonomyUtils = {
  /**
   * Find a taxonomy item by ID
   * @param {string} id - The taxonomy ID to search for
   * @returns {Object|null} - The taxonomy item or null if not found
   */
  findById: (id) => {
    if (!id) return null;
    const taxonomyId = id.toUpperCase();
    return TAXONOMY.find(item => item.id === taxonomyId) || null;
  },

  /**
   * Find taxonomy items that match a search term in either ID or description
   * @param {string} searchTerm - Term to search for
   * @returns {Array} - Array of matching taxonomy items
   */
  search: (searchTerm) => {
    if (!searchTerm) return [];
    const term = searchTerm.toLowerCase();
    return TAXONOMY.filter(item => 
      item.id.toLowerCase().includes(term) || 
      item.description.toLowerCase().includes(term)
    );
  },

  /**
   * Check if a given ID is valid in the taxonomy
   * @param {string} id - The taxonomy ID to validate
   * @returns {boolean} - True if valid, false otherwise
   */
  isValid: (id) => {
    if (!id) return false;
    return TAXONOMY.some(item => item.id === id.toUpperCase());
  },

  /**
   * Get all parent categories for a given ID
   * @param {string} id - The taxonomy ID
   * @returns {Array} - Array of parent taxonomy items
   */
  getParents: (id) => {
    if (!id) return [];
    const parts = id.split('-');
    const results = [];
    
    // Handle top-level items
    if (parts.length === 1) {
      return [];
    }
    
    // Add the top-level parent
    const topLevelId = parts[0];
    const topLevelItem = TAXONOMY.find(item => item.id === topLevelId);
    if (topLevelItem) results.push(topLevelItem);
    
    // If it's a third-level item (e.g. SEC-IAM-AUTH), add the second level too
    if (parts.length > 2) {
      const secondLevelId = parts.slice(0, 2).join('-');
      const secondLevelItem = TAXONOMY.find(item => item.id === secondLevelId);
      if (secondLevelItem) results.push(secondLevelItem);
    }
    
    return results;
  },

  /**
   * Get all children categories for a given ID
   * @param {string} id - The taxonomy ID
   * @returns {Array} - Array of child taxonomy items
   */
  getChildren: (id) => {
    if (!id) return [];
    return TAXONOMY.filter(item => 
      item.id !== id && // Not the same item
      item.id.startsWith(id) && // Starts with parent ID
      (item.id.length > id.length) && // Longer than parent ID
      (item.id[id.length] === '-' || id.includes('-')) // Proper hierarchy
    );
  },

  /**
   * Get the full taxonomy array
   * @returns {Array} - The complete taxonomy array
   */
  getAll: () => {
    return [...TAXONOMY];
  }
};

module.exports = {
  TAXONOMY,
  TaxonomyUtils
};