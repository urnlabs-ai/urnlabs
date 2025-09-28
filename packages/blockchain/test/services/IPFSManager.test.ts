import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha";
import { IPFSManager } from "../../src/services/IPFSManager";
import sinon from "sinon";
import crypto from "crypto";

// Mock dependencies
const mockPinata = {
  pinFileToIPFS: sinon.stub(),
  pinJSONToIPFS: sinon.stub(),
  unpin: sinon.stub(),
  testAuthentication: sinon.stub()
};

const mockWeb3Storage = {
  put: sinon.stub(),
  get: sinon.stub(),
  status: sinon.stub()
};

const mockIPFSHTTP = {
  add: sinon.stub(),
  cat: sinon.stub(),
  pin: {
    add: sinon.stub(),
    rm: sinon.stub()
  }
};

describe("IPFSManager", function () {
  let ipfsManager: IPFSManager;
  let sandbox: sinon.SinonSandbox;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    
    // Mock the external dependencies
    sandbox.stub(require('@pinata/sdk'), 'default').returns(mockPinata);
    sandbox.stub(require('web3.storage'), 'Web3Storage').returns(mockWeb3Storage);
    sandbox.stub(require('ipfs-http-client'), 'create').returns(mockIPFSHTTP);

    ipfsManager = new IPFSManager({
      pinataApiKey: "test-api-key",
      pinataSecretKey: "test-secret-key",
      web3StorageToken: "test-web3-token",
      ipfsNodeUrl: "http://localhost:5001"
    });
  });

  afterEach(function () {
    sandbox.restore();
    sinon.reset();
  });

  describe("Initialization", function () {
    it("should initialize with correct configuration", function () {
      expect(ipfsManager).to.be.instanceOf(IPFSManager);
    });

    it("should test connections on initialization", async function () {
      mockPinata.testAuthentication.resolves({ authenticated: true });
      mockWeb3Storage.status.resolves({ ok: true });

      const result = await ipfsManager.testConnections();

      expect(result.pinata).to.be.true;
      expect(result.web3Storage).to.be.true;
    });

    it("should handle connection failures gracefully", async function () {
      mockPinata.testAuthentication.rejects(new Error("Authentication failed"));
      mockWeb3Storage.status.rejects(new Error("Connection failed"));

      const result = await ipfsManager.testConnections();

      expect(result.pinata).to.be.false;
      expect(result.web3Storage).to.be.false;
    });
  });

  describe("File Upload", function () {
    it("should upload file with encryption", async function () {
      const mockFile = {
        buffer: Buffer.from("test file content"),
        originalName: "test.txt",
        mimeType: "text/plain"
      };

      const mockPinataResponse = {
        IpfsHash: "QmTestHash123",
        PinSize: 1024,
        Timestamp: new Date().toISOString()
      };

      const mockWeb3Response = {
        cid: "bafyTestCID456"
      };

      mockPinata.pinFileToIPFS.resolves(mockPinataResponse);
      mockWeb3Storage.put.resolves(mockWeb3Response.cid);

      const result = await ipfsManager.uploadFile(mockFile, {
        encrypt: true,
        redundancy: true,
        metadata: { description: "Test file" }
      });

      expect(result.success).to.be.true;
      expect(result.pinataHash).to.equal(mockPinataResponse.IpfsHash);
      expect(result.web3StorageCID).to.equal(mockWeb3Response.cid);
      expect(result.encrypted).to.be.true;
    });

    it("should upload file without encryption", async function () {
      const mockFile = {
        buffer: Buffer.from("test file content"),
        originalName: "test.txt",
        mimeType: "text/plain"
      };

      const mockPinataResponse = {
        IpfsHash: "QmTestHash123",
        PinSize: 1024,
        Timestamp: new Date().toISOString()
      };

      mockPinata.pinFileToIPFS.resolves(mockPinataResponse);

      const result = await ipfsManager.uploadFile(mockFile, {
        encrypt: false,
        redundancy: false
      });

      expect(result.success).to.be.true;
      expect(result.pinataHash).to.equal(mockPinataResponse.IpfsHash);
      expect(result.encrypted).to.be.false;
    });

    it("should handle upload failures", async function () {
      const mockFile = {
        buffer: Buffer.from("test file content"),
        originalName: "test.txt",
        mimeType: "text/plain"
      };

      mockPinata.pinFileToIPFS.rejects(new Error("Upload failed"));

      const result = await ipfsManager.uploadFile(mockFile);

      expect(result.success).to.be.false;
      expect(result.error).to.include("Upload failed");
    });

    it("should validate file size limits", async function () {
      const largeFile = {
        buffer: Buffer.alloc(100 * 1024 * 1024), // 100MB
        originalName: "large.txt",
        mimeType: "text/plain"
      };

      const result = await ipfsManager.uploadFile(largeFile);

      expect(result.success).to.be.false;
      expect(result.error).to.include("File too large");
    });

    it("should validate file types", async function () {
      const executableFile = {
        buffer: Buffer.from("executable content"),
        originalName: "malware.exe",
        mimeType: "application/x-executable"
      };

      const result = await ipfsManager.uploadFile(executableFile);

      expect(result.success).to.be.false;
      expect(result.error).to.include("File type not allowed");
    });
  });

  describe("File Retrieval", function () {
    it("should retrieve and decrypt file", async function () {
      const mockEncryptedData = crypto.randomBytes(1024);
      const mockDecryptedData = Buffer.from("original file content");

      mockPinata.testAuthentication.resolves({ authenticated: true });
      
      // Mock HTTP response for file retrieval
      const mockResponse = {
        ok: true,
        arrayBuffer: () => Promise.resolve(mockEncryptedData.buffer)
      };
      
      sandbox.stub(global, 'fetch').resolves(mockResponse as any);
      
      // Mock decryption
      sandbox.stub(crypto, 'createDecipheriv').returns({
        update: sandbox.stub().returns(mockDecryptedData.slice(0, -16)),
        final: sandbox.stub().returns(mockDecryptedData.slice(-16))
      } as any);

      const result = await ipfsManager.retrieveFile("QmTestHash123", {
        encrypted: true,
        encryptionKey: "test-key-32-bytes-long-123456789",
        iv: "test-iv-16-bytes"
      });

      expect(result.success).to.be.true;
      expect(result.data).to.be.instanceOf(Buffer);
    });

    it("should retrieve unencrypted file", async function () {
      const mockFileData = Buffer.from("test file content");

      const mockResponse = {
        ok: true,
        arrayBuffer: () => Promise.resolve(mockFileData.buffer)
      };
      
      sandbox.stub(global, 'fetch').resolves(mockResponse as any);

      const result = await ipfsManager.retrieveFile("QmTestHash123", {
        encrypted: false
      });

      expect(result.success).to.be.true;
      expect(result.data).to.be.instanceOf(Buffer);
    });

    it("should handle retrieval failures", async function () {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: "Not Found"
      };
      
      sandbox.stub(global, 'fetch').resolves(mockResponse as any);

      const result = await ipfsManager.retrieveFile("QmNonExistentHash");

      expect(result.success).to.be.false;
      expect(result.error).to.include("Failed to retrieve");
    });

    it("should try multiple gateways on failure", async function () {
      const mockFileData = Buffer.from("test file content");

      // First gateway fails, second succeeds
      sandbox.stub(global, 'fetch')
        .onFirstCall().rejects(new Error("Gateway timeout"))
        .onSecondCall().resolves({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockFileData.buffer)
        } as any);

      const result = await ipfsManager.retrieveFile("QmTestHash123");

      expect(result.success).to.be.true;
      expect(global.fetch).to.have.been.calledTwice;
    });
  });

  describe("NFT Metadata Management", function () {
    it("should upload NFT metadata with performance metrics", async function () {
      const metadata = {
        name: "Test Agent NFT",
        description: "An AI agent NFT",
        image: "QmImageHash123",
        attributes: [
          { trait_type: "Agent Type", value: "Assistant" },
          { trait_type: "Level", value: "Advanced" }
        ]
      };

      const performanceMetrics = {
        tasksCompleted: 150,
        successRate: 0.95,
        averageResponseTime: 1.2,
        userRating: 4.8,
        uptimePercentage: 99.5
      };

      const mockResponse = {
        IpfsHash: "QmMetadataHash456",
        PinSize: 2048,
        Timestamp: new Date().toISOString()
      };

      mockPinata.pinJSONToIPFS.resolves(mockResponse);

      const result = await ipfsManager.uploadNFTMetadata(metadata, performanceMetrics);

      expect(result.success).to.be.true;
      expect(result.metadataHash).to.equal(mockResponse.IpfsHash);
      expect(result.metadata).to.have.property('performance_tier');
    });

    it("should calculate correct performance tier", function () {
      const highPerformanceMetrics = {
        tasksCompleted: 1000,
        successRate: 0.98,
        averageResponseTime: 0.8,
        userRating: 4.9,
        uptimePercentage: 99.9
      };

      const tier = ipfsManager.calculatePerformanceTier(highPerformanceMetrics);

      expect(tier).to.equal("Legendary");
    });

    it("should handle metadata versioning", async function () {
      const metadata = {
        name: "Test Agent NFT",
        description: "An AI agent NFT",
        image: "QmImageHash123"
      };

      const performanceMetrics = {
        tasksCompleted: 50,
        successRate: 0.8,
        averageResponseTime: 2.0,
        userRating: 4.0,
        uptimePercentage: 95.0
      };

      const mockResponse = {
        IpfsHash: "QmMetadataHashV1",
        PinSize: 1024,
        Timestamp: new Date().toISOString()
      };

      mockPinata.pinJSONToIPFS.resolves(mockResponse);

      const result = await ipfsManager.uploadNFTMetadata(metadata, performanceMetrics, {
        version: "1.0.0",
        previousVersion: "QmPreviousMetadataHash"
      });

      expect(result.success).to.be.true;
      expect(result.metadata).to.have.property('version');
      expect(result.metadata.version).to.equal("1.0.0");
    });

    it("should support metadata rollback", async function () {
      const rollbackResult = await ipfsManager.rollbackMetadata("QmCurrentHash", "QmPreviousHash");

      expect(rollbackResult.success).to.be.true;
      expect(rollbackResult.newHash).to.equal("QmPreviousHash");
    });
  });

  describe("Encryption/Decryption", function () {
    it("should encrypt data correctly", function () {
      const data = Buffer.from("sensitive data");
      const key = "test-key-32-bytes-long-123456789";

      const encrypted = ipfsManager.encryptData(data, key);

      expect(encrypted.encryptedData).to.be.instanceOf(Buffer);
      expect(encrypted.iv).to.be.instanceOf(Buffer);
      expect(encrypted.iv).to.have.length(16);
    });

    it("should decrypt data correctly", function () {
      const originalData = Buffer.from("sensitive data");
      const key = "test-key-32-bytes-long-123456789";

      const encrypted = ipfsManager.encryptData(originalData, key);
      const decrypted = ipfsManager.decryptData(encrypted.encryptedData, key, encrypted.iv);

      expect(decrypted.toString()).to.equal(originalData.toString());
    });

    it("should handle invalid decryption keys", function () {
      const data = Buffer.from("test data");
      const correctKey = "test-key-32-bytes-long-123456789";
      const wrongKey = "wrong-key-32-bytes-long-123456789";

      const encrypted = ipfsManager.encryptData(data, correctKey);

      expect(() => {
        ipfsManager.decryptData(encrypted.encryptedData, wrongKey, encrypted.iv);
      }).to.throw();
    });
  });

  describe("Pin Management", function () {
    it("should pin content across multiple services", async function () {
      const hash = "QmTestHash123";

      mockPinata.testAuthentication.resolves({ authenticated: true });
      mockIPFSHTTP.pin.add.resolves();

      const result = await ipfsManager.pinContent(hash);

      expect(result.success).to.be.true;
      expect(result.pinnedServices).to.include("pinata");
      expect(result.pinnedServices).to.include("ipfs-node");
    });

    it("should unpin content from services", async function () {
      const hash = "QmTestHash123";

      mockPinata.unpin.resolves();
      mockIPFSHTTP.pin.rm.resolves();

      const result = await ipfsManager.unpinContent(hash);

      expect(result.success).to.be.true;
    });

    it("should handle partial pin failures", async function () {
      const hash = "QmTestHash123";

      mockPinata.testAuthentication.resolves({ authenticated: true });
      mockIPFSHTTP.pin.add.rejects(new Error("IPFS node unavailable"));

      const result = await ipfsManager.pinContent(hash);

      expect(result.success).to.be.true;
      expect(result.pinnedServices).to.include("pinata");
      expect(result.pinnedServices).to.not.include("ipfs-node");
      expect(result.warnings).to.have.length.greaterThan(0);
    });
  });

  describe("Content Verification", function () {
    it("should verify content integrity", async function () {
      const originalData = Buffer.from("test content for verification");
      const expectedHash = "QmExpectedHash123";

      const mockResponse = {
        ok: true,
        arrayBuffer: () => Promise.resolve(originalData.buffer)
      };
      
      sandbox.stub(global, 'fetch').resolves(mockResponse as any);

      const result = await ipfsManager.verifyContent(expectedHash, originalData);

      expect(result.valid).to.be.true;
    });

    it("should detect corrupted content", async function () {
      const originalData = Buffer.from("original content");
      const corruptedData = Buffer.from("corrupted content");
      const hash = "QmTestHash123";

      const mockResponse = {
        ok: true,
        arrayBuffer: () => Promise.resolve(corruptedData.buffer)
      };
      
      sandbox.stub(global, 'fetch').resolves(mockResponse as any);

      const result = await ipfsManager.verifyContent(hash, originalData);

      expect(result.valid).to.be.false;
    });
  });

  describe("Performance Monitoring", function () {
    it("should track upload performance", async function () {
      const mockFile = {
        buffer: Buffer.from("test file content"),
        originalName: "test.txt",
        mimeType: "text/plain"
      };

      const mockResponse = {
        IpfsHash: "QmTestHash123",
        PinSize: 1024,
        Timestamp: new Date().toISOString()
      };

      mockPinata.pinFileToIPFS.resolves(mockResponse);

      const result = await ipfsManager.uploadFile(mockFile);

      expect(result).to.have.property('uploadTime');
      expect(result.uploadTime).to.be.a('number');
      expect(result.uploadTime).to.be.greaterThan(0);
    });

    it("should track download performance", async function () {
      const mockFileData = Buffer.from("test file content");

      const mockResponse = {
        ok: true,
        arrayBuffer: () => Promise.resolve(mockFileData.buffer)
      };
      
      sandbox.stub(global, 'fetch').resolves(mockResponse as any);

      const result = await ipfsManager.retrieveFile("QmTestHash123");

      expect(result).to.have.property('downloadTime');
      expect(result.downloadTime).to.be.a('number');
      expect(result.downloadTime).to.be.greaterThan(0);
    });

    it("should provide performance statistics", async function () {
      const stats = await ipfsManager.getPerformanceStats();

      expect(stats).to.have.property('totalUploads');
      expect(stats).to.have.property('totalDownloads');
      expect(stats).to.have.property('averageUploadTime');
      expect(stats).to.have.property('averageDownloadTime');
      expect(stats).to.have.property('totalStorageUsed');
    });
  });

  describe("Error Recovery", function () {
    it("should retry failed operations", async function () {
      const mockFile = {
        buffer: Buffer.from("test file content"),
        originalName: "test.txt",
        mimeType: "text/plain"
      };

      const mockResponse = {
        IpfsHash: "QmTestHash123",
        PinSize: 1024,
        Timestamp: new Date().toISOString()
      };

      // Fail first two attempts, succeed on third
      mockPinata.pinFileToIPFS
        .onFirstCall().rejects(new Error("Network timeout"))
        .onSecondCall().rejects(new Error("Rate limit exceeded"))
        .onThirdCall().resolves(mockResponse);

      const result = await ipfsManager.uploadFile(mockFile, { retries: 3 });

      expect(result.success).to.be.true;
      expect(mockPinata.pinFileToIPFS).to.have.been.calledThrice;
    });

    it("should handle service degradation gracefully", async function () {
      const mockFile = {
        buffer: Buffer.from("test file content"),
        originalName: "test.txt",
        mimeType: "text/plain"
      };

      // Pinata fails, but Web3.Storage succeeds
      mockPinata.pinFileToIPFS.rejects(new Error("Service unavailable"));
      mockWeb3Storage.put.resolves("bafyTestCID456");

      const result = await ipfsManager.uploadFile(mockFile, { redundancy: true });

      expect(result.success).to.be.true;
      expect(result.web3StorageCID).to.equal("bafyTestCID456");
      expect(result.warnings).to.have.length.greaterThan(0);
    });
  });

  describe("Cleanup and Maintenance", function () {
    it("should clean up expired content", async function () {
      const expiredHashes = ["QmExpired1", "QmExpired2"];
      
      mockPinata.unpin.resolves();
      mockIPFSHTTP.pin.rm.resolves();

      const result = await ipfsManager.cleanupExpiredContent(expiredHashes);

      expect(result.success).to.be.true;
      expect(result.cleanedCount).to.equal(expiredHashes.length);
    });

    it("should optimize storage usage", async function () {
      const result = await ipfsManager.optimizeStorage();

      expect(result).to.have.property('duplicatesRemoved');
      expect(result).to.have.property('spaceSaved');
      expect(result).to.have.property('optimizationTime');
    });

    it("should backup critical content", async function () {
      const criticalHashes = ["QmCritical1", "QmCritical2"];

      const result = await ipfsManager.backupCriticalContent(criticalHashes);

      expect(result.success).to.be.true;
      expect(result.backedUpCount).to.equal(criticalHashes.length);
    });
  });
});