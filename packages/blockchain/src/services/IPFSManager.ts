import { create, IPFSHTTPClient } from 'ipfs-http-client';
import pinataSDK from 'pinata-sdk';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import axios from 'axios';

export interface IPFSConfig {
  ipfsUrl: string;
  pinataApiKey?: string;
  pinataSecretKey?: string;
  web3StorageToken?: string;
  enableRedundancy: boolean;
  encryptionEnabled: boolean;
}

export interface StoredFile {
  hash: string;
  name: string;
  size: number;
  mimeType: string;
  timestamp: number;
  pinned: boolean;
  encrypted: boolean;
  redundantCopies: string[];
  metadata?: Record<string, any>;
}

export interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  external_url?: string;
  animation_url?: string;
  attributes: NFTAttribute[];
  background_color?: string;
  youtube_url?: string;
  properties?: Record<string, any>;
}

export interface NFTAttribute {
  trait_type: string;
  value: string | number;
  display_type?: 'boost_number' | 'boost_percentage' | 'number' | 'date';
  max_value?: number;
}

export interface AgentPerformanceMetrics {
  tasksCompleted: number;
  successRate: number;
  averageResponseTime: number;
  reputation: number;
  experiencePoints: number;
  specializations: string[];
  achievements: string[];
  efficiency: number;
  reliability: number;
  uptime: number;
}

export interface VersionedMetadata {
  version: number;
  timestamp: number;
  metadata: NFTMetadata;
  previousVersion?: string;
  changeLog: string;
}

export class IPFSManager extends EventEmitter {
  private ipfsClient: IPFSHTTPClient;
  private pinata?: any;
  private config: IPFSConfig;
  private storedFiles: Map<string, StoredFile> = new Map();
  private metadataVersions: Map<string, VersionedMetadata[]> = new Map();
  private encryptionKey: string;

  constructor(config: IPFSConfig) {
    super();
    this.config = config;
    this.encryptionKey = process.env.IPFS_ENCRYPTION_KEY || 'default-key-change-in-production';
    this.initializeClients();
  }

  private initializeClients(): void {
    // Initialize IPFS client
    this.ipfsClient = create({
      url: this.config.ipfsUrl || 'https://ipfs.infura.io:5001',
      headers: {
        authorization: process.env.INFURA_IPFS_AUTH || ''
      }
    });

    // Initialize Pinata if credentials provided
    if (this.config.pinataApiKey && this.config.pinataSecretKey) {
      this.pinata = new pinataSDK(this.config.pinataApiKey, this.config.pinataSecretKey);
      this.testPinataConnection();
    }

    this.emit('initialized', {
      ipfsConnected: !!this.ipfsClient,
      pinataConnected: !!this.pinata
    });
  }

  private async testPinataConnection(): Promise<void> {
    try {
      await this.pinata.testAuthentication();
      this.emit('pinataConnected');
    } catch (error) {
      this.emit('pinataError', error);
      console.warn('Pinata connection failed:', error);
    }
  }

  /**
   * Upload file to IPFS with optional encryption and redundancy
   */
  async uploadFile(
    content: Buffer | string,
    filename: string,
    options: {
      encrypt?: boolean;
      metadata?: Record<string, any>;
      pin?: boolean;
      mimeType?: string;
    } = {}
  ): Promise<StoredFile> {
    const {
      encrypt = this.config.encryptionEnabled,
      metadata = {},
      pin = true,
      mimeType = 'application/octet-stream'
    } = options;

    try {
      let processedContent = content;

      // Encrypt content if requested
      if (encrypt) {
        processedContent = await this.encryptContent(content);
      }

      // Upload to primary IPFS node
      const result = await this.ipfsClient.add(processedContent, {
        pin: pin,
        cidVersion: 1
      });

      const storedFile: StoredFile = {
        hash: result.cid.toString(),
        name: filename,
        size: result.size,
        mimeType,
        timestamp: Date.now(),
        pinned: pin,
        encrypted: encrypt,
        redundantCopies: [],
        metadata
      };

      // Store redundant copies if enabled
      if (this.config.enableRedundancy) {
        const redundantCopies = await this.createRedundantCopies(processedContent, filename);
        storedFile.redundantCopies = redundantCopies;
      }

      this.storedFiles.set(result.cid.toString(), storedFile);
      this.emit('fileUploaded', storedFile);

      return storedFile;

    } catch (error) {
      this.emit('uploadError', { filename, error });
      throw error;
    }
  }

  /**
   * Create redundant copies across multiple IPFS providers
   */
  private async createRedundantCopies(content: Buffer | string, filename: string): Promise<string[]> {
    const redundantCopies: string[] = [];

    // Upload to Pinata if available
    if (this.pinata) {
      try {
        const pinataResult = await this.pinata.pinJSONToIPFS(content, {
          pinataMetadata: { name: filename },
          pinataOptions: { cidVersion: 1 }
        });
        redundantCopies.push(pinataResult.IpfsHash);
      } catch (error) {
        console.warn('Pinata redundant upload failed:', error);
      }
    }

    // Upload to Web3.Storage if token available
    if (this.config.web3StorageToken) {
      try {
        const web3Hash = await this.uploadToWeb3Storage(content, filename);
        redundantCopies.push(web3Hash);
      } catch (error) {
        console.warn('Web3.Storage redundant upload failed:', error);
      }
    }

    return redundantCopies;
  }

  /**
   * Upload to Web3.Storage
   */
  private async uploadToWeb3Storage(content: Buffer | string, filename: string): Promise<string> {
    const formData = new FormData();
    const blob = new Blob([content], { type: 'application/octet-stream' });
    formData.append('file', blob, filename);

    const response = await axios.post('https://api.web3.storage/upload', formData, {
      headers: {
        'Authorization': `Bearer ${this.config.web3StorageToken}`,
        'Content-Type': 'multipart/form-data'
      }
    });

    return response.data.cid;
  }

  /**
   * Retrieve file from IPFS with automatic decryption
   */
  async retrieveFile(hash: string): Promise<{ content: Buffer; metadata: StoredFile }> {
    const storedFile = this.storedFiles.get(hash);

    try {
      // Try primary IPFS node first
      let content = await this.retrieveFromIPFS(hash);

      // If primary fails and redundant copies exist, try those
      if (!content && storedFile?.redundantCopies.length) {
        content = await this.retrieveFromRedundantCopies(storedFile.redundantCopies);
      }

      if (!content) {
        throw new Error('File not found on any IPFS provider');
      }

      // Decrypt if necessary
      if (storedFile?.encrypted) {
        content = await this.decryptContent(content);
      }

      return {
        content,
        metadata: storedFile || {
          hash,
          name: 'unknown',
          size: content.length,
          mimeType: 'application/octet-stream',
          timestamp: Date.now(),
          pinned: false,
          encrypted: false,
          redundantCopies: []
        }
      };

    } catch (error) {
      this.emit('retrievalError', { hash, error });
      throw error;
    }
  }

  /**
   * Retrieve content from primary IPFS node
   */
  private async retrieveFromIPFS(hash: string): Promise<Buffer> {
    const chunks: Uint8Array[] = [];

    for await (const chunk of this.ipfsClient.cat(hash)) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }

  /**
   * Retrieve content from redundant copies
   */
  private async retrieveFromRedundantCopies(redundantCopies: string[]): Promise<Buffer | null> {
    for (const hash of redundantCopies) {
      try {
        return await this.retrieveFromIPFS(hash);
      } catch (error) {
        console.warn(`Failed to retrieve from redundant copy ${hash}:`, error);
      }
    }
    return null;
  }

  /**
   * Upload NFT metadata with versioning
   */
  async uploadNFTMetadata(
    tokenId: string,
    metadata: NFTMetadata,
    changeLog: string = 'Initial version'
  ): Promise<{ hash: string; version: number }> {
    const existingVersions = this.metadataVersions.get(tokenId) || [];
    const version = existingVersions.length + 1;

    const versionedMetadata: VersionedMetadata = {
      version,
      timestamp: Date.now(),
      metadata,
      previousVersion: existingVersions.length > 0 ? existingVersions[existingVersions.length - 1].metadata.image : undefined,
      changeLog
    };

    const result = await this.uploadFile(
      JSON.stringify(versionedMetadata, null, 2),
      `metadata-${tokenId}-v${version}.json`,
      {
        metadata: { tokenId, version, type: 'nft-metadata' },
        mimeType: 'application/json'
      }
    );

    // Update version history
    existingVersions.push(versionedMetadata);
    this.metadataVersions.set(tokenId, existingVersions);

    this.emit('metadataVersionCreated', { tokenId, version, hash: result.hash });

    return { hash: result.hash, version };
  }

  /**
   * Generate dynamic NFT metadata based on agent performance
   */
  generateAgentNFTMetadata(
    agentId: string,
    baseMetadata: Omit<NFTMetadata, 'attributes'>,
    performanceMetrics: AgentPerformanceMetrics
  ): NFTMetadata {
    const attributes: NFTAttribute[] = [
      {
        trait_type: "Tasks Completed",
        value: performanceMetrics.tasksCompleted,
        display_type: "number"
      },
      {
        trait_type: "Success Rate",
        value: Math.round(performanceMetrics.successRate * 100),
        display_type: "boost_percentage",
        max_value: 100
      },
      {
        trait_type: "Average Response Time",
        value: performanceMetrics.averageResponseTime,
        display_type: "number"
      },
      {
        trait_type: "Reputation",
        value: Math.round(performanceMetrics.reputation * 100),
        display_type: "boost_percentage",
        max_value: 100
      },
      {
        trait_type: "Experience Points",
        value: performanceMetrics.experiencePoints,
        display_type: "boost_number"
      },
      {
        trait_type: "Efficiency",
        value: Math.round(performanceMetrics.efficiency * 100),
        display_type: "boost_percentage",
        max_value: 100
      },
      {
        trait_type: "Reliability",
        value: Math.round(performanceMetrics.reliability * 100),
        display_type: "boost_percentage",
        max_value: 100
      },
      {
        trait_type: "Uptime",
        value: Math.round(performanceMetrics.uptime * 100),
        display_type: "boost_percentage",
        max_value: 100
      }
    ];

    // Add specializations as traits
    performanceMetrics.specializations.forEach(spec => {
      attributes.push({
        trait_type: "Specialization",
        value: spec
      });
    });

    // Add achievements as traits
    performanceMetrics.achievements.forEach(achievement => {
      attributes.push({
        trait_type: "Achievement",
        value: achievement
      });
    });

    return {
      ...baseMetadata,
      attributes,
      properties: {
        agent_id: agentId,
        performance_tier: this.calculatePerformanceTier(performanceMetrics),
        last_updated: new Date().toISOString(),
        dynamic_metadata: true
      }
    };
  }

  /**
   * Calculate performance tier based on metrics
   */
  private calculatePerformanceTier(metrics: AgentPerformanceMetrics): string {
    const overallScore = (
      metrics.successRate * 0.3 +
      metrics.reputation * 0.25 +
      metrics.efficiency * 0.2 +
      metrics.reliability * 0.15 +
      metrics.uptime * 0.1
    );

    if (overallScore >= 0.9) return 'Legendary';
    if (overallScore >= 0.8) return 'Epic';
    if (overallScore >= 0.7) return 'Rare';
    if (overallScore >= 0.6) return 'Uncommon';
    return 'Common';
  }

  /**
   * Get metadata version history
   */
  getMetadataVersionHistory(tokenId: string): VersionedMetadata[] {
    return this.metadataVersions.get(tokenId) || [];
  }

  /**
   * Rollback metadata to previous version
   */
  async rollbackMetadata(
    tokenId: string,
    targetVersion: number,
    reason: string
  ): Promise<{ hash: string; version: number }> {
    const versions = this.metadataVersions.get(tokenId);
    if (!versions || targetVersion < 1 || targetVersion > versions.length) {
      throw new Error('Invalid version specified');
    }

    const targetMetadata = versions[targetVersion - 1];
    const rollbackVersion = versions.length + 1;

    const rollbackVersionedMetadata: VersionedMetadata = {
      version: rollbackVersion,
      timestamp: Date.now(),
      metadata: targetMetadata.metadata,
      previousVersion: versions[versions.length - 1].metadata.image,
      changeLog: `Rollback to version ${targetVersion}: ${reason}`
    };

    const result = await this.uploadFile(
      JSON.stringify(rollbackVersionedMetadata, null, 2),
      `metadata-${tokenId}-v${rollbackVersion}.json`,
      {
        metadata: { tokenId, version: rollbackVersion, type: 'nft-metadata-rollback' },
        mimeType: 'application/json'
      }
    );

    versions.push(rollbackVersionedMetadata);
    this.metadataVersions.set(tokenId, versions);

    this.emit('metadataRolledBack', { tokenId, targetVersion, newVersion: rollbackVersion });

    return { hash: result.hash, version: rollbackVersion };
  }

  /**
   * Encrypt content using AES-256-GCM
   */
  private async encryptContent(content: Buffer | string): Promise<Buffer> {
    const crypto = await import('crypto');
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipher(algorithm, key);
    cipher.setAAD(Buffer.from('ipfs-encryption'));

    const contentBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const encrypted = Buffer.concat([cipher.update(contentBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, encrypted]);
  }

  /**
   * Decrypt content using AES-256-GCM
   */
  private async decryptContent(encryptedContent: Buffer): Promise<Buffer> {
    const crypto = await import('crypto');
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);

    const iv = encryptedContent.slice(0, 16);
    const authTag = encryptedContent.slice(16, 32);
    const encrypted = encryptedContent.slice(32);

    const decipher = crypto.createDecipher(algorithm, key);
    decipher.setAAD(Buffer.from('ipfs-encryption'));
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  /**
   * Pin file to ensure persistence
   */
  async pinFile(hash: string): Promise<void> {
    try {
      await this.ipfsClient.pin.add(hash);

      const storedFile = this.storedFiles.get(hash);
      if (storedFile) {
        storedFile.pinned = true;
      }

      // Also pin to Pinata if available
      if (this.pinata) {
        await this.pinata.pinByHash(hash);
      }

      this.emit('filePinned', hash);
    } catch (error) {
      this.emit('pinError', { hash, error });
      throw error;
    }
  }

  /**
   * Unpin file
   */
  async unpinFile(hash: string): Promise<void> {
    try {
      await this.ipfsClient.pin.rm(hash);

      const storedFile = this.storedFiles.get(hash);
      if (storedFile) {
        storedFile.pinned = false;
      }

      this.emit('fileUnpinned', hash);
    } catch (error) {
      this.emit('unpinError', { hash, error });
      throw error;
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    pinnedFiles: number;
    encryptedFiles: number;
    redundantFiles: number;
  }> {
    const files = Array.from(this.storedFiles.values());

    return {
      totalFiles: files.length,
      totalSize: files.reduce((sum, file) => sum + file.size, 0),
      pinnedFiles: files.filter(file => file.pinned).length,
      encryptedFiles: files.filter(file => file.encrypted).length,
      redundantFiles: files.filter(file => file.redundantCopies.length > 0).length
    };
  }

  /**
   * Verify file integrity
   */
  async verifyFileIntegrity(hash: string): Promise<{
    valid: boolean;
    availableOn: string[];
    corruptedOn: string[];
  }> {
    const result = {
      valid: false,
      availableOn: [] as string[],
      corruptedOn: [] as string[]
    };

    // Check primary IPFS
    try {
      await this.retrieveFromIPFS(hash);
      result.availableOn.push('primary-ipfs');
      result.valid = true;
    } catch {
      result.corruptedOn.push('primary-ipfs');
    }

    // Check redundant copies
    const storedFile = this.storedFiles.get(hash);
    if (storedFile?.redundantCopies) {
      for (const redundantHash of storedFile.redundantCopies) {
        try {
          await this.retrieveFromIPFS(redundantHash);
          result.availableOn.push(`redundant-${redundantHash.substring(0, 8)}`);
          result.valid = true;
        } catch {
          result.corruptedOn.push(`redundant-${redundantHash.substring(0, 8)}`);
        }
      }
    }

    return result;
  }

  /**
   * Cleanup old versions based on retention policy
   */
  async cleanupOldVersions(
    tokenId: string,
    retentionPolicy: { keepVersions: number } = { keepVersions: 10 }
  ): Promise<string[]> {
    const versions = this.metadataVersions.get(tokenId);
    if (!versions || versions.length <= retentionPolicy.keepVersions) {
      return [];
    }

    const versionsToDelete = versions.slice(0, versions.length - retentionPolicy.keepVersions);
    const deletedHashes: string[] = [];

    for (const version of versionsToDelete) {
      try {
        // In a real implementation, you might want to unpin these files
        // await this.unpinFile(version.metadata.image);
        deletedHashes.push(version.metadata.image);
      } catch (error) {
        console.warn(`Failed to cleanup version ${version.version}:`, error);
      }
    }

    // Update version history
    const remainingVersions = versions.slice(-retentionPolicy.keepVersions);
    this.metadataVersions.set(tokenId, remainingVersions);

    this.emit('versionsCleanedUp', { tokenId, deletedCount: deletedHashes.length });

    return deletedHashes;
  }

  /**
   * Get file by hash
   */
  getStoredFile(hash: string): StoredFile | undefined {
    return this.storedFiles.get(hash);
  }

  /**
   * List all stored files
   */
  listStoredFiles(): StoredFile[] {
    return Array.from(this.storedFiles.values());
  }

  /**
   * Search files by metadata
   */
  searchFiles(criteria: Partial<StoredFile>): StoredFile[] {
    return this.listStoredFiles().filter(file => {
      return Object.entries(criteria).every(([key, value]) => {
        if (key === 'metadata') {
          return JSON.stringify(file.metadata).includes(JSON.stringify(value));
        }
        return file[key as keyof StoredFile] === value;
      });
    });
  }
}

export default IPFSManager;