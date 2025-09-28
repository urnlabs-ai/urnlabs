import { WAFRule } from '../types.js';

/**
 * API-Specific Protection Rules
 * Tailored for protecting REST APIs, GraphQL, and other API endpoints
 */
export const API_PROTECTION_RULES: WAFRule[] = [
  // API Rate Limiting
  {
    id: 'api_001_rate_limiting',
    name: 'API Rate Limiting',
    description: 'Rate limiting for API endpoints to prevent abuse',
    category: 'rate_limiting',
    threatLevel: 'medium',
    action: 'block',
    enabled: true,
    paths: ['/api/*', '/v1/*', '/v2/*', '/graphql'],
    rateLimit: {
      maxRequests: 100,
      window: 60, // 1 minute
      byIP: true
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['api', 'rate-limiting', 'dos-protection']
  },

  // GraphQL Query Depth Limiting
  {
    id: 'api_002_graphql_depth',
    name: 'GraphQL Query Depth Protection',
    description: 'Prevents deeply nested GraphQL queries that could cause DoS',
    category: 'custom',
    threatLevel: 'high',
    action: 'block',
    enabled: true,
    paths: ['/graphql', '/api/graphql'],
    methods: ['POST'],
    customPattern: '(query|mutation|subscription)\\s*{[^}]*{[^}]*{[^}]*{[^}]*{[^}]*{[^}]*{[^}]*{',
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['api', 'graphql', 'dos-protection', 'query-depth']
  },

  // GraphQL Introspection Protection
  {
    id: 'api_003_graphql_introspection',
    name: 'GraphQL Introspection Protection',
    description: 'Blocks GraphQL introspection queries in production',
    category: 'information_disclosure',
    threatLevel: 'medium',
    action: 'block',
    enabled: true,
    paths: ['/graphql', '/api/graphql'],
    patterns: [
      '__schema',
      '__type',
      '__typename',
      '__Field',
      '__Directive',
      '__EnumValue',
      '__InputValue',
      'IntrospectionQuery'
    ],
    customPattern: '(__schema|__type|__typename|__Field|__Directive|__EnumValue|__InputValue|IntrospectionQuery)',
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['api', 'graphql', 'introspection', 'information-disclosure']
  },

  // API Version Fuzzing Protection
  {
    id: 'api_004_version_fuzzing',
    name: 'API Version Fuzzing Protection',
    description: 'Blocks attempts to fuzz API versions',
    category: 'information_disclosure',
    threatLevel: 'low',
    action: 'log',
    enabled: true,
    patterns: [
      '/v0/',
      '/v99/',
      '/v100/',
      '/api/v0/',
      '/api/v99/',
      '/api/v100/',
      '/version/',
      '/versions/',
      '/api/version',
      '/api/versions'
    ],
    customPattern: '/(v(0|99|1[0-9][0-9])|version|versions)/',
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['api', 'fuzzing', 'reconnaissance']
  },

  // REST API Method Override Protection
  {
    id: 'api_005_method_override',
    name: 'HTTP Method Override Protection',
    description: 'Blocks HTTP method override attempts that could bypass security',
    category: 'http_verb_tampering',
    threatLevel: 'medium',
    action: 'block',
    enabled: true,
    headers: {
      'X-HTTP-Method-Override': '.*',
      'X-HTTP-Method': '.*',
      'X-Method-Override': '.*'
    },
    patterns: [
      'X-HTTP-Method-Override',
      'X-HTTP-Method',
      'X-Method-Override',
      '_method='
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['api', 'method-override', 'verb-tampering']
  },

  // API Payload Size Protection
  {
    id: 'api_006_payload_size',
    name: 'API Payload Size Protection',
    description: 'Blocks oversized payloads that could cause DoS',
    category: 'custom',
    threatLevel: 'medium',
    action: 'block',
    enabled: true,
    paths: ['/api/*', '/graphql'],
    methods: ['POST', 'PUT', 'PATCH'],
    customPattern: '', // Implemented in service logic
    metadata: {
      maxPayloadSize: 1048576 // 1MB
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['api', 'payload-size', 'dos-protection']
  },

  // API Content-Type Validation
  {
    id: 'api_007_content_type',
    name: 'API Content-Type Validation',
    description: 'Validates Content-Type headers for API requests',
    category: 'custom',
    threatLevel: 'low',
    action: 'block',
    enabled: true,
    paths: ['/api/*', '/graphql'],
    methods: ['POST', 'PUT', 'PATCH'],
    metadata: {
      allowedContentTypes: [
        'application/json',
        'application/x-www-form-urlencoded',
        'multipart/form-data',
        'text/plain'
      ]
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['api', 'content-type', 'validation']
  },

  // API Authentication Bypass Attempts
  {
    id: 'api_008_auth_bypass',
    name: 'API Authentication Bypass Detection',
    description: 'Detects attempts to bypass API authentication',
    category: 'information_disclosure',
    threatLevel: 'high',
    action: 'block',
    enabled: true,
    paths: ['/api/*'],
    patterns: [
      'Authorization: Bearer null',
      'Authorization: Bearer undefined',
      'Authorization: Bearer ',
      'Authorization: null',
      'Authorization: undefined',
      'Authorization: ',
      'X-API-Key: null',
      'X-API-Key: undefined',
      'X-API-Key: ',
      'token=null',
      'token=undefined',
      'token=',
      'api_key=null',
      'api_key=undefined',
      'api_key=',
      'access_token=null',
      'access_token=undefined',
      'access_token='
    ],
    customPattern: '(Authorization:\\s*(Bearer\\s*)?(null|undefined|$)|X-API-Key:\\s*(null|undefined|$)|(token|api_key|access_token)=(null|undefined|$))',
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['api', 'authentication', 'bypass']
  },

  // API Parameter Pollution
  {
    id: 'api_009_parameter_pollution',
    name: 'API Parameter Pollution Detection',
    description: 'Detects HTTP parameter pollution attacks',
    category: 'custom',
    threatLevel: 'medium',
    action: 'block',
    enabled: true,
    paths: ['/api/*'],
    customPattern: '([?&]\\w+=[^&]*&\\w*\\1=|[?&]\\w+\\[\\]=.*&\\w*\\1\\[\\]=)',
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['api', 'parameter-pollution', 'hpp']
  },

  // API JSON Structure Attacks
  {
    id: 'api_010_json_structure',
    name: 'JSON Structure Attack Detection',
    description: 'Detects malformed JSON and JSON structure attacks',
    category: 'custom',
    threatLevel: 'medium',
    action: 'block',
    enabled: true,
    paths: ['/api/*', '/graphql'],
    methods: ['POST', 'PUT', 'PATCH'],
    patterns: [
      '{"[^"]{1000,}":',
      '"[^"]{1000,}":',
      '\\\\u0000',
      '\\\\x00',
      '\\\\n{100,}',
      '\\\\r{100,}',
      '\\\\t{100,}',
      '\\\\\\\\{100,}'
    ],
    customPattern: '({"[^"]{1000,}":|"[^"]{1000,}":|\\\\\\\u0000|\\\\\\\x00|\\\\\\\n{100,}|\\\\\\\r{100,}|\\\\\\\t{100,}|\\\\\\\\{100,})',
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['api', 'json', 'structure-attack']
  },

  // API Prototype Pollution
  {
    id: 'api_011_prototype_pollution',
    name: 'Prototype Pollution Detection',
    description: 'Detects JavaScript prototype pollution attempts',
    category: 'custom',
    threatLevel: 'high',
    action: 'block',
    enabled: true,
    paths: ['/api/*'],
    patterns: [
      '__proto__',
      'constructor.prototype',
      'prototype.constructor',
      '"__proto__"',
      '"constructor"',
      '"prototype"',
      '.constructor.prototype',
      '.prototype.constructor',
      '["__proto__"]',
      '["constructor"]',
      '["prototype"]'
    ],
    customPattern: '(__proto__|constructor\\.prototype|prototype\\.constructor|"(__proto__|constructor|prototype)"|\\["(__proto__|constructor|prototype)"\\])',
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['api', 'prototype-pollution', 'javascript']
  },

  // API CORS Preflight Abuse
  {
    id: 'api_012_cors_abuse',
    name: 'CORS Preflight Abuse Detection',
    description: 'Detects abuse of CORS preflight requests',
    category: 'custom',
    threatLevel: 'low',
    action: 'log',
    enabled: true,
    methods: ['OPTIONS'],
    paths: ['/api/*'],
    rateLimit: {
      maxRequests: 20,
      window: 60,
      byIP: true
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['api', 'cors', 'preflight', 'abuse']
  },

  // API WebSocket Upgrade Abuse
  {
    id: 'api_013_websocket_abuse',
    name: 'WebSocket Upgrade Abuse Detection',
    description: 'Detects abuse of WebSocket upgrade requests',
    category: 'custom',
    threatLevel: 'medium',
    action: 'block',
    enabled: true,
    headers: {
      'Upgrade': 'websocket',
      'Connection': 'upgrade'
    },
    rateLimit: {
      maxRequests: 10,
      window: 60,
      byIP: true
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['api', 'websocket', 'upgrade', 'abuse']
  },

  // API Server-Sent Events Abuse
  {
    id: 'api_014_sse_abuse',
    name: 'Server-Sent Events Abuse Detection',
    description: 'Detects abuse of Server-Sent Events endpoints',
    category: 'custom',
    threatLevel: 'medium',
    action: 'block',
    enabled: true,
    headers: {
      'Accept': 'text/event-stream'
    },
    rateLimit: {
      maxRequests: 5,
      window: 60,
      byIP: true
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['api', 'sse', 'server-sent-events', 'abuse']
  },

  // API Cache Poisoning
  {
    id: 'api_015_cache_poisoning',
    name: 'Cache Poisoning Detection',
    description: 'Detects HTTP cache poisoning attempts',
    category: 'custom',
    threatLevel: 'medium',
    action: 'block',
    enabled: true,
    paths: ['/api/*'],
    headers: {
      'X-Forwarded-Host': '.*',
      'X-Forwarded-Server': '.*',
      'X-Host': '.*',
      'X-Original-URL': '.*',
      'X-Rewrite-URL': '.*'
    },
    patterns: [
      'X-Forwarded-Host:',
      'X-Forwarded-Server:',
      'X-Host:',
      'X-Original-URL:',
      'X-Rewrite-URL:'
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['api', 'cache-poisoning', 'header-injection']
  },

  // API Mass Assignment Protection
  {
    id: 'api_016_mass_assignment',
    name: 'Mass Assignment Protection',
    description: 'Detects potential mass assignment attacks',
    category: 'custom',
    threatLevel: 'medium',
    action: 'log',
    enabled: true,
    paths: ['/api/*'],
    methods: ['POST', 'PUT', 'PATCH'],
    patterns: [
      'id=',
      'user_id=',
      'admin=',
      'role=',
      'is_admin=',
      'is_active=',
      'permissions=',
      'created_at=',
      'updated_at=',
      'password=',
      'password_hash=',
      'salt=',
      'token=',
      'secret='
    ],
    customPattern: '(id|user_id|admin|role|is_admin|is_active|permissions|created_at|updated_at|password|password_hash|salt|token|secret)\\s*=',
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['api', 'mass-assignment', 'privilege-escalation']
  },

  // API Blind SQL Injection (Time-based)
  {
    id: 'api_017_blind_sqli_time',
    name: 'Blind SQL Injection (Time-based) Detection',
    description: 'Detects time-based blind SQL injection attempts',
    category: 'sql_injection',
    threatLevel: 'high',
    action: 'block',
    enabled: true,
    paths: ['/api/*'],
    patterns: [
      'WAITFOR DELAY',
      'pg_sleep(',
      'sleep(',
      'benchmark(',
      'SLEEP(',
      'DELAY(',
      'WAIT(',
      'TIMEOUT(',
      'DBMS_PIPE.RECEIVE_MESSAGE',
      'UTL_INADDR.get_host_name'
    ],
    customPattern: '(WAITFOR\\s+DELAY|pg_sleep\\s*\\(|sleep\\s*\\(|benchmark\\s*\\(|SLEEP\\s*\\(|DELAY\\s*\\(|WAIT\\s*\\(|TIMEOUT\\s*\\(|DBMS_PIPE\\.RECEIVE_MESSAGE|UTL_INADDR\\.get_host_name)',
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['api', 'sql-injection', 'blind', 'time-based']
  },

  // API Error-based SQL Injection
  {
    id: 'api_018_error_sqli',
    name: 'Error-based SQL Injection Detection',
    description: 'Detects error-based SQL injection attempts',
    category: 'sql_injection',
    threatLevel: 'high',
    action: 'block',
    enabled: true,
    paths: ['/api/*'],
    patterns: [
      'extractvalue(',
      'updatexml(',
      'exp(',
      'convert(',
      'cast(',
      'concat(',
      'group_concat(',
      'floor(rand(',
      'count(*)',
      'floor(',
      'rand(',
      'md5(',
      'sha1(',
      'sys.fn_varbintohexstr'
    ],
    customPattern: '(extractvalue\\s*\\(|updatexml\\s*\\(|exp\\s*\\(|convert\\s*\\(|cast\\s*\\(|concat\\s*\\(|group_concat\\s*\\(|floor\\s*\\(\\s*rand\\s*\\(|count\\s*\\(\\s*\\*\\s*\\)|floor\\s*\\(|rand\\s*\\(|md5\\s*\\(|sha1\\s*\\(|sys\\.fn_varbintohexstr)',
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['api', 'sql-injection', 'error-based']
  },

  // API Boolean-based SQL Injection
  {
    id: 'api_019_boolean_sqli',
    name: 'Boolean-based SQL Injection Detection',
    description: 'Detects boolean-based SQL injection attempts',
    category: 'sql_injection',
    threatLevel: 'high',
    action: 'block',
    enabled: true,
    paths: ['/api/*'],
    patterns: [
      'AND 1=1',
      'AND 1=2',
      'OR 1=1',
      'OR 1=2',
      'AND true',
      'AND false',
      'OR true',
      'OR false',
      'AND 1<2',
      'AND 1>2',
      'OR 1<2',
      'OR 1>2',
      'AND ASCII(',
      'AND SUBSTRING(',
      'AND LENGTH(',
      'AND CHAR(',
      'OR ASCII(',
      'OR SUBSTRING(',
      'OR LENGTH(',
      'OR CHAR('
    ],
    customPattern: '((AND|OR)\\s+(1=[12]|true|false|1[<>]2|ASCII\\s*\\(|SUBSTRING\\s*\\(|LENGTH\\s*\\(|CHAR\\s*\\())',
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['api', 'sql-injection', 'boolean-based']
  },

  // API NoSQL Injection (MongoDB)
  {
    id: 'api_020_nosql_mongodb',
    name: 'NoSQL Injection (MongoDB) Detection',
    description: 'Detects MongoDB-specific NoSQL injection attempts',
    category: 'nosql_injection',
    threatLevel: 'high',
    action: 'block',
    enabled: true,
    paths: ['/api/*'],
    patterns: [
      '$where',
      '$ne',
      '$gt',
      '$lt',
      '$gte',
      '$lte',
      '$regex',
      '$exists',
      '$type',
      '$in',
      '$nin',
      '$all',
      '$size',
      '$elemMatch',
      '$slice',
      '$push',
      '$pull',
      '$pop',
      '$addToSet',
      '$each',
      '$sort',
      '$unset'
    ],
    customPattern: '(\\$(where|ne|gt|lt|gte|lte|regex|exists|type|in|nin|all|size|elemMatch|slice|push|pull|pop|addToSet|each|sort|unset))',
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['api', 'nosql-injection', 'mongodb']
  }
];

export default API_PROTECTION_RULES;