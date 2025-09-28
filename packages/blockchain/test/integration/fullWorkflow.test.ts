import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { WalletManager } from "../../src/services/WalletManager";
import { IPFSManager } from "../../src/services/IPFSManager";
import { CrossChainBridgeManager } from "../../src/services/CrossChainBridgeManager";
import { DAOGovernanceManager } from "../../src/services/DAOGovernanceManager";

describe("Full Workflow Integration Tests", function () {
  let owner: Signer;
  let user1: Signer;
  let user2: Signer;
  let validator1: Signer;
  let validator2: Signer;
  
  let yieldFarm: Contract;
  let crossChainBridge: Contract;
  let daoGovernance: Contract;
  let treasuryManager: Contract;
  let agentNFT: Contract;
  let governanceToken: Contract;
  let stakingToken: Contract;
  let rewardToken: Contract;

  let walletManager: WalletManager;
  let ipfsManager: IPFSManager;
  let bridgeManager: CrossChainBridgeManager;
  let daoManager: DAOGovernanceManager;

  beforeEach(async function () {
    [owner, user1, user2, validator1, validator2] = await ethers.getSigners();

    // Deploy all tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    governanceToken = await MockERC20.deploy("Governance Token", "GOV", ethers.parseEther("1000000"));
    stakingToken = await MockERC20.deploy("Staking Token", "STK", ethers.parseEther("1000000"));
    rewardToken = await MockERC20.deploy("Reward Token", "RWD", ethers.parseEther("1000000"));

    // Deploy YieldFarm
    const YieldFarm = await ethers.getContractFactory("YieldFarm");
    yieldFarm = await YieldFarm.deploy(
      await stakingToken.getAddress(),
      await rewardToken.getAddress(),
      ethers.parseEther("100"),
      await time.latest() + 100
    );

    // Deploy CrossChainBridge
    const CrossChainBridge = await ethers.getContractFactory("CrossChainBridge");
    crossChainBridge = await CrossChainBridge.deploy();

    // Deploy DAOGovernance
    const DAOGovernance = await ethers.getContractFactory("DAOGovernance");
    daoGovernance = await DAOGovernance.deploy(
      await governanceToken.getAddress(),
      ethers.parseEther("1000"),
      86400,
      3600
    );

    // Deploy TreasuryManager
    const TreasuryManager = await ethers.getContractFactory("TreasuryManager");
    treasuryManager = await TreasuryManager.deploy(2); // 2 out of 3 multisig

    // Deploy EnhancedAgentNFT
    const EnhancedAgentNFT = await ethers.getContractFactory("EnhancedAgentNFT");
    agentNFT = await EnhancedAgentNFT.deploy("Agent NFT", "ANFT", "https://api.urnlabs.ai/metadata/");

    // Setup validators
    await crossChainBridge.connect(owner).addValidator(validator1.address);
    await crossChainBridge.connect(owner).addValidator(validator2.address);

    // Setup treasury signers
    await treasuryManager.connect(owner).addSigner(await owner.getAddress());
    await treasuryManager.connect(owner).addSigner(await validator1.getAddress());
    await treasuryManager.connect(owner).addSigner(await validator2.getAddress());

    // Distribute tokens
    await governanceToken.transfer(user1.address, ethers.parseEther("10000"));
    await governanceToken.transfer(user2.address, ethers.parseEther("5000"));
    await stakingToken.transfer(user1.address, ethers.parseEther("1000"));
    await stakingToken.transfer(user2.address, ethers.parseEther("1000"));
    await rewardToken.transfer(await yieldFarm.getAddress(), ethers.parseEther("100000"));

    // Initialize services
    walletManager = new WalletManager();
    ipfsManager = new IPFSManager({
      pinataApiKey: "test-key",
      pinataSecretKey: "test-secret",
      web3StorageToken: "test-token",
      ipfsNodeUrl: "http://localhost:5001"
    });
    bridgeManager = new CrossChainBridgeManager(await crossChainBridge.getAddress());
    daoManager = new DAOGovernanceManager(await daoGovernance.getAddress());
  });

  describe("Complete DeFi Workflow", function () {
    it("should complete full yield farming lifecycle", async function () {
      // 1. Add pool to yield farm
      await yieldFarm.connect(owner).addPool(
        await stakingToken.getAddress(),
        1000,
        false
      );

      // 2. User stakes tokens
      const stakeAmount = ethers.parseEther("100");
      await stakingToken.connect(user1).approve(await yieldFarm.getAddress(), stakeAmount);
      await time.increase(200); // Move past start time
      await yieldFarm.connect(user1).deposit(0, stakeAmount);

      // 3. Time passes to accumulate rewards
      await time.increase(1000);

      // 4. Check pending rewards
      const pendingRewards = await yieldFarm.pendingReward(0, user1.address);
      expect(pendingRewards).to.be.greaterThan(0);

      // 5. Harvest rewards
      const initialRewardBalance = await rewardToken.balanceOf(user1.address);
      await yieldFarm.connect(user1).harvest(0);
      const finalRewardBalance = await rewardToken.balanceOf(user1.address);

      expect(finalRewardBalance).to.be.greaterThan(initialRewardBalance);

      // 6. Withdraw staked tokens
      await yieldFarm.connect(user1).withdraw(0, stakeAmount);

      const userInfo = await yieldFarm.userInfo(0, user1.address);
      expect(userInfo.amount).to.equal(0);
    });

    it("should complete cross-chain bridge workflow", async function () {
      // 1. Setup bridge liquidity
      const liquidityAmount = ethers.parseEther("10000");
      await stakingToken.transfer(await crossChainBridge.getAddress(), liquidityAmount);

      // 2. Initiate bridge transfer
      const bridgeAmount = ethers.parseEther("100");
      const targetChain = 137; // Polygon
      const recipient = user2.address;

      await stakingToken.connect(user1).approve(await crossChainBridge.getAddress(), bridgeAmount);
      
      const tx = await crossChainBridge.connect(user1).initiateBridge(
        await stakingToken.getAddress(),
        bridgeAmount,
        targetChain,
        recipient
      );

      const receipt = await tx.wait();
      const event = receipt.events?.find(e => e.event === "BridgeInitiated");
      const nonce = event?.args?.nonce;

      // 3. Validators sign completion
      const messageHash = ethers.solidityPackedKeccak256(
        ["uint256", "address", "address", "uint256"],
        [nonce, await stakingToken.getAddress(), recipient, bridgeAmount]
      );

      const sig1 = await validator1.signMessage(ethers.getBytes(messageHash));
      const sig2 = await validator2.signMessage(ethers.getBytes(messageHash));

      // 4. Complete bridge transfer
      await crossChainBridge.completeBridge(
        nonce,
        await stakingToken.getAddress(),
        recipient,
        bridgeAmount,
        [sig1, sig2]
      );

      expect(await crossChainBridge.completedTransfers(nonce)).to.be.true;
    });
  });

  describe("DAO Governance Workflow", function () {
    it("should complete full governance proposal lifecycle", async function () {
      // 1. Setup voting power
      await governanceToken.connect(user1).delegate(user1.address);
      await governanceToken.connect(user2).delegate(user2.address);

      // 2. Create proposal
      const targets = [await treasuryManager.getAddress()];
      const values = [0];
      const calldatas = [treasuryManager.interface.encodeFunctionData("setSpendingLimit", [ethers.parseEther("1000")])];
      const description = "Increase treasury spending limit";

      await daoGovernance.connect(user1).propose(targets, values, calldatas, description);

      // 3. Vote on proposal
      await daoGovernance.connect(user1).castVote(0, 1); // FOR
      await daoGovernance.connect(user2).castVote(0, 1); // FOR

      // 4. End voting period
      await time.increase(86401);

      // 5. Queue proposal
      await daoGovernance.queue(0);

      // 6. Wait for timelock
      await time.increase(3601);

      // 7. Execute proposal
      await daoGovernance.execute(0);

      expect(await daoGovernance.state(0)).to.equal(4); // Executed
    });

    it("should handle treasury management through governance", async function () {
      // 1. Fund treasury
      const treasuryFunding = ethers.parseEther("10000");
      await stakingToken.transfer(await treasuryManager.getAddress(), treasuryFunding);

      // 2. Create spending proposal
      const spendingAmount = ethers.parseEther("100");
      const recipient = user2.address;

      await treasuryManager.connect(owner).proposeTransaction(
        await stakingToken.getAddress(),
        recipient,
        spendingAmount,
        "0x",
        "Test spending proposal"
      );

      // 3. Approve transaction (multisig)
      await treasuryManager.connect(owner).approveTransaction(0);
      await treasuryManager.connect(validator1).approveTransaction(0);

      // 4. Execute approved transaction
      const initialBalance = await stakingToken.balanceOf(recipient);
      await treasuryManager.executeTransaction(0);
      const finalBalance = await stakingToken.balanceOf(recipient);

      expect(finalBalance - initialBalance).to.equal(spendingAmount);
    });
  });

  describe("NFT and Metadata Workflow", function () {
    it("should complete NFT minting with performance-based metadata", async function () {
      // 1. Mint NFT to user
      await agentNFT.connect(owner).mintAgent(user1.address, "test-agent-id");

      const tokenId = 0;
      expect(await agentNFT.ownerOf(tokenId)).to.equal(user1.address);

      // 2. Update performance metrics
      const performanceData = {
        tasksCompleted: 150,
        successRate: 95, // 95%
        averageResponseTime: 1200, // 1.2 seconds in milliseconds
        userRating: 48, // 4.8 out of 5, scaled by 10
        uptimePercentage: 995 // 99.5%, scaled by 10
      };

      await agentNFT.connect(owner).updatePerformance(
        tokenId,
        performanceData.tasksCompleted,
        performanceData.successRate,
        performanceData.averageResponseTime,
        performanceData.userRating,
        performanceData.uptimePercentage
      );

      // 3. Check performance tier calculation
      const agentData = await agentNFT.agents(tokenId);
      expect(agentData.performanceTier).to.be.greaterThan(0); // Should be upgraded from Common

      // 4. Update metadata URI with new performance
      const newMetadataURI = "https://api.urnlabs.ai/metadata/updated/";
      await agentNFT.connect(owner).updateMetadata(tokenId, newMetadataURI, 2);

      const metadata = await agentNFT.getMetadata(tokenId);
      expect(metadata.currentVersion).to.equal(2);
      expect(metadata.versions).to.have.length(2);
    });

    it("should handle metadata rollback", async function () {
      // 1. Mint NFT and update metadata twice
      await agentNFT.connect(owner).mintAgent(user1.address, "test-agent-rollback");

      const tokenId = 0;
      
      await agentNFT.connect(owner).updateMetadata(tokenId, "https://v2.metadata.uri/", 2);
      await agentNFT.connect(owner).updateMetadata(tokenId, "https://v3.metadata.uri/", 3);

      // 2. Rollback to version 2
      await agentNFT.connect(owner).rollbackMetadata(tokenId, 2);

      const metadata = await agentNFT.getMetadata(tokenId);
      expect(metadata.currentVersion).to.equal(2);
      expect(await agentNFT.tokenURI(tokenId)).to.include("v2.metadata.uri");
    });
  });

  describe("Security and Emergency Procedures", function () {
    it("should handle emergency pause across all contracts", async function () {
      // 1. Pause all contracts
      await yieldFarm.connect(owner).pause();
      await crossChainBridge.connect(owner).pause();
      await daoGovernance.connect(owner).pause();
      await treasuryManager.connect(owner).pause();
      await agentNFT.connect(owner).pause();

      // 2. Verify all contracts are paused
      expect(await yieldFarm.paused()).to.be.true;
      expect(await crossChainBridge.paused()).to.be.true;
      expect(await daoGovernance.paused()).to.be.true;
      expect(await treasuryManager.paused()).to.be.true;
      expect(await agentNFT.paused()).to.be.true;

      // 3. Verify operations are blocked
      await stakingToken.connect(user1).approve(await yieldFarm.getAddress(), ethers.parseEther("100"));
      
      await expect(
        yieldFarm.connect(user1).deposit(0, ethers.parseEther("100"))
      ).to.be.revertedWith("Pausable: paused");

      await expect(
        crossChainBridge.connect(user1).initiateBridge(
          await stakingToken.getAddress(),
          ethers.parseEther("100"),
          137,
          user2.address
        )
      ).to.be.revertedWith("Pausable: paused");
    });

    it("should handle emergency withdrawals", async function () {
      // 1. Setup emergency scenario
      await yieldFarm.connect(owner).addPool(await stakingToken.getAddress(), 1000, false);
      
      const stakeAmount = ethers.parseEther("100");
      await stakingToken.connect(user1).approve(await yieldFarm.getAddress(), stakeAmount);
      await time.increase(200);
      await yieldFarm.connect(user1).deposit(0, stakeAmount);

      // 2. Emergency withdrawal (no rewards, just principal)
      const initialBalance = await stakingToken.balanceOf(user1.address);
      await yieldFarm.connect(user1).emergencyWithdraw(0);
      const finalBalance = await stakingToken.balanceOf(user1.address);

      expect(finalBalance - initialBalance).to.equal(stakeAmount);

      // 3. Verify user state is cleared
      const userInfo = await yieldFarm.userInfo(0, user1.address);
      expect(userInfo.amount).to.equal(0);
      expect(userInfo.rewardDebt).to.equal(0);
    });
  });

  describe("Integration with External Services", function () {
    it("should integrate IPFS for metadata storage", async function () {
      // 1. Prepare NFT metadata
      const metadata = {
        name: "High Performance Agent",
        description: "An advanced AI agent with exceptional performance",
        image: "QmImageHash123",
        attributes: [
          { trait_type: "Agent Type", value: "Assistant" },
          { trait_type: "Performance Tier", value: "Epic" }
        ]
      };

      const performanceMetrics = {
        tasksCompleted: 500,
        successRate: 0.98,
        averageResponseTime: 0.8,
        userRating: 4.9,
        uptimePercentage: 99.8
      };

      // 2. Upload to IPFS (mocked in test environment)
      // In real environment, this would upload to actual IPFS
      const mockIPFSHash = "QmMockMetadataHash456";

      // 3. Mint NFT with IPFS metadata
      await agentNFT.connect(owner).mintAgent(user1.address, "high-performance-agent");
      await agentNFT.connect(owner).updateMetadata(0, `https://ipfs.io/ipfs/${mockIPFSHash}`, 1);

      const tokenURI = await agentNFT.tokenURI(0);
      expect(tokenURI).to.include(mockIPFSHash);
    });

    it("should handle multi-chain operations", async function () {
      // 1. Setup bridge for multiple chains
      const chains = [1, 137, 56, 42161]; // Ethereum, Polygon, BSC, Arbitrum
      
      for (const chainId of chains) {
        if (chainId !== 1) { // Skip current chain
          // This would set up chain-specific configurations
          // In real implementation, this involves cross-chain communication
        }
      }

      // 2. Test bridge operation to different chain
      const bridgeAmount = ethers.parseEther("50");
      await stakingToken.transfer(await crossChainBridge.getAddress(), ethers.parseEther("1000"));
      await stakingToken.connect(user1).approve(await crossChainBridge.getAddress(), bridgeAmount);

      await crossChainBridge.connect(user1).initiateBridge(
        await stakingToken.getAddress(),
        bridgeAmount,
        137, // Polygon
        user2.address
      );

      expect(await crossChainBridge.nonce()).to.equal(1);
    });
  });

  describe("Performance and Gas Optimization", function () {
    it("should optimize gas usage for batch operations", async function () {
      // 1. Setup multiple users for batch testing
      const users = [user1, user2];
      const stakeAmounts = [ethers.parseEther("100"), ethers.parseEther("200")];

      await yieldFarm.connect(owner).addPool(await stakingToken.getAddress(), 1000, false);

      // 2. Batch approve and deposit
      for (let i = 0; i < users.length; i++) {
        await stakingToken.connect(users[i]).approve(await yieldFarm.getAddress(), stakeAmounts[i]);
      }

      await time.increase(200);

      const gasUsed = [];
      for (let i = 0; i < users.length; i++) {
        const tx = await yieldFarm.connect(users[i]).deposit(0, stakeAmounts[i]);
        const receipt = await tx.wait();
        gasUsed.push(receipt.gasUsed);
      }

      // 3. Verify gas usage is reasonable (less than 200k per operation)
      for (const gas of gasUsed) {
        expect(gas).to.be.lessThan(200000);
      }
    });

    it("should handle high-frequency operations efficiently", async function () {
      // 1. Setup for rapid operations
      await yieldFarm.connect(owner).addPool(await stakingToken.getAddress(), 1000, false);
      
      const smallAmount = ethers.parseEther("10");
      await stakingToken.connect(user1).approve(await yieldFarm.getAddress(), ethers.parseEther("1000"));
      await time.increase(200);

      // 2. Perform multiple quick operations
      const operations = 10;
      const startTime = Date.now();

      for (let i = 0; i < operations; i++) {
        await yieldFarm.connect(user1).deposit(0, smallAmount);
        await yieldFarm.connect(user1).withdraw(0, smallAmount);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // 3. Verify operations complete in reasonable time (less than 10 seconds for 20 operations)
      expect(totalTime).to.be.lessThan(10000);
    });
  });
});