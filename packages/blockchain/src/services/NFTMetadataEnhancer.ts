import { ethers } from 'ethers';
import IPFSManager, { NFTMetadata, AgentPerformanceMetrics } from './IPFSManager';
import { EventEmitter } from 'events';

export interface EnhancedNFTContract {
  address: string;
  abi: any[];
  provider: ethers.Provider;
  contract: ethers.Contract;
}

export interface MetadataUpdateRequest {
  tokenId: string;
  agentId: string;
  performanceMetrics: AgentPerformanceMetrics;
  baseMetadata: Omit<NFTMetadata, 'attributes'>;
  forceUpdate?: boolean;
}

export interface MetadataUpdateResult {
  tokenId: string;
  newVersion: number;
  ipfsHash: string;
  transactionHash?: string;
  updateReason: string;
}

export interface UpdateTrigger {
  metricType: keyof AgentPerformanceMetrics;
  threshold: number;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
}

export interface AutoUpdateConfig {
  enabled: boolean;
  triggers: UpdateTrigger[];
  cooldownPeriod: number;
  batchSize: number;
  gasLimit: bigint;
  maxGasPrice: bigint;
}

export class NFTMetadataEnhancer extends EventEmitter {
  private ipfsManager: IPFSManager;
  private nftContract: EnhancedNFTContract;
  private signer?: ethers.Signer;
  private autoUpdateConfig: AutoUpdateConfig;
  private lastMetrics: Map<string, AgentPerformanceMetrics> = new Map();
  private updateQueue: Map<string, MetadataUpdateRequest> = new Map();
  private processingQueue = false;
  private updateHistory: Map<string, MetadataUpdateResult[]> = new Map();

  // Enhanced NFT contract ABI (simplified)
  private readonly enhancedNFTABI = [
    'function updatePerformanceMetrics(uint256 tokenId, tuple(uint256 tasksCompleted, uint256 successRate, uint256 averageResponseTime, uint256 reputation, uint256 experiencePoints, uint256 efficiency, uint256 reliability, uint256 uptime, uint256 lastUpdated) metrics) external',
    'function createMetadataVersion(uint256 tokenId, string newIpfsHash, string changeLog) external',
    'function getPerformanceMetrics(uint256 tokenId) external view returns (tuple(uint256 tasksCompleted, uint256 successRate, uint256 averageResponseTime, uint256 reputation, uint256 experiencePoints, uint256 efficiency, uint256 reliability, uint256 uptime, uint256 lastUpdated))',
    'function calculatePerformanceTier(uint256 tokenId) external view returns (uint8)',
    'function getAgentFullData(uint256 tokenId) external view returns (tuple(string name, string description, string category, string[] capabilities, string creatorName, address creator, uint256 createdAt, uint256 version, bool isVerified, string ipfsHash), tuple(uint256 tasksCompleted, uint256 successRate, uint256 averageResponseTime, uint256 reputation, uint256 experiencePoints, uint256 efficiency, uint256 reliability, uint256 uptime, uint256 lastUpdated), string[] specializations, string[] achievements, uint8 tier)',
    'function addSpecialization(uint256 tokenId, string specialization) external',
    'function unlockAchievement(uint256 tokenId, string achievement) external',
    'event PerformanceMetricsUpdated(uint256 indexed tokenId, uint256 tasksCompleted, uint256 successRate, uint256 reputation, uint8 tier)',
    'event MetadataVersionCreated(uint256 indexed tokenId, uint256 version, string ipfsHash, string changeLog)'
  ];

  constructor(
    ipfsManager: IPFSManager,
    contractAddress: string,
    provider: ethers.Provider,
    signer?: ethers.Signer
  ) {
    super();
    this.ipfsManager = ipfsManager;
    this.signer = signer;

    this.nftContract = {
      address: contractAddress,
      abi: this.enhancedNFTABI,
      provider,
      contract: new ethers.Contract(contractAddress, this.enhancedNFTABI, provider)
    };

    this.autoUpdateConfig = {
      enabled: true,
      triggers: [
        { metricType: 'tasksCompleted', threshold: 10, operator: 'gte' },
        { metricType: 'successRate', threshold: 0.05, operator: 'gte' },
        { metricType: 'reputation', threshold: 0.1, operator: 'gte' }
      ],
      cooldownPeriod: 3600, // 1 hour
      batchSize: 5,
      gasLimit: 500000n,
      maxGasPrice: ethers.parseUnits('50', 'gwei')
    };

    this.initializeEventListeners();
  }

  private initializeEventListeners(): void {
    // Listen to contract events
    this.nftContract.contract.on('PerformanceMetricsUpdated', (tokenId, tasksCompleted, successRate, reputation, tier) => {
      this.emit('metricsUpdatedOnChain', {
        tokenId: tokenId.toString(),
        tasksCompleted: tasksCompleted.toString(),
        successRate: successRate.toString(),
        reputation: reputation.toString(),
        tier: tier.toString()
      });
    });

    this.nftContract.contract.on('MetadataVersionCreated', (tokenId, version, ipfsHash, changeLog) => {
      this.emit('metadataVersionCreated', {
        tokenId: tokenId.toString(),
        version: version.toString(),
        ipfsHash,
        changeLog
      });
    });
  }

  /**
   * Update performance metrics and metadata for an agent NFT
   */
  async updateAgentMetadata(request: MetadataUpdateRequest): Promise<MetadataUpdateResult> {
    const { tokenId, agentId, performanceMetrics, baseMetadata, forceUpdate = false } = request;

    try {
      // Check if update is needed
      if (!forceUpdate && !this.shouldUpdate(tokenId, performanceMetrics)) {
        throw new Error('Update not needed based on configured triggers');
      }

      // Generate enhanced metadata
      const enhancedMetadata = this.ipfsManager.generateAgentNFTMetadata(
        agentId,
        baseMetadata,
        performanceMetrics
      );

      // Upload enhanced metadata to IPFS
      const changeLog = this.generateChangeLog(tokenId, performanceMetrics);
      const metadataUpload = await this.ipfsManager.uploadNFTMetadata(
        tokenId,
        enhancedMetadata,
        changeLog
      );

      // Update on-chain performance metrics
      let transactionHash: string | undefined;
      if (this.signer) {
        const contractWithSigner = this.nftContract.contract.connect(this.signer);

        // Convert metrics to contract format
        const contractMetrics = this.convertMetricsToContract(performanceMetrics);

        // Update performance metrics on-chain
        const metricsTx = await contractWithSigner.updatePerformanceMetrics(
          tokenId,
          contractMetrics,
          {
            gasLimit: this.autoUpdateConfig.gasLimit,
            maxFeePerGas: this.autoUpdateConfig.maxGasPrice
          }
        );

        // Create new metadata version
        const metadataTx = await contractWithSigner.createMetadataVersion(
          tokenId,
          metadataUpload.hash,
          changeLog,
          {
            gasLimit: this.autoUpdateConfig.gasLimit,
            maxFeePerGas: this.autoUpdateConfig.maxGasPrice
          }
        );

        transactionHash = metadataTx.hash;
        await metadataTx.wait();
      }

      // Store updated metrics for future comparison
      this.lastMetrics.set(tokenId, performanceMetrics);

      const result: MetadataUpdateResult = {
        tokenId,
        newVersion: metadataUpload.version,
        ipfsHash: metadataUpload.hash,
        transactionHash,
        updateReason: changeLog
      };

      // Update history
      const history = this.updateHistory.get(tokenId) || [];
      history.push(result);
      this.updateHistory.set(tokenId, history);

      this.emit('metadataUpdated', result);
      return result;

    } catch (error) {
      this.emit('metadataUpdateError', { tokenId, error });
      throw error;
    }
  }

  /**
   * Check if metadata should be updated based on triggers
   */
  private shouldUpdate(tokenId: string, currentMetrics: AgentPerformanceMetrics): boolean {
    if (!this.autoUpdateConfig.enabled) return false;

    const lastMetrics = this.lastMetrics.get(tokenId);
    if (!lastMetrics) return true; // First update

    // Check cooldown period
    const timeSinceLastUpdate = Date.now() - (lastMetrics.experiencePoints || 0);
    if (timeSinceLastUpdate < this.autoUpdateConfig.cooldownPeriod * 1000) {
      return false;
    }

    // Check triggers
    return this.autoUpdateConfig.triggers.some(trigger => {
      const currentValue = currentMetrics[trigger.metricType];
      const lastValue = lastMetrics[trigger.metricType];
      const change = Math.abs(currentValue - lastValue);

      switch (trigger.operator) {
        case 'gt': return change > trigger.threshold;
        case 'gte': return change >= trigger.threshold;
        case 'lt': return change < trigger.threshold;
        case 'lte': return change <= trigger.threshold;
        case 'eq': return change === trigger.threshold;
        default: return false;
      }
    });
  }

  /**
   * Generate changelog for metadata update
   */
  private generateChangeLog(tokenId: string, currentMetrics: AgentPerformanceMetrics): string {
    const lastMetrics = this.lastMetrics.get(tokenId);
    if (!lastMetrics) {
      return 'Initial performance metrics recorded';
    }

    const changes: string[] = [];

    // Check for significant changes
    if (currentMetrics.tasksCompleted !== lastMetrics.tasksCompleted) {
      const diff = currentMetrics.tasksCompleted - lastMetrics.tasksCompleted;
      changes.push(`Tasks completed: +${diff}`);
    }

    if (Math.abs(currentMetrics.successRate - lastMetrics.successRate) >= 0.05) {
      const diff = ((currentMetrics.successRate - lastMetrics.successRate) * 100).toFixed(1);
      changes.push(`Success rate: ${diff > 0 ? '+' : ''}${diff}%`);
    }

    if (Math.abs(currentMetrics.reputation - lastMetrics.reputation) >= 0.05) {
      const diff = ((currentMetrics.reputation - lastMetrics.reputation) * 100).toFixed(1);
      changes.push(`Reputation: ${diff > 0 ? '+' : ''}${diff}%`);
    }

    if (currentMetrics.experiencePoints !== lastMetrics.experiencePoints) {
      const diff = currentMetrics.experiencePoints - lastMetrics.experiencePoints;
      changes.push(`Experience: +${diff} XP`);
    }

    return changes.length > 0
      ? `Performance update: ${changes.join(', ')}`
      : 'Metadata refresh';
  }

  /**
   * Convert metrics to contract format
   */
  private convertMetricsToContract(metrics: AgentPerformanceMetrics): any {
    return {
      tasksCompleted: metrics.tasksCompleted,
      successRate: Math.floor(metrics.successRate * 10000), // Convert to basis points
      averageResponseTime: metrics.averageResponseTime,
      reputation: Math.floor(metrics.reputation * 10000), // Convert to basis points
      experiencePoints: metrics.experiencePoints,
      efficiency: Math.floor(metrics.efficiency * 10000), // Convert to basis points
      reliability: Math.floor(metrics.reliability * 10000), // Convert to basis points
      uptime: Math.floor(metrics.uptime * 10000), // Convert to basis points
      lastUpdated: Math.floor(Date.now() / 1000) // Unix timestamp
    };
  }

  /**
   * Queue metadata update for batch processing
   */
  queueMetadataUpdate(request: MetadataUpdateRequest): void {
    this.updateQueue.set(request.tokenId, request);
    this.emit('updateQueued', { tokenId: request.tokenId, queueSize: this.updateQueue.size });

    // Process queue if not already processing
    if (!this.processingQueue) {
      this.processUpdateQueue();
    }
  }

  /**
   * Process queued metadata updates in batches
   */
  private async processUpdateQueue(): Promise<void> {
    if (this.processingQueue || this.updateQueue.size === 0) return;

    this.processingQueue = true;
    this.emit('queueProcessingStarted', { queueSize: this.updateQueue.size });

    try {
      const batch = Array.from(this.updateQueue.entries()).slice(0, this.autoUpdateConfig.batchSize);

      for (const [tokenId, request] of batch) {
        try {
          await this.updateAgentMetadata(request);
          this.updateQueue.delete(tokenId);
        } catch (error) {
          console.error(`Failed to update metadata for token ${tokenId}:`, error);
          // Keep in queue for retry (could implement retry logic here)
        }
      }

      this.emit('batchProcessed', {
        processed: batch.length,
        remaining: this.updateQueue.size
      });

      // Process next batch if queue not empty
      if (this.updateQueue.size > 0) {
        setTimeout(() => this.processUpdateQueue(), 5000); // 5 second delay between batches
      }

    } catch (error) {
      this.emit('queueProcessingError', error);
    } finally {
      this.processingQueue = false;
      this.emit('queueProcessingCompleted');
    }
  }

  /**
   * Add specialization to agent NFT
   */
  async addSpecialization(tokenId: string, specialization: string): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer required for on-chain operations');
    }

    const contractWithSigner = this.nftContract.contract.connect(this.signer);
    const tx = await contractWithSigner.addSpecialization(tokenId, specialization);
    await tx.wait();

    this.emit('specializationAdded', { tokenId, specialization });
    return tx.hash;
  }

  /**
   * Unlock achievement for agent NFT
   */
  async unlockAchievement(tokenId: string, achievement: string): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer required for on-chain operations');
    }

    const contractWithSigner = this.nftContract.contract.connect(this.signer);
    const tx = await contractWithSigner.unlockAchievement(tokenId, achievement);
    await tx.wait();

    this.emit('achievementUnlocked', { tokenId, achievement });
    return tx.hash;
  }

  /**
   * Get current on-chain performance metrics
   */
  async getOnChainMetrics(tokenId: string): Promise<AgentPerformanceMetrics> {
    const metrics = await this.nftContract.contract.getPerformanceMetrics(tokenId);

    return {
      tasksCompleted: Number(metrics.tasksCompleted),
      successRate: Number(metrics.successRate) / 10000, // Convert from basis points
      averageResponseTime: Number(metrics.averageResponseTime),
      reputation: Number(metrics.reputation) / 10000, // Convert from basis points
      experiencePoints: Number(metrics.experiencePoints),
      specializations: [], // Would need separate call to get these
      achievements: [], // Would need separate call to get these
      efficiency: Number(metrics.efficiency) / 10000, // Convert from basis points
      reliability: Number(metrics.reliability) / 10000, // Convert from basis points
      uptime: Number(metrics.uptime) / 10000 // Convert from basis points
    };
  }

  /**
   * Get comprehensive agent data
   */
  async getAgentData(tokenId: string): Promise<{
    metadata: any;
    metrics: AgentPerformanceMetrics;
    specializations: string[];
    achievements: string[];
    tier: number;
  }> {
    const fullData = await this.nftContract.contract.getAgentFullData(tokenId);

    return {
      metadata: {
        name: fullData[0].name,
        description: fullData[0].description,
        category: fullData[0].category,
        capabilities: fullData[0].capabilities,
        creatorName: fullData[0].creatorName,
        creator: fullData[0].creator,
        createdAt: Number(fullData[0].createdAt),
        version: Number(fullData[0].version),
        isVerified: fullData[0].isVerified,
        ipfsHash: fullData[0].ipfsHash
      },
      metrics: {
        tasksCompleted: Number(fullData[1].tasksCompleted),
        successRate: Number(fullData[1].successRate) / 10000,
        averageResponseTime: Number(fullData[1].averageResponseTime),
        reputation: Number(fullData[1].reputation) / 10000,
        experiencePoints: Number(fullData[1].experiencePoints),
        specializations: fullData[2],
        achievements: fullData[3],
        efficiency: Number(fullData[1].efficiency) / 10000,
        reliability: Number(fullData[1].reliability) / 10000,
        uptime: Number(fullData[1].uptime) / 10000
      },
      specializations: fullData[2],
      achievements: fullData[3],
      tier: Number(fullData[4])
    };
  }

  /**
   * Configure auto-update settings
   */
  configureAutoUpdate(config: Partial<AutoUpdateConfig>): void {
    this.autoUpdateConfig = { ...this.autoUpdateConfig, ...config };
    this.emit('autoUpdateConfigured', this.autoUpdateConfig);
  }

  /**
   * Get update history for a token
   */
  getUpdateHistory(tokenId: string): MetadataUpdateResult[] {
    return this.updateHistory.get(tokenId) || [];
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    size: number;
    processing: boolean;
    config: AutoUpdateConfig;
  } {
    return {
      size: this.updateQueue.size,
      processing: this.processingQueue,
      config: this.autoUpdateConfig
    };
  }

  /**
   * Clear update queue
   */
  clearQueue(): void {
    this.updateQueue.clear();
    this.emit('queueCleared');
  }

  /**
   * Set signer for on-chain operations
   */
  setSigner(signer: ethers.Signer): void {
    this.signer = signer;
  }

  /**
   * Get contract instance
   */
  getContract(): ethers.Contract {
    return this.nftContract.contract;
  }
}

export default NFTMetadataEnhancer;