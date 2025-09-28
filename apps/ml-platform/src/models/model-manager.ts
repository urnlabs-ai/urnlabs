import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Ollama from 'ollama';
import { CohereClient } from 'cohere-ai';
import { HfInference } from '@huggingface/inference';
import {
  ModelProvider,
  ModelInfo,
  ModelRequest,
  ModelResponse,
  TokenUsage,
  ModelCapability
} from '@/types';
import { logger } from '@/lib/logger';
import { config } from '@/lib/config';

export class ModelManager {
  private providers: Map<string, ModelProvider> = new Map();
  private clients: Map<string, any> = new Map();
  private modelCache: Map<string, ModelInfo> = new Map();

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // OpenAI Provider
    if (config.OPENAI_API_KEY) {
      const openaiClient = new OpenAI({
        apiKey: config.OPENAI_API_KEY,
      });

      const openaiProvider: ModelProvider = {
        id: 'openai',
        name: 'OpenAI',
        type: 'openai',
        apiKey: config.OPENAI_API_KEY,
        isActive: true,
        capabilities: ['text-generation', 'text-completion', 'embeddings', 'function-calling', 'fine-tuning'],
        models: [
          {
            id: 'gpt-4-turbo-preview',
            name: 'GPT-4 Turbo',
            provider: 'openai',
            type: 'chat',
            contextLength: 128000,
            inputCost: 0.01,
            outputCost: 0.03,
            capabilities: ['text-generation', 'function-calling', 'streaming']
          },
          {
            id: 'gpt-4',
            name: 'GPT-4',
            provider: 'openai',
            type: 'chat',
            contextLength: 8192,
            inputCost: 0.03,
            outputCost: 0.06,
            capabilities: ['text-generation', 'function-calling', 'streaming']
          },
          {
            id: 'gpt-3.5-turbo',
            name: 'GPT-3.5 Turbo',
            provider: 'openai',
            type: 'chat',
            contextLength: 16385,
            inputCost: 0.0015,
            outputCost: 0.002,
            capabilities: ['text-generation', 'function-calling', 'streaming', 'fine-tuning']
          },
          {
            id: 'text-embedding-3-large',
            name: 'Text Embedding 3 Large',
            provider: 'openai',
            type: 'embedding',
            contextLength: 8191,
            inputCost: 0.00013,
            capabilities: ['embeddings']
          },
          {
            id: 'text-embedding-3-small',
            name: 'Text Embedding 3 Small',
            provider: 'openai',
            type: 'embedding',
            contextLength: 8191,
            inputCost: 0.00002,
            capabilities: ['embeddings']
          }
        ]
      };

      this.providers.set('openai', openaiProvider);
      this.clients.set('openai', openaiClient);
      this.cacheModels(openaiProvider.models);
    }

    // Anthropic Provider
    if (config.ANTHROPIC_API_KEY) {
      const anthropicClient = new Anthropic({
        apiKey: config.ANTHROPIC_API_KEY,
      });

      const anthropicProvider: ModelProvider = {
        id: 'anthropic',
        name: 'Anthropic',
        type: 'anthropic',
        apiKey: config.ANTHROPIC_API_KEY,
        isActive: true,
        capabilities: ['text-generation', 'function-calling', 'streaming'],
        models: [
          {
            id: 'claude-3-opus-20240229',
            name: 'Claude 3 Opus',
            provider: 'anthropic',
            type: 'chat',
            contextLength: 200000,
            inputCost: 0.015,
            outputCost: 0.075,
            capabilities: ['text-generation', 'image-understanding', 'function-calling', 'streaming']
          },
          {
            id: 'claude-3-sonnet-20240229',
            name: 'Claude 3 Sonnet',
            provider: 'anthropic',
            type: 'chat',
            contextLength: 200000,
            inputCost: 0.003,
            outputCost: 0.015,
            capabilities: ['text-generation', 'image-understanding', 'function-calling', 'streaming']
          },
          {
            id: 'claude-3-haiku-20240307',
            name: 'Claude 3 Haiku',
            provider: 'anthropic',
            type: 'chat',
            contextLength: 200000,
            inputCost: 0.00025,
            outputCost: 0.00125,
            capabilities: ['text-generation', 'image-understanding', 'function-calling', 'streaming']
          }
        ]
      };

      this.providers.set('anthropic', anthropicProvider);
      this.clients.set('anthropic', anthropicClient);
      this.cacheModels(anthropicProvider.models);
    }

    // Google Gemini Provider
    if (config.GOOGLE_API_KEY) {
      const googleClient = new GoogleGenerativeAI(config.GOOGLE_API_KEY);

      const googleProvider: ModelProvider = {
        id: 'google',
        name: 'Google',
        type: 'google',
        apiKey: config.GOOGLE_API_KEY,
        isActive: true,
        capabilities: ['text-generation', 'multimodal', 'streaming'],
        models: [
          {
            id: 'gemini-pro',
            name: 'Gemini Pro',
            provider: 'google',
            type: 'chat',
            contextLength: 32768,
            inputCost: 0.0005,
            outputCost: 0.0015,
            capabilities: ['text-generation', 'streaming']
          },
          {
            id: 'gemini-pro-vision',
            name: 'Gemini Pro Vision',
            provider: 'google',
            type: 'multimodal',
            contextLength: 16384,
            inputCost: 0.0005,
            outputCost: 0.0015,
            capabilities: ['text-generation', 'image-understanding', 'streaming']
          }
        ]
      };

      this.providers.set('google', googleProvider);
      this.clients.set('google', googleClient);
      this.cacheModels(googleProvider.models);
    }

    // Ollama Provider (Local)
    if (config.OLLAMA_HOST) {
      const ollamaClient = new Ollama({ host: config.OLLAMA_HOST });

      const ollamaProvider: ModelProvider = {
        id: 'ollama',
        name: 'Ollama',
        type: 'ollama',
        endpoint: config.OLLAMA_HOST,
        isActive: true,
        capabilities: ['text-generation', 'embeddings', 'streaming'],
        models: [] // Will be populated dynamically
      };

      this.providers.set('ollama', ollamaProvider);
      this.clients.set('ollama', ollamaClient);
      this.loadOllamaModels();
    }

    // Cohere Provider
    if (config.COHERE_API_KEY) {
      const cohereClient = new CohereClient({
        token: config.COHERE_API_KEY,
      });

      const cohereProvider: ModelProvider = {
        id: 'cohere',
        name: 'Cohere',
        type: 'cohere',
        apiKey: config.COHERE_API_KEY,
        isActive: true,
        capabilities: ['text-generation', 'embeddings', 'streaming'],
        models: [
          {
            id: 'command',
            name: 'Command',
            provider: 'cohere',
            type: 'chat',
            contextLength: 4096,
            inputCost: 0.0015,
            outputCost: 0.002,
            capabilities: ['text-generation', 'streaming']
          },
          {
            id: 'embed-english-v3.0',
            name: 'Embed English v3.0',
            provider: 'cohere',
            type: 'embedding',
            contextLength: 512,
            inputCost: 0.0001,
            capabilities: ['embeddings']
          }
        ]
      };

      this.providers.set('cohere', cohereProvider);
      this.clients.set('cohere', cohereClient);
      this.cacheModels(cohereProvider.models);
    }

    // Hugging Face Provider
    if (config.HUGGING_FACE_API_KEY) {
      const hfClient = new HfInference(config.HUGGING_FACE_API_KEY);

      const hfProvider: ModelProvider = {
        id: 'huggingface',
        name: 'Hugging Face',
        type: 'huggingface',
        apiKey: config.HUGGING_FACE_API_KEY,
        isActive: true,
        capabilities: ['text-generation', 'embeddings', 'code-generation'],
        models: [
          {
            id: 'microsoft/DialoGPT-large',
            name: 'DialoGPT Large',
            provider: 'huggingface',
            type: 'chat',
            contextLength: 1024,
            capabilities: ['text-generation']
          },
          {
            id: 'sentence-transformers/all-MiniLM-L6-v2',
            name: 'All-MiniLM-L6-v2',
            provider: 'huggingface',
            type: 'embedding',
            contextLength: 512,
            capabilities: ['embeddings']
          }
        ]
      };

      this.providers.set('huggingface', hfProvider);
      this.clients.set('huggingface', hfClient);
      this.cacheModels(hfProvider.models);
    }

    logger.info(`Initialized ${this.providers.size} model providers`);
  }

  private async loadOllamaModels(): Promise<void> {
    try {
      const ollamaClient = this.clients.get('ollama');
      const response = await ollamaClient.list();

      const models: ModelInfo[] = response.models.map((model: any) => ({
        id: model.name,
        name: model.name,
        provider: 'ollama',
        type: 'chat' as const,
        contextLength: 4096, // Default, can be model-specific
        capabilities: ['text-generation', 'streaming'] as ModelCapability[]
      }));

      const ollamaProvider = this.providers.get('ollama');
      if (ollamaProvider) {
        ollamaProvider.models = models;
        this.cacheModels(models);
      }

      logger.info(`Loaded ${models.length} Ollama models`);
    } catch (error) {
      logger.error('Failed to load Ollama models:', error);
    }
  }

  private cacheModels(models: ModelInfo[]): void {
    models.forEach(model => {
      this.modelCache.set(`${model.provider}:${model.id}`, model);
    });
  }

  public getProviders(): ModelProvider[] {
    return Array.from(this.providers.values());
  }

  public getProvider(providerId: string): ModelProvider | undefined {
    return this.providers.get(providerId);
  }

  public getModels(provider?: string): ModelInfo[] {
    if (provider) {
      const providerData = this.providers.get(provider);
      return providerData?.models || [];
    }
    return Array.from(this.modelCache.values());
  }

  public getModel(modelId: string, provider?: string): ModelInfo | undefined {
    if (provider) {
      return this.modelCache.get(`${provider}:${modelId}`);
    }

    // Search across all providers
    for (const [key, model] of this.modelCache.entries()) {
      if (key.endsWith(`:${modelId}`)) {
        return model;
      }
    }
    return undefined;
  }

  public async generateCompletion(request: ModelRequest): Promise<ModelResponse> {
    const startTime = Date.now();

    try {
      // Determine provider and model
      const provider = request.provider || this.inferProvider(request.model);
      const model = this.getModel(request.model, provider);

      if (!model) {
        throw new Error(`Model ${request.model} not found`);
      }

      const client = this.clients.get(provider);
      if (!client) {
        throw new Error(`Provider ${provider} not available`);
      }

      let response: ModelResponse;

      switch (provider) {
        case 'openai':
          response = await this.generateOpenAICompletion(client, request, model);
          break;
        case 'anthropic':
          response = await this.generateAnthropicCompletion(client, request, model);
          break;
        case 'google':
          response = await this.generateGoogleCompletion(client, request, model);
          break;
        case 'ollama':
          response = await this.generateOllamaCompletion(client, request, model);
          break;
        case 'cohere':
          response = await this.generateCohereCompletion(client, request, model);
          break;
        case 'huggingface':
          response = await this.generateHuggingFaceCompletion(client, request, model);
          break;
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }

      const duration = Date.now() - startTime;
      logger.info(`Generated completion in ${duration}ms`, {
        model: request.model,
        provider,
        tokens: response.usage.totalTokens
      });

      return response;
    } catch (error) {
      logger.error('Failed to generate completion:', error);
      throw error;
    }
  }

  private async generateOpenAICompletion(
    client: OpenAI,
    request: ModelRequest,
    model: ModelInfo
  ): Promise<ModelResponse> {
    const response = await client.chat.completions.create({
      model: request.model,
      messages: request.messages || [{ role: 'user', content: request.prompt || '' }],
      temperature: request.temperature || 0.7,
      max_tokens: request.maxTokens || 1000,
      stream: request.stream || false,
      functions: request.functions,
    });

    const choice = response.choices[0];
    const usage: TokenUsage = {
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      totalTokens: response.usage?.total_tokens || 0,
      cost: this.calculateCost(
        response.usage?.prompt_tokens || 0,
        response.usage?.completion_tokens || 0,
        model
      )
    };

    return {
      id: response.id,
      model: request.model,
      provider: 'openai',
      content: choice.message.content || '',
      usage,
      finishReason: choice.finish_reason as any,
      functionCall: choice.message.function_call,
      timestamp: new Date()
    };
  }

  private async generateAnthropicCompletion(
    client: Anthropic,
    request: ModelRequest,
    model: ModelInfo
  ): Promise<ModelResponse> {
    const messages = request.messages || [];
    if (request.prompt) {
      messages.push({ role: 'user', content: request.prompt });
    }

    const response = await client.messages.create({
      model: request.model,
      messages: messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      })),
      max_tokens: request.maxTokens || 1000,
      temperature: request.temperature || 0.7,
      system: request.systemPrompt,
    });

    const usage: TokenUsage = {
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      cost: this.calculateCost(
        response.usage.input_tokens,
        response.usage.output_tokens,
        model
      )
    };

    return {
      id: response.id,
      model: request.model,
      provider: 'anthropic',
      content: response.content[0].type === 'text' ? response.content[0].text : '',
      usage,
      finishReason: response.stop_reason as any,
      timestamp: new Date()
    };
  }

  private async generateGoogleCompletion(
    client: GoogleGenerativeAI,
    request: ModelRequest,
    model: ModelInfo
  ): Promise<ModelResponse> {
    const genModel = client.getGenerativeModel({ model: request.model });

    const prompt = request.prompt ||
      (request.messages?.map(m => `${m.role}: ${m.content}`).join('\n')) || '';

    const result = await genModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Google doesn't provide detailed usage stats
    const estimatedTokens = Math.ceil(text.length / 4);
    const usage: TokenUsage = {
      promptTokens: Math.ceil(prompt.length / 4),
      completionTokens: estimatedTokens,
      totalTokens: Math.ceil(prompt.length / 4) + estimatedTokens,
      cost: this.calculateCost(
        Math.ceil(prompt.length / 4),
        estimatedTokens,
        model
      )
    };

    return {
      id: `google-${Date.now()}`,
      model: request.model,
      provider: 'google',
      content: text,
      usage,
      finishReason: 'stop',
      timestamp: new Date()
    };
  }

  private async generateOllamaCompletion(
    client: any,
    request: ModelRequest,
    model: ModelInfo
  ): Promise<ModelResponse> {
    const prompt = request.prompt ||
      (request.messages?.map(m => `${m.role}: ${m.content}`).join('\n')) || '';

    const response = await client.generate({
      model: request.model,
      prompt,
      options: {
        temperature: request.temperature || 0.7,
        num_predict: request.maxTokens || 1000,
      },
      stream: false
    });

    // Ollama doesn't provide token counts
    const estimatedTokens = Math.ceil(response.response.length / 4);
    const usage: TokenUsage = {
      promptTokens: Math.ceil(prompt.length / 4),
      completionTokens: estimatedTokens,
      totalTokens: Math.ceil(prompt.length / 4) + estimatedTokens,
      cost: 0 // Local model, no cost
    };

    return {
      id: `ollama-${Date.now()}`,
      model: request.model,
      provider: 'ollama',
      content: response.response,
      usage,
      finishReason: 'stop',
      timestamp: new Date()
    };
  }

  private async generateCohereCompletion(
    client: CohereClient,
    request: ModelRequest,
    model: ModelInfo
  ): Promise<ModelResponse> {
    const prompt = request.prompt ||
      (request.messages?.map(m => `${m.role}: ${m.content}`).join('\n')) || '';

    const response = await client.generate({
      model: request.model,
      prompt,
      temperature: request.temperature || 0.7,
      max_tokens: request.maxTokens || 1000,
    });

    const generation = response.generations[0];
    const usage: TokenUsage = {
      promptTokens: 0, // Cohere doesn't provide this
      completionTokens: 0, // Cohere doesn't provide this
      totalTokens: 0,
      cost: this.calculateCost(0, 0, model)
    };

    return {
      id: `cohere-${Date.now()}`,
      model: request.model,
      provider: 'cohere',
      content: generation.text,
      usage,
      finishReason: 'stop',
      timestamp: new Date()
    };
  }

  private async generateHuggingFaceCompletion(
    client: HfInference,
    request: ModelRequest,
    model: ModelInfo
  ): Promise<ModelResponse> {
    const prompt = request.prompt ||
      (request.messages?.map(m => `${m.role}: ${m.content}`).join('\n')) || '';

    const response = await client.textGeneration({
      model: request.model,
      inputs: prompt,
      parameters: {
        temperature: request.temperature || 0.7,
        max_new_tokens: request.maxTokens || 1000,
      }
    });

    const usage: TokenUsage = {
      promptTokens: Math.ceil(prompt.length / 4),
      completionTokens: Math.ceil(response.generated_text.length / 4),
      totalTokens: Math.ceil((prompt.length + response.generated_text.length) / 4),
      cost: 0 // HF doesn't charge for API usage in the same way
    };

    return {
      id: `hf-${Date.now()}`,
      model: request.model,
      provider: 'huggingface',
      content: response.generated_text,
      usage,
      finishReason: 'stop',
      timestamp: new Date()
    };
  }

  private inferProvider(modelId: string): string {
    // Try to infer provider from model ID
    if (modelId.startsWith('gpt-') || modelId.startsWith('text-')) {
      return 'openai';
    }
    if (modelId.startsWith('claude-')) {
      return 'anthropic';
    }
    if (modelId.startsWith('gemini-')) {
      return 'google';
    }
    if (modelId.includes('command') || modelId.includes('embed-')) {
      return 'cohere';
    }

    // Default to first available provider
    return this.providers.keys().next().value || 'openai';
  }

  private calculateCost(inputTokens: number, outputTokens: number, model: ModelInfo): number {
    const inputCost = (inputTokens / 1000) * (model.inputCost || 0);
    const outputCost = (outputTokens / 1000) * (model.outputCost || 0);
    return inputCost + outputCost;
  }

  public async generateEmbedding(text: string, model?: string): Promise<number[]> {
    const embeddingModel = model || 'text-embedding-3-small';
    const provider = this.inferProvider(embeddingModel);
    const client = this.clients.get(provider);

    if (!client) {
      throw new Error(`Provider ${provider} not available for embeddings`);
    }

    switch (provider) {
      case 'openai':
        const response = await client.embeddings.create({
          model: embeddingModel,
          input: text,
        });
        return response.data[0].embedding;

      case 'cohere':
        const cohereResponse = await client.embed({
          model: embeddingModel,
          texts: [text],
        });
        return cohereResponse.embeddings[0];

      default:
        throw new Error(`Embeddings not supported for provider: ${provider}`);
    }
  }

  public async compareModels(
    prompt: string,
    models: string[],
    criteria: string[] = ['quality', 'speed', 'cost']
  ): Promise<any> {
    const results = await Promise.allSettled(
      models.map(async (model) => {
        const startTime = Date.now();
        const response = await this.generateCompletion({
          model,
          prompt,
          temperature: 0.7,
          maxTokens: 500
        });
        const duration = Date.now() - startTime;

        return {
          model,
          response: response.content,
          duration,
          cost: response.usage.cost || 0,
          tokenUsage: response.usage
        };
      })
    );

    // Process results and create comparison
    const validResults = results
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<any>).value);

    return {
      prompt,
      models: models,
      results: validResults,
      comparison: this.analyzeComparison(validResults, criteria),
      timestamp: new Date()
    };
  }

  private analyzeComparison(results: any[], criteria: string[]): any {
    const analysis: any = {
      fastest: null,
      cheapest: null,
      mostTokenEfficient: null,
      recommendations: []
    };

    if (results.length === 0) return analysis;

    // Find fastest
    analysis.fastest = results.reduce((prev, current) =>
      prev.duration < current.duration ? prev : current
    );

    // Find cheapest
    analysis.cheapest = results.reduce((prev, current) =>
      prev.cost < current.cost ? prev : current
    );

    // Find most token efficient
    analysis.mostTokenEfficient = results.reduce((prev, current) =>
      prev.tokenUsage.totalTokens < current.tokenUsage.totalTokens ? prev : current
    );

    // Generate recommendations
    if (criteria.includes('speed')) {
      analysis.recommendations.push(`For speed, use ${analysis.fastest.model}`);
    }
    if (criteria.includes('cost')) {
      analysis.recommendations.push(`For cost efficiency, use ${analysis.cheapest.model}`);
    }

    return analysis;
  }

  public getModelCapabilities(modelId: string, provider?: string): ModelCapability[] {
    const model = this.getModel(modelId, provider);
    return model?.capabilities || [];
  }

  public async healthCheck(): Promise<{ [provider: string]: boolean }> {
    const health: { [provider: string]: boolean } = {};

    for (const [providerId, provider] of this.providers.entries()) {
      try {
        const client = this.clients.get(providerId);

        switch (providerId) {
          case 'openai':
            await client.models.list();
            health[providerId] = true;
            break;

          case 'ollama':
            await client.list();
            health[providerId] = true;
            break;

          default:
            // For other providers, we assume they're healthy if initialized
            health[providerId] = !!client;
        }
      } catch (error) {
        logger.error(`Health check failed for ${providerId}:`, error);
        health[providerId] = false;
      }
    }

    return health;
  }
}