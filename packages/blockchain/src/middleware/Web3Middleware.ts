import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import WalletManager from '../services/WalletManager';
import CrossChainBridgeManager from '../services/CrossChainBridgeManager';
import IPFSManager from '../services/IPFSManager';
import NFTMetadataEnhancer from '../services/NFTMetadataEnhancer';
import DAOGovernanceManager from '../services/DAOGovernanceManager';

export interface Web3MiddlewareConfig {
  rpcUrls: Record<number, string>;
  contractAddresses: {
    urnToken: string;
    agentNFT: string;
    enhancedAgentNFT: string;
    daoGovernance: string;
    treasuryManager: string;
    crossChainBridge: string;
    yieldFarm: string;
    liquidityManager: string;
    rewardDistributor: string;
  };
  ipfsConfig: {
    url: string;
    pinataApiKey?: string;
    pinataSecretKey?: string;
  };
  gasOptimization: {
    enabled: boolean;
    maxGasPrice: string;
    gasLimitMultiplier: number;
  };
  enabledFeatures: {
    walletIntegration: boolean;
    crossChainBridge: boolean;
    nftMetadata: boolean;
    daoGovernance: boolean;
    defiProtocol: boolean;
  };
}

export interface Web3Context {
  chainId?: number;
  userAddress?: string;
  signature?: string;
  nonce?: string;
  timestamp?: number;
  gasPrice?: bigint;
  gasLimit?: bigint;
}

export interface BlockchainTransactionRequest {
  to: string;
  data: string;
  value?: bigint;
  gasLimit?: bigint;
  gasPrice?: bigint;
  chainId?: number;
}

export interface BlockchainQueryRequest {
  contract: string;
  method: string;
  args: any[];
  chainId?: number;
}

export class Web3Middleware extends EventEmitter {
  private config: Web3MiddlewareConfig;
  private providers: Map<number, ethers.Provider> = new Map();
  private walletManager: WalletManager;
  private bridgeManager: CrossChainBridgeManager;
  private ipfsManager: IPFSManager;
  private nftEnhancer: NFTMetadataEnhancer;
  private daoManager: DAOGovernanceManager;
  private transactionQueue: Map<string, any> = new Map();
  private gasOracle: Map<number, bigint> = new Map();

  constructor(config: Web3MiddlewareConfig) {
    super();
    this.config = config;
    this.initializeProviders();
    this.initializeServices();
    this.startGasOracle();
  }

  private initializeProviders(): void {
    for (const [chainId, rpcUrl] of Object.entries(this.config.rpcUrls)) {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      this.providers.set(Number(chainId), provider);
    }
  }

  private initializeServices(): void {
    // Initialize wallet manager
    this.walletManager = new WalletManager();

    // Initialize IPFS manager
    this.ipfsManager = new IPFSManager({
      ipfsUrl: this.config.ipfsConfig.url,
      pinataApiKey: this.config.ipfsConfig.pinataApiKey,
      pinataSecretKey: this.config.ipfsConfig.pinataSecretKey,
      enableRedundancy: true,
      encryptionEnabled: true
    });

    // Initialize bridge manager
    this.bridgeManager = new CrossChainBridgeManager();

    // Initialize DAO manager
    const mainProvider = this.providers.get(1) || this.providers.values().next().value;
    this.daoManager = new DAOGovernanceManager(
      this.config.contractAddresses.daoGovernance,
      this.config.contractAddresses.treasuryManager,
      this.config.contractAddresses.urnToken,
      mainProvider,
      this.ipfsManager
    );

    // Initialize NFT enhancer
    this.nftEnhancer = new NFTMetadataEnhancer(
      this.ipfsManager,
      this.config.contractAddresses.enhancedAgentNFT,
      mainProvider
    );
  }

  private startGasOracle(): void {
    if (!this.config.gasOptimization.enabled) return;

    setInterval(async () => {
      for (const [chainId, provider] of this.providers) {
        try {
          const feeData = await provider.getFeeData();
          const gasPrice = feeData.gasPrice || ethers.parseUnits('20', 'gwei');
          this.gasOracle.set(chainId, gasPrice);
        } catch (error) {
          console.warn(`Failed to update gas oracle for chain ${chainId}:`, error);
        }
      }
    }, 30000); // Update every 30 seconds
  }

  /**
   * Register Web3 middleware with Fastify
   */
  register(fastify: FastifyInstance): void {
    // Add Web3 context to request
    fastify.decorateRequest('web3', null);

    // Pre-handler to set up Web3 context
    fastify.addHook('preHandler', async (request, reply) => {
      request.web3 = await this.createWeb3Context(request);
    });

    // Blockchain transaction routes
    this.registerTransactionRoutes(fastify);

    // Blockchain query routes
    this.registerQueryRoutes(fastify);

    // Wallet integration routes
    this.registerWalletRoutes(fastify);

    // Cross-chain bridge routes
    this.registerBridgeRoutes(fastify);

    // NFT and metadata routes
    this.registerNFTRoutes(fastify);

    // DAO governance routes
    this.registerDAORoutes(fastify);

    // DeFi protocol routes
    this.registerDeFiRoutes(fastify);

    // IPFS routes
    this.registerIPFSRoutes(fastify);
  }

  private async createWeb3Context(request: FastifyRequest): Promise<Web3Context> {
    const context: Web3Context = {};

    // Extract chain ID from headers or query
    const chainIdHeader = request.headers['x-chain-id'] as string;
    const chainIdQuery = (request.query as any)?.chainId;
    context.chainId = chainIdHeader ? parseInt(chainIdHeader) : chainIdQuery;

    // Extract user address from headers
    context.userAddress = request.headers['x-user-address'] as string;

    // Extract signature for authentication
    context.signature = request.headers['x-signature'] as string;
    context.nonce = request.headers['x-nonce'] as string;
    context.timestamp = request.headers['x-timestamp'] ?
      parseInt(request.headers['x-timestamp'] as string) : Date.now();

    // Set gas parameters if enabled
    if (this.config.gasOptimization.enabled && context.chainId) {
      context.gasPrice = this.gasOracle.get(context.chainId);
      context.gasLimit = BigInt(200000) * BigInt(this.config.gasOptimization.gasLimitMultiplier);
    }

    return context;
  }

  private registerTransactionRoutes(fastify: FastifyInstance): void {
    // Submit blockchain transaction
    fastify.post<{
      Body: BlockchainTransactionRequest;
    }>('/blockchain/transaction', {
      schema: {
        body: {
          type: 'object',
          required: ['to', 'data'],
          properties: {
            to: { type: 'string' },
            data: { type: 'string' },
            value: { type: 'string' },
            gasLimit: { type: 'string' },
            gasPrice: { type: 'string' },
            chainId: { type: 'number' }
          }
        }
      }
    }, async (request, reply) => {
      try {
        const { to, data, value, gasLimit, gasPrice, chainId } = request.body;
        const web3Context = (request as any).web3 as Web3Context;

        const targetChainId = chainId || web3Context.chainId || 1;
        const provider = this.providers.get(targetChainId);

        if (!provider) {
          return reply.code(400).send({ error: 'Unsupported chain ID' });
        }

        // Create transaction object
        const tx = {
          to,
          data,
          value: value ? BigInt(value) : 0n,
          gasLimit: gasLimit ? BigInt(gasLimit) : web3Context.gasLimit,
          gasPrice: gasPrice ? BigInt(gasPrice) : web3Context.gasPrice,
          chainId: targetChainId
        };

        // Queue transaction for processing
        const txId = this.queueTransaction(tx, web3Context);

        reply.send({
          success: true,
          transactionId: txId,
          status: 'queued'
        });

      } catch (error) {
        reply.code(500).send({ error: (error as Error).message });
      }
    });

    // Get transaction status
    fastify.get<{
      Params: { txId: string };
    }>('/blockchain/transaction/:txId', async (request, reply) => {
      const { txId } = request.params;
      const transaction = this.transactionQueue.get(txId);

      if (!transaction) {
        return reply.code(404).send({ error: 'Transaction not found' });
      }

      reply.send({
        transactionId: txId,
        status: transaction.status,
        hash: transaction.hash,
        receipt: transaction.receipt
      });
    });
  }

  private registerQueryRoutes(fastify: FastifyInstance): void {
    // Query blockchain data
    fastify.post<{
      Body: BlockchainQueryRequest;
    }>('/blockchain/query', {
      schema: {
        body: {
          type: 'object',
          required: ['contract', 'method', 'args'],
          properties: {
            contract: { type: 'string' },
            method: { type: 'string' },
            args: { type: 'array' },
            chainId: { type: 'number' }
          }
        }
      }
    }, async (request, reply) => {
      try {
        const { contract, method, args, chainId } = request.body;
        const web3Context = (request as any).web3 as Web3Context;

        const targetChainId = chainId || web3Context.chainId || 1;
        const provider = this.providers.get(targetChainId);

        if (!provider) {
          return reply.code(400).send({ error: 'Unsupported chain ID' });
        }

        // Simple contract query - in production, you'd have contract ABIs
        const contractInstance = new ethers.Contract(contract, [
          `function ${method}(...args) external view returns (...)`
        ], provider);

        const result = await contractInstance[method](...args);

        reply.send({
          success: true,
          result: result.toString(),
          blockNumber: await provider.getBlockNumber()
        });

      } catch (error) {
        reply.code(500).send({ error: (error as Error).message });
      }
    });
  }

  private registerWalletRoutes(fastify: FastifyInstance): void {
    if (!this.config.enabledFeatures.walletIntegration) return;

    // Get wallet balance
    fastify.get<{
      Params: { address: string };
      Querystring: { token?: string; chainId?: number };
    }>('/wallet/:address/balance', async (request, reply) => {
      try {
        const { address } = request.params;
        const { token, chainId } = request.query;

        const targetChainId = chainId || 1;
        const provider = this.providers.get(targetChainId);

        if (!provider) {
          return reply.code(400).send({ error: 'Unsupported chain ID' });
        }

        let balance;
        if (token && token !== 'ETH') {
          // ERC20 token balance
          const tokenContract = new ethers.Contract(token, [
            'function balanceOf(address) external view returns (uint256)'
          ], provider);
          balance = await tokenContract.balanceOf(address);
        } else {
          // Native token balance
          balance = await provider.getBalance(address);
        }

        reply.send({
          address,
          token: token || 'ETH',
          balance: balance.toString(),
          chainId: targetChainId
        });

      } catch (error) {
        reply.code(500).send({ error: (error as Error).message });
      }
    });

    // Get supported chains
    fastify.get('/wallet/chains', async (request, reply) => {
      const chains = this.walletManager.getSupportedChains();
      reply.send({ chains });
    });
  }

  private registerBridgeRoutes(fastify: FastifyInstance): void {
    if (!this.config.enabledFeatures.crossChainBridge) return;

    // Get bridge status
    fastify.get('/bridge/status', async (request, reply) => {
      const bridges = this.bridgeManager.getSupportedBridges();
      const pendingTransfers = this.bridgeManager.getPendingTransfers();

      reply.send({
        supportedBridges: bridges.length,
        pendingTransfers: pendingTransfers.length,
        bridges
      });
    });

    // Get bridge transfer
    fastify.get<{
      Params: { transferId: string };
    }>('/bridge/transfer/:transferId', async (request, reply) => {
      const { transferId } = request.params;
      const transfer = this.bridgeManager.getTransfer(transferId);

      if (!transfer) {
        return reply.code(404).send({ error: 'Transfer not found' });
      }

      reply.send(transfer);
    });
  }

  private registerNFTRoutes(fastify: FastifyInstance): void {
    if (!this.config.enabledFeatures.nftMetadata) return;

    // Get NFT metadata
    fastify.get<{
      Params: { tokenId: string };
    }>('/nft/:tokenId/metadata', async (request, reply) => {
      try {
        const { tokenId } = request.params;
        const agentData = await this.nftEnhancer.getAgentData(tokenId);

        reply.send(agentData);
      } catch (error) {
        reply.code(500).send({ error: (error as Error).message });
      }
    });

    // Update NFT performance metrics
    fastify.post<{
      Params: { tokenId: string };
      Body: { performanceMetrics: any };
    }>('/nft/:tokenId/metrics', async (request, reply) => {
      try {
        const { tokenId } = request.params;
        const { performanceMetrics } = request.body;

        // Queue metadata update
        this.nftEnhancer.queueMetadataUpdate({
          tokenId,
          agentId: tokenId,
          performanceMetrics,
          baseMetadata: {
            name: `Agent ${tokenId}`,
            description: 'AI Agent NFT',
            image: `https://api.urnlabs.ai/nft/${tokenId}/image`,
            external_url: `https://urnlabs.ai/agent/${tokenId}`
          }
        });

        reply.send({ success: true, message: 'Metadata update queued' });
      } catch (error) {
        reply.code(500).send({ error: (error as Error).message });
      }
    });
  }

  private registerDAORoutes(fastify: FastifyInstance): void {
    if (!this.config.enabledFeatures.daoGovernance) return;

    // Get DAO statistics
    fastify.get('/dao/stats', async (request, reply) => {
      try {
        const stats = await this.daoManager.getDAOStatistics();
        reply.send(stats);
      } catch (error) {
        reply.code(500).send({ error: (error as Error).message });
      }
    });

    // Get proposals
    fastify.get<{
      Querystring: { limit?: number; offset?: number };
    }>('/dao/proposals', async (request, reply) => {
      try {
        const { limit = 50, offset = 0 } = request.query;
        const proposals = await this.daoManager.getAllProposals(limit, offset);
        reply.send({ proposals });
      } catch (error) {
        reply.code(500).send({ error: (error as Error).message });
      }
    });

    // Get specific proposal
    fastify.get<{
      Params: { proposalId: string };
    }>('/dao/proposals/:proposalId', async (request, reply) => {
      try {
        const { proposalId } = request.params;
        const proposal = await this.daoManager.getProposal(proposalId);
        const actions = await this.daoManager.getProposalActions(proposalId);

        reply.send({ ...proposal, actions });
      } catch (error) {
        reply.code(500).send({ error: (error as Error).message });
      }
    });
  }

  private registerDeFiRoutes(fastify: FastifyInstance): void {
    if (!this.config.enabledFeatures.defiProtocol) return;

    // Get DeFi protocol status
    fastify.get('/defi/status', async (request, reply) => {
      // This would integrate with the DeFi contracts
      reply.send({
        message: 'DeFi protocol status endpoint',
        totalValueLocked: '0',
        totalRewards: '0',
        activePools: 0
      });
    });
  }

  private registerIPFSRoutes(fastify: FastifyInstance): void {
    // Upload file to IPFS
    fastify.post<{
      Body: { content: string; filename: string; encrypt?: boolean };
    }>('/ipfs/upload', async (request, reply) => {
      try {
        const { content, filename, encrypt } = request.body;

        const file = await this.ipfsManager.uploadFile(
          Buffer.from(content, 'base64'),
          filename,
          { encrypt: encrypt || false }
        );

        reply.send({
          success: true,
          hash: file.hash,
          size: file.size,
          encrypted: file.encrypted
        });
      } catch (error) {
        reply.code(500).send({ error: (error as Error).message });
      }
    });

    // Retrieve file from IPFS
    fastify.get<{
      Params: { hash: string };
    }>('/ipfs/:hash', async (request, reply) => {
      try {
        const { hash } = request.params;
        const { content, metadata } = await this.ipfsManager.retrieveFile(hash);

        reply.type(metadata.mimeType).send(content);
      } catch (error) {
        reply.code(500).send({ error: (error as Error).message });
      }
    });
  }

  private queueTransaction(tx: any, context: Web3Context): string {
    const txId = ethers.id(JSON.stringify(tx) + Date.now());

    this.transactionQueue.set(txId, {
      ...tx,
      context,
      status: 'queued',
      createdAt: Date.now()
    });

    // Process transaction asynchronously
    this.processTransaction(txId);

    return txId;
  }

  private async processTransaction(txId: string): Promise<void> {
    const transaction = this.transactionQueue.get(txId);
    if (!transaction) return;

    try {
      transaction.status = 'processing';

      // In a real implementation, you would:
      // 1. Validate the transaction
      // 2. Get proper signer
      // 3. Send transaction
      // 4. Wait for confirmation

      // For now, simulate processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      transaction.status = 'completed';
      transaction.hash = ethers.id(`tx_${txId}_${Date.now()}`);

      this.emit('transactionCompleted', { txId, hash: transaction.hash });

    } catch (error) {
      transaction.status = 'failed';
      transaction.error = (error as Error).message;

      this.emit('transactionFailed', { txId, error: (error as Error).message });
    }
  }

  /**
   * Get middleware statistics
   */
  getStatistics(): {
    queuedTransactions: number;
    supportedChains: number;
    enabledFeatures: Record<string, boolean>;
    gasOracle: Record<number, string>;
  } {
    return {
      queuedTransactions: this.transactionQueue.size,
      supportedChains: this.providers.size,
      enabledFeatures: this.config.enabledFeatures,
      gasOracle: Object.fromEntries(
        Array.from(this.gasOracle.entries()).map(([chainId, gasPrice]) => [
          chainId,
          ethers.formatUnits(gasPrice, 'gwei') + ' gwei'
        ])
      )
    };
  }

  /**
   * Get service instances
   */
  getServices(): {
    walletManager: WalletManager;
    bridgeManager: CrossChainBridgeManager;
    ipfsManager: IPFSManager;
    nftEnhancer: NFTMetadataEnhancer;
    daoManager: DAOGovernanceManager;
  } {
    return {
      walletManager: this.walletManager,
      bridgeManager: this.bridgeManager,
      ipfsManager: this.ipfsManager,
      nftEnhancer: this.nftEnhancer,
      daoManager: this.daoManager
    };
  }
}

export default Web3Middleware;

// Extend Fastify types
declare module 'fastify' {
  interface FastifyRequest {
    web3: Web3Context;
  }
}