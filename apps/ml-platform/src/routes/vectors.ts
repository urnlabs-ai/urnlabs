import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { VectorDocument, VectorSearchQuery } from '../types/index.js';
import { logger, logVectorSearch } from '../lib/logger.js';

// Request schemas
const createIndexSchema = z.object({
  name: z.string().min(1).max(100),
  dimensions: z.number().min(1).max(10000),
  metric: z.enum(['cosine', 'euclidean', 'dotproduct']).optional(),
  provider: z.string().optional()
});

const upsertDocumentsSchema = z.object({
  indexName: z.string().min(1),
  documents: z.array(z.object({
    id: z.string().min(1),
    content: z.string().min(1),
    embedding: z.array(z.number()).optional(),
    metadata: z.record(z.any()).optional()
  })).min(1).max(1000),
  provider: z.string().optional()
});

const searchSchema = z.object({
  indexName: z.string().min(1),
  query: z.string().min(1),
  embedding: z.array(z.number()).optional(),
  topK: z.number().min(1).max(100).optional(),
  threshold: z.number().min(0).max(1).optional(),
  filter: z.record(z.any()).optional(),
  includeMetadata: z.boolean().optional(),
  provider: z.string().optional()
});

const generateEmbeddingsSchema = z.object({
  texts: z.array(z.string()).min(1).max(100),
  model: z.string().optional()
});

const deleteDocumentsSchema = z.object({
  indexName: z.string().min(1),
  ids: z.array(z.string()).min(1).max(1000),
  provider: z.string().optional()
});

export async function vectorRoutes(fastify: FastifyInstance): Promise<void> {
  const { vectorManager, modelManager, mlopsManager } = fastify.platform;

  // Get available providers
  fastify.get('/providers', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const providers = vectorManager.getAvailableProviders();
      const activeProvider = vectorManager.getActiveProviderName();

      return {
        success: true,
        data: {
          providers,
          activeProvider,
          count: providers.length
        },
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to get vector providers:', error);
      reply.status(500);
      return {
        success: false,
        error: 'Failed to retrieve vector providers',
        timestamp: new Date()
      };
    }
  });

  // Switch active provider
  fastify.post('/providers/:providerId/activate', async (request: FastifyRequest<{
    Params: { providerId: string }
  }>, reply: FastifyReply) => {
    try {
      const { providerId } = request.params;
      vectorManager.setActiveProvider(providerId);

      return {
        success: true,
        data: {
          activeProvider: providerId,
          message: `Switched to provider: ${providerId}`
        },
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to switch vector provider:', error);
      reply.status(400);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to switch provider',
        timestamp: new Date()
      };
    }
  });

  // Get embedding models
  fastify.get('/embedding-models', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const models = vectorManager.getEmbeddingModels();

      return {
        success: true,
        data: models,
        count: models.length,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to get embedding models:', error);
      reply.status(500);
      return {
        success: false,
        error: 'Failed to retrieve embedding models',
        timestamp: new Date()
      };
    }
  });

  // Create vector index
  fastify.post('/indexes', async (request: FastifyRequest<{
    Body: z.infer<typeof createIndexSchema>
  }>, reply: FastifyReply) => {
    try {
      const { name, dimensions, metric, provider } = createIndexSchema.parse(request.body);

      await vectorManager.createIndex(name, dimensions, metric, provider);

      return {
        success: true,
        data: {
          indexName: name,
          dimensions,
          metric: metric || 'cosine',
          provider: provider || vectorManager.getActiveProviderName(),
          message: `Index ${name} created successfully`
        },
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to create vector index:', error);
      
      if (error instanceof z.ZodError) {
        reply.status(400);
        return {
          success: false,
          error: 'Invalid request format',
          details: error.errors,
          timestamp: new Date()
        };
      }

      reply.status(500);
      return {
        success: false,
        error: 'Failed to create index',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  });

  // Delete vector index
  fastify.delete('/indexes/:indexName', async (request: FastifyRequest<{
    Params: { indexName: string }
    Querystring: { provider?: string }
  }>, reply: FastifyReply) => {
    try {
      const { indexName } = request.params;
      const { provider } = request.query;

      await vectorManager.deleteIndex(indexName, provider);

      return {
        success: true,
        data: {
          indexName,
          provider: provider || vectorManager.getActiveProviderName(),
          message: `Index ${indexName} deleted successfully`
        },
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to delete vector index:', error);
      reply.status(500);
      return {
        success: false,
        error: 'Failed to delete index',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  });

  // Get index statistics
  fastify.get('/indexes/:indexName/stats', async (request: FastifyRequest<{
    Params: { indexName: string }
    Querystring: { provider?: string }
  }>, reply: FastifyReply) => {
    try {
      const { indexName } = request.params;
      const { provider } = request.query;

      const stats = await vectorManager.getIndexStats(indexName, provider);

      return {
        success: true,
        data: {
          indexName,
          provider: provider || vectorManager.getActiveProviderName(),
          stats
        },
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to get index stats:', error);
      reply.status(500);
      return {
        success: false,
        error: 'Failed to retrieve index statistics',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  });

  // Generate embeddings
  fastify.post('/embeddings', async (request: FastifyRequest<{
    Body: z.infer<typeof generateEmbeddingsSchema>
  }>, reply: FastifyReply) => {
    try {
      const { texts, model } = generateEmbeddingsSchema.parse(request.body);
      const startTime = Date.now();

      const embeddings = await Promise.all(
        texts.map(text => modelManager.generateEmbedding(text, model))
      );

      const duration = Date.now() - startTime;

      return {
        success: true,
        data: {
          embeddings,
          model: model || 'text-embedding-3-small',
          dimensions: embeddings[0]?.length || 0,
          count: embeddings.length
        },
        performance: {
          duration,
          embeddingsPerSecond: embeddings.length / (duration / 1000)
        },
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to generate embeddings:', error);
      
      if (error instanceof z.ZodError) {
        reply.status(400);
        return {
          success: false,
          error: 'Invalid request format',
          details: error.errors,
          timestamp: new Date()
        };
      }

      reply.status(500);
      return {
        success: false,
        error: 'Failed to generate embeddings',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  });

  // Upsert documents
  fastify.post('/documents', async (request: FastifyRequest<{
    Body: z.infer<typeof upsertDocumentsSchema>
  }>, reply: FastifyReply) => {
    try {
      const { indexName, documents, provider } = upsertDocumentsSchema.parse(request.body);
      const startTime = Date.now();

      // Generate embeddings for documents that don't have them
      const documentsWithEmbeddings: VectorDocument[] = await Promise.all(
        documents.map(async (doc) => {
          if (!doc.embedding) {
            const embedding = await modelManager.generateEmbedding(doc.content);
            return { ...doc, embedding };
          }
          return doc as VectorDocument;
        })
      );

      await vectorManager.upsertDocuments(indexName, documentsWithEmbeddings, provider);
      const duration = Date.now() - startTime;

      return {
        success: true,
        data: {
          indexName,
          provider: provider || vectorManager.getActiveProviderName(),
          documentsProcessed: documents.length,
          embeddingsGenerated: documents.filter(d => !d.embedding).length,
          message: `${documents.length} documents upserted successfully`
        },
        performance: {
          duration,
          documentsPerSecond: documents.length / (duration / 1000)
        },
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to upsert documents:', error);
      
      if (error instanceof z.ZodError) {
        reply.status(400);
        return {
          success: false,
          error: 'Invalid request format',
          details: error.errors,
          timestamp: new Date()
        };
      }

      reply.status(500);
      return {
        success: false,
        error: 'Failed to upsert documents',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  });

  // Search vectors
  fastify.post('/search', async (request: FastifyRequest<{
    Body: z.infer<typeof searchSchema>
  }>, reply: FastifyReply) => {
    try {
      const searchParams = searchSchema.parse(request.body);
      const startTime = Date.now();

      let queryEmbedding = searchParams.embedding;

      // Generate embedding if not provided
      if (!queryEmbedding && searchParams.query) {
        queryEmbedding = await modelManager.generateEmbedding(searchParams.query);
      }

      if (!queryEmbedding) {
        reply.status(400);
        return {
          success: false,
          error: 'Either query text or embedding must be provided',
          timestamp: new Date()
        };
      }

      const searchQuery: VectorSearchQuery = {
        ...searchParams,
        embedding: queryEmbedding
      };

      const result = await vectorManager.searchSimilar(
        searchParams.indexName,
        searchQuery,
        searchParams.provider
      );

      const duration = Date.now() - startTime;

      // Log metrics
      logVectorSearch(
        searchParams.indexName,
        searchParams.provider || vectorManager.getActiveProviderName(),
        result.documents.length,
        duration
      );

      // Record metrics for MLOps
      await mlopsManager.recordVectorSearch(
        searchParams.indexName,
        searchParams.provider || vectorManager.getActiveProviderName(),
        duration,
        result.documents.length,
        true
      );

      return {
        success: true,
        data: result,
        performance: {
          duration,
          searchLatency: duration,
          resultsPerSecond: result.documents.length / (duration / 1000)
        },
        timestamp: new Date()
      };

    } catch (error) {
      const duration = Date.now() - Date.now();
      
      // Record failed search
      await mlopsManager.recordVectorSearch(
        'unknown',
        'unknown',
        duration,
        0,
        false
      );

      logger.error('Vector search failed:', error);
      
      if (error instanceof z.ZodError) {
        reply.status(400);
        return {
          success: false,
          error: 'Invalid request format',
          details: error.errors,
          timestamp: new Date()
        };
      }

      reply.status(500);
      return {
        success: false,
        error: 'Vector search failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  });

  // Delete documents
  fastify.delete('/documents', async (request: FastifyRequest<{
    Body: z.infer<typeof deleteDocumentsSchema>
  }>, reply: FastifyReply) => {
    try {
      const { indexName, ids, provider } = deleteDocumentsSchema.parse(request.body);

      await vectorManager.deleteDocuments(indexName, ids, provider);

      return {
        success: true,
        data: {
          indexName,
          provider: provider || vectorManager.getActiveProviderName(),
          deletedCount: ids.length,
          deletedIds: ids,
          message: `${ids.length} documents deleted successfully`
        },
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to delete documents:', error);
      
      if (error instanceof z.ZodError) {
        reply.status(400);
        return {
          success: false,
          error: 'Invalid request format',
          details: error.errors,
          timestamp: new Date()
        };
      }

      reply.status(500);
      return {
        success: false,
        error: 'Failed to delete documents',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  });

  // RAG - Create RAG index
  fastify.post('/rag/indexes', async (request: FastifyRequest<{
    Body: {
      name: string;
      embeddingModel?: string;
      provider?: string;
    }
  }>, reply: FastifyReply) => {
    try {
      const { name, embeddingModel, provider } = request.body;

      await vectorManager.createRAGIndex(name, embeddingModel, provider);

      return {
        success: true,
        data: {
          indexName: name,
          embeddingModel: embeddingModel || 'text-embedding-3-small',
          provider: provider || vectorManager.getActiveProviderName(),
          message: `RAG index ${name} created successfully`
        },
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to create RAG index:', error);
      reply.status(500);
      return {
        success: false,
        error: 'Failed to create RAG index',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  });

  // RAG - Add documents
  fastify.post('/rag/documents', async (request: FastifyRequest<{
    Body: {
      indexName: string;
      documents: Array<{
        id: string;
        content: string;
        metadata?: Record<string, any>;
      }>;
      embeddingModel?: string;
      provider?: string;
    }
  }>, reply: FastifyReply) => {
    try {
      const { indexName, documents, embeddingModel, provider } = request.body;
      const startTime = Date.now();

      const generateEmbeddings = async (texts: string[], model: string) => {
        return Promise.all(texts.map(text => modelManager.generateEmbedding(text, model)));
      };

      await vectorManager.addDocumentsToRAG(
        indexName,
        documents,
        embeddingModel,
        generateEmbeddings,
        provider
      );

      const duration = Date.now() - startTime;

      return {
        success: true,
        data: {
          indexName,
          documentsAdded: documents.length,
          embeddingModel: embeddingModel || 'text-embedding-3-small',
          provider: provider || vectorManager.getActiveProviderName(),
          message: `${documents.length} documents added to RAG index`
        },
        performance: {
          duration,
          documentsPerSecond: documents.length / (duration / 1000)
        },
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to add documents to RAG:', error);
      reply.status(500);
      return {
        success: false,
        error: 'Failed to add documents to RAG index',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  });

  // RAG - Search
  fastify.post('/rag/search', async (request: FastifyRequest<{
    Body: {
      indexName: string;
      query: string;
      topK?: number;
      threshold?: number;
      filter?: Record<string, any>;
      embeddingModel?: string;
      provider?: string;
    }
  }>, reply: FastifyReply) => {
    try {
      const { 
        indexName, 
        query, 
        topK, 
        threshold, 
        filter, 
        embeddingModel, 
        provider 
      } = request.body;

      const startTime = Date.now();

      // Generate query embedding
      const queryEmbedding = await modelManager.generateEmbedding(
        query, 
        embeddingModel
      );

      const result = await vectorManager.searchRAG(
        indexName,
        queryEmbedding,
        topK,
        threshold,
        filter,
        provider
      );

      const duration = Date.now() - startTime;

      return {
        success: true,
        data: {
          query,
          indexName,
          results: result.documents,
          totalResults: result.totalResults,
          executionTime: result.executionTime
        },
        performance: {
          duration,
          embeddingGenerationTime: duration - result.executionTime,
          searchTime: result.executionTime
        },
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('RAG search failed:', error);
      reply.status(500);
      return {
        success: false,
        error: 'RAG search failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  });

  // Vector database health check
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = await vectorManager.healthCheck();
      const allHealthy = Object.values(health).every(status => status);

      return {
        success: true,
        data: {
          overall: allHealthy ? 'healthy' : 'degraded',
          providers: health,
          activeProvider: vectorManager.getActiveProviderName()
        },
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Vector health check failed:', error);
      reply.status(500);
      return {
        success: false,
        error: 'Health check failed',
        timestamp: new Date()
      };
    }
  });
}