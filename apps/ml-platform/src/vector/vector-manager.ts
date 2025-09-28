import { Pinecone } from '@pinecone-database/pinecone';
import { QdrantClient } from '@qdrant/js-client-rest';
import { 
  VectorDatabase, 
  VectorDatabaseConfig, 
  VectorDocument, 
  VectorSearchQuery, 
  VectorSearchResult,
  EmbeddingModel 
} from '../types/index.js';
import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';

export interface VectorProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  createIndex(name: string, dimensions: number, metric?: string): Promise<void>;
  deleteIndex(name: string): Promise<void>;
  upsert(indexName: string, documents: VectorDocument[]): Promise<void>;
  search(indexName: string, query: VectorSearchQuery): Promise<VectorSearchResult>;
  delete(indexName: string, ids: string[]): Promise<void>;
  getStats(indexName: string): Promise<any>;
  healthCheck(): Promise<boolean>;
}

class PineconeProvider implements VectorProvider {
  private client: Pinecone;
  private config: VectorDatabaseConfig;

  constructor(config: VectorDatabaseConfig) {
    this.config = config;
    this.client = new Pinecone({
      apiKey: config.apiKey!,
      environment: config.endpoint,
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.listIndexes();
      logger.info('Connected to Pinecone');
    } catch (error) {
      logger.error('Failed to connect to Pinecone:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    // Pinecone client doesn't require explicit disconnect
    logger.info('Disconnected from Pinecone');
  }

  async createIndex(name: string, dimensions: number, metric: string = 'cosine'): Promise<void> {
    try {
      await this.client.createIndex({
        name,
        dimension: dimensions,
        metric: metric as any,
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1'
          }
        }
      });
      logger.info(`Created Pinecone index: ${name}`);
    } catch (error) {
      logger.error(`Failed to create Pinecone index ${name}:`, error);
      throw error;
    }
  }

  async deleteIndex(name: string): Promise<void> {
    try {
      await this.client.deleteIndex(name);
      logger.info(`Deleted Pinecone index: ${name}`);
    } catch (error) {
      logger.error(`Failed to delete Pinecone index ${name}:`, error);
      throw error;
    }
  }

  async upsert(indexName: string, documents: VectorDocument[]): Promise<void> {
    try {
      const index = this.client.index(indexName);
      
      const vectors = documents.map(doc => ({
        id: doc.id,
        values: doc.embedding!,
        metadata: {
          content: doc.content,
          ...doc.metadata
        }
      }));

      await index.upsert(vectors);
      logger.info(`Upserted ${documents.length} documents to Pinecone index: ${indexName}`);
    } catch (error) {
      logger.error(`Failed to upsert to Pinecone index ${indexName}:`, error);
      throw error;
    }
  }

  async search(indexName: string, query: VectorSearchQuery): Promise<VectorSearchResult> {
    const startTime = Date.now();
    
    try {
      const index = this.client.index(indexName);
      
      const response = await index.query({
        vector: query.embedding!,
        topK: query.topK || 10,
        filter: query.filter,
        includeMetadata: query.includeMetadata !== false,
        includeValues: false
      });

      const documents: VectorDocument[] = response.matches?.map(match => ({
        id: match.id!,
        content: match.metadata?.content as string || '',
        metadata: match.metadata || {},
        score: match.score
      })) || [];

      const executionTime = Date.now() - startTime;

      return {
        documents,
        query: query.query,
        executionTime,
        totalResults: documents.length
      };
    } catch (error) {
      logger.error(`Failed to search Pinecone index ${indexName}:`, error);
      throw error;
    }
  }

  async delete(indexName: string, ids: string[]): Promise<void> {
    try {
      const index = this.client.index(indexName);
      await index.deleteOne(ids[0]); // Pinecone deletes one at a time
      
      for (const id of ids.slice(1)) {
        await index.deleteOne(id);
      }
      
      logger.info(`Deleted ${ids.length} documents from Pinecone index: ${indexName}`);
    } catch (error) {
      logger.error(`Failed to delete from Pinecone index ${indexName}:`, error);
      throw error;
    }
  }

  async getStats(indexName: string): Promise<any> {
    try {
      const index = this.client.index(indexName);
      const stats = await index.describeIndexStats();
      return stats;
    } catch (error) {
      logger.error(`Failed to get Pinecone index stats ${indexName}:`, error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.listIndexes();
      return true;
    } catch (error) {
      return false;
    }
  }
}

class QdrantProvider implements VectorProvider {
  private client: QdrantClient;
  private config: VectorDatabaseConfig;

  constructor(config: VectorDatabaseConfig) {
    this.config = config;
    this.client = new QdrantClient({
      url: config.endpoint,
      apiKey: config.apiKey,
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.getCollections();
      logger.info('Connected to Qdrant');
    } catch (error) {
      logger.error('Failed to connect to Qdrant:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    // Qdrant client doesn't require explicit disconnect
    logger.info('Disconnected from Qdrant');
  }

  async createIndex(name: string, dimensions: number, metric: string = 'cosine'): Promise<void> {
    try {
      await this.client.createCollection(name, {
        vectors: {
          size: dimensions,
          distance: metric as any
        }
      });
      logger.info(`Created Qdrant collection: ${name}`);
    } catch (error) {
      logger.error(`Failed to create Qdrant collection ${name}:`, error);
      throw error;
    }
  }

  async deleteIndex(name: string): Promise<void> {
    try {
      await this.client.deleteCollection(name);
      logger.info(`Deleted Qdrant collection: ${name}`);
    } catch (error) {
      logger.error(`Failed to delete Qdrant collection ${name}:`, error);
      throw error;
    }
  }

  async upsert(indexName: string, documents: VectorDocument[]): Promise<void> {
    try {
      const points = documents.map(doc => ({
        id: doc.id,
        vector: doc.embedding!,
        payload: {
          content: doc.content,
          ...doc.metadata
        }
      }));

      await this.client.upsert(indexName, {
        wait: true,
        points
      });

      logger.info(`Upserted ${documents.length} documents to Qdrant collection: ${indexName}`);
    } catch (error) {
      logger.error(`Failed to upsert to Qdrant collection ${indexName}:`, error);
      throw error;
    }
  }

  async search(indexName: string, query: VectorSearchQuery): Promise<VectorSearchResult> {
    const startTime = Date.now();
    
    try {
      const response = await this.client.search(indexName, {
        vector: query.embedding!,
        limit: query.topK || 10,
        filter: query.filter ? { must: [query.filter] } : undefined,
        with_payload: query.includeMetadata !== false
      });

      const documents: VectorDocument[] = response.map(point => ({
        id: point.id as string,
        content: point.payload?.content as string || '',
        metadata: point.payload || {},
        score: point.score
      }));

      const executionTime = Date.now() - startTime;

      return {
        documents,
        query: query.query,
        executionTime,
        totalResults: documents.length
      };
    } catch (error) {
      logger.error(`Failed to search Qdrant collection ${indexName}:`, error);
      throw error;
    }
  }

  async delete(indexName: string, ids: string[]): Promise<void> {
    try {
      await this.client.delete(indexName, {
        wait: true,
        points: ids
      });
      
      logger.info(`Deleted ${ids.length} documents from Qdrant collection: ${indexName}`);
    } catch (error) {
      logger.error(`Failed to delete from Qdrant collection ${indexName}:`, error);
      throw error;
    }
  }

  async getStats(indexName: string): Promise<any> {
    try {
      const info = await this.client.getCollection(indexName);
      return info;
    } catch (error) {
      logger.error(`Failed to get Qdrant collection stats ${indexName}:`, error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.getCollections();
      return true;
    } catch (error) {
      return false;
    }
  }
}

export class VectorDatabaseManager {
  private providers: Map<string, VectorProvider> = new Map();
  private activeProvider: string = 'pinecone';
  private embeddingModels: Map<string, EmbeddingModel> = new Map();

  constructor() {
    this.initializeEmbeddingModels();
  }

  private initializeEmbeddingModels(): void {
    // OpenAI Embedding Models
    this.embeddingModels.set('text-embedding-3-large', {
      id: 'text-embedding-3-large',
      provider: 'openai',
      dimensions: 3072,
      maxTokens: 8191,
      cost: 0.00013
    });

    this.embeddingModels.set('text-embedding-3-small', {
      id: 'text-embedding-3-small',
      provider: 'openai',
      dimensions: 1536,
      maxTokens: 8191,
      cost: 0.00002
    });

    // Cohere Embedding Models
    this.embeddingModels.set('embed-english-v3.0', {
      id: 'embed-english-v3.0',
      provider: 'cohere',
      dimensions: 1024,
      maxTokens: 512,
      cost: 0.0001
    });

    // Hugging Face Embedding Models
    this.embeddingModels.set('all-MiniLM-L6-v2', {
      id: 'sentence-transformers/all-MiniLM-L6-v2',
      provider: 'huggingface',
      dimensions: 384,
      maxTokens: 512,
      cost: 0
    });
  }

  async initialize(): Promise<void> {
    // Initialize Pinecone if configured
    if (config.PINECONE_API_KEY && config.PINECONE_ENVIRONMENT) {
      const pineconeConfig: VectorDatabaseConfig = {
        endpoint: config.PINECONE_ENVIRONMENT,
        apiKey: config.PINECONE_API_KEY,
        metric: 'cosine'
      };

      const pineconeProvider = new PineconeProvider(pineconeConfig);
      await pineconeProvider.connect();
      this.providers.set('pinecone', pineconeProvider);
      logger.info('Initialized Pinecone provider');
    }

    // Initialize Qdrant if configured
    if (config.QDRANT_URL) {
      const qdrantConfig: VectorDatabaseConfig = {
        endpoint: config.QDRANT_URL,
        apiKey: config.QDRANT_API_KEY,
        metric: 'cosine'
      };

      const qdrantProvider = new QdrantProvider(qdrantConfig);
      await qdrantProvider.connect();
      this.providers.set('qdrant', qdrantProvider);
      logger.info('Initialized Qdrant provider');
    }

    // Set active provider based on availability
    if (this.providers.has('pinecone')) {
      this.activeProvider = 'pinecone';
    } else if (this.providers.has('qdrant')) {
      this.activeProvider = 'qdrant';
    } else {
      logger.warn('No vector database providers configured');
    }

    logger.info(`Vector Database Manager initialized with ${this.providers.size} providers`);
  }

  async disconnect(): Promise<void> {
    for (const [name, provider] of this.providers.entries()) {
      try {
        await provider.disconnect();
        logger.info(`Disconnected from ${name}`);
      } catch (error) {
        logger.error(`Failed to disconnect from ${name}:`, error);
      }
    }
  }

  setActiveProvider(provider: string): void {
    if (!this.providers.has(provider)) {
      throw new Error(`Provider ${provider} not available`);
    }
    this.activeProvider = provider;
    logger.info(`Switched to vector provider: ${provider}`);
  }

  getActiveProvider(): VectorProvider {
    const provider = this.providers.get(this.activeProvider);
    if (!provider) {
      throw new Error(`No active vector provider available`);
    }
    return provider;
  }

  getProvider(name: string): VectorProvider | undefined {
    return this.providers.get(name);
  }

  getEmbeddingModel(modelId: string): EmbeddingModel | undefined {
    return this.embeddingModels.get(modelId);
  }

  getEmbeddingModels(): EmbeddingModel[] {
    return Array.from(this.embeddingModels.values());
  }

  async createIndex(name: string, dimensions: number, metric?: string, provider?: string): Promise<void> {
    const vectorProvider = provider ? this.getProvider(provider) : this.getActiveProvider();
    if (!vectorProvider) {
      throw new Error(`Provider ${provider || this.activeProvider} not available`);
    }

    await vectorProvider.createIndex(name, dimensions, metric);
    logger.info(`Created vector index: ${name} with ${dimensions} dimensions`);
  }

  async deleteIndex(name: string, provider?: string): Promise<void> {
    const vectorProvider = provider ? this.getProvider(provider) : this.getActiveProvider();
    if (!vectorProvider) {
      throw new Error(`Provider ${provider || this.activeProvider} not available`);
    }

    await vectorProvider.deleteIndex(name);
    logger.info(`Deleted vector index: ${name}`);
  }

  async upsertDocuments(
    indexName: string, 
    documents: VectorDocument[], 
    provider?: string
  ): Promise<void> {
    const vectorProvider = provider ? this.getProvider(provider) : this.getActiveProvider();
    if (!vectorProvider) {
      throw new Error(`Provider ${provider || this.activeProvider} not available`);
    }

    // Validate that all documents have embeddings
    const missingEmbeddings = documents.filter(doc => !doc.embedding || doc.embedding.length === 0);
    if (missingEmbeddings.length > 0) {
      throw new Error(`${missingEmbeddings.length} documents missing embeddings`);
    }

    await vectorProvider.upsert(indexName, documents);
    logger.info(`Upserted ${documents.length} documents to index: ${indexName}`);
  }

  async searchSimilar(
    indexName: string,
    query: VectorSearchQuery,
    provider?: string
  ): Promise<VectorSearchResult> {
    const vectorProvider = provider ? this.getProvider(provider) : this.getActiveProvider();
    if (!vectorProvider) {
      throw new Error(`Provider ${provider || this.activeProvider} not available`);
    }

    if (!query.embedding) {
      throw new Error('Query embedding is required for similarity search');
    }

    const result = await vectorProvider.search(indexName, query);
    
    // Apply threshold filtering if specified
    if (query.threshold && query.threshold > 0) {
      result.documents = result.documents.filter(doc => 
        doc.score !== undefined && doc.score >= query.threshold!
      );
      result.totalResults = result.documents.length;
    }

    logger.info(`Vector search completed: ${result.documents.length} results in ${result.executionTime}ms`);
    return result;
  }

  async deleteDocuments(indexName: string, ids: string[], provider?: string): Promise<void> {
    const vectorProvider = provider ? this.getProvider(provider) : this.getActiveProvider();
    if (!vectorProvider) {
      throw new Error(`Provider ${provider || this.activeProvider} not available`);
    }

    await vectorProvider.delete(indexName, ids);
    logger.info(`Deleted ${ids.length} documents from index: ${indexName}`);
  }

  async getIndexStats(indexName: string, provider?: string): Promise<any> {
    const vectorProvider = provider ? this.getProvider(provider) : this.getActiveProvider();
    if (!vectorProvider) {
      throw new Error(`Provider ${provider || this.activeProvider} not available`);
    }

    return await vectorProvider.getStats(indexName);
  }

  async healthCheck(): Promise<{ [provider: string]: boolean }> {
    const health: { [provider: string]: boolean } = {};

    for (const [name, provider] of this.providers.entries()) {
      try {
        health[name] = await provider.healthCheck();
      } catch (error) {
        health[name] = false;
        logger.error(`Health check failed for vector provider ${name}:`, error);
      }
    }

    return health;
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  getActiveProviderName(): string {
    return this.activeProvider;
  }

  // RAG Helper Methods
  async createRAGIndex(
    name: string, 
    embeddingModel: string = 'text-embedding-3-small',
    provider?: string
  ): Promise<void> {
    const model = this.getEmbeddingModel(embeddingModel);
    if (!model) {
      throw new Error(`Embedding model ${embeddingModel} not found`);
    }

    await this.createIndex(name, model.dimensions, 'cosine', provider);
    logger.info(`Created RAG index: ${name} for model: ${embeddingModel}`);
  }

  async addDocumentsToRAG(
    indexName: string,
    documents: Array<{ id: string; content: string; metadata?: Record<string, any> }>,
    embeddingModel: string = 'text-embedding-3-small',
    generateEmbeddings: (texts: string[], model: string) => Promise<number[][]>,
    provider?: string
  ): Promise<void> {
    const texts = documents.map(doc => doc.content);
    const embeddings = await generateEmbeddings(texts, embeddingModel);

    const vectorDocuments: VectorDocument[] = documents.map((doc, index) => ({
      id: doc.id,
      content: doc.content,
      embedding: embeddings[index],
      metadata: doc.metadata || {}
    }));

    await this.upsertDocuments(indexName, vectorDocuments, provider);
    logger.info(`Added ${documents.length} documents to RAG index: ${indexName}`);
  }

  async searchRAG(
    indexName: string,
    queryEmbedding: number[],
    topK: number = 5,
    threshold?: number,
    filter?: Record<string, any>,
    provider?: string
  ): Promise<VectorSearchResult> {
    const query: VectorSearchQuery = {
      query: 'RAG search',
      embedding: queryEmbedding,
      topK,
      threshold,
      filter,
      includeMetadata: true
    };

    return await this.searchSimilar(indexName, query, provider);
  }
}