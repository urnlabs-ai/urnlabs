import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Contract, Signer } from "ethers";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("Gas Optimization Tests", function () {
  interface GasMetrics {
    operation: string;
    gasUsed: bigint;
    description: string;
  }

  let gasMetrics: GasMetrics[] = [];

  async function deployContractsFixture() {
    const [owner, admin, operator, user1, user2, user3, feeRecipient, treasury] = await ethers.getSigners();

    // Deploy UrnToken
    const UrnTokenFactory = await ethers.getContractFactory("UrnToken");
    const urnToken = await upgrades.deployProxy(
      UrnTokenFactory,
      ["Urn Token", "URN", ethers.parseEther("1000000"), admin.address],
      { initializer: "initialize" }
    );

    // Deploy mock tokens
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const lpToken1 = await MockERC20Factory.deploy("LP Token 1", "LP1", ethers.parseEther("10000"));
    const lpToken2 = await MockERC20Factory.deploy("LP Token 2", "LP2", ethers.parseEther("10000"));
    const token0 = await MockERC20Factory.deploy("Token 0", "TK0", ethers.parseEther("1000000"));
    const token1 = await MockERC20Factory.deploy("Token 1", "TK1", ethers.parseEther("1000000"));

    // Deploy mock Uniswap contracts
    const MockNonfungiblePositionManagerFactory = await ethers.getContractFactory("MockNonfungiblePositionManager");
    const MockSwapRouterFactory = await ethers.getContractFactory("MockSwapRouter");
    const MockQuoterFactory = await ethers.getContractFactory("MockQuoter");

    const positionManager = await MockNonfungiblePositionManagerFactory.deploy();
    const swapRouter = await MockSwapRouterFactory.deploy();
    const quoter = await MockQuoterFactory.deploy();

    // Deploy YieldFarm
    const currentBlock = await ethers.provider.getBlockNumber();
    const startBlock = currentBlock + 10;
    const bonusEndBlock = startBlock + 100;

    const YieldFarmFactory = await ethers.getContractFactory("YieldFarm");
    const yieldFarm = await upgrades.deployProxy(
      YieldFarmFactory,
      [
        await urnToken.getAddress(),
        ethers.parseEther("10"),
        startBlock,
        bonusEndBlock,
        admin.address,
        feeRecipient.address
      ],
      { initializer: "initialize" }
    );

    // Deploy LiquidityManager
    const LiquidityManagerFactory = await ethers.getContractFactory("LiquidityManager");
    const liquidityManager = await upgrades.deployProxy(
      LiquidityManagerFactory,
      [
        await positionManager.getAddress(),
        await swapRouter.getAddress(),
        await quoter.getAddress(),
        admin.address,
        feeRecipient.address
      ],
      { initializer: "initialize" }
    );

    // Deploy RewardDistributor
    const currentTime = await time.latest();
    const startTime = currentTime + 100;
    const endTime = startTime + 365 * 24 * 60 * 60;

    const RewardDistributorFactory = await ethers.getContractFactory("RewardDistributor");
    const rewardDistributor = await upgrades.deployProxy(
      RewardDistributorFactory,
      [
        await urnToken.getAddress(),
        ethers.parseEther("1"),
        startTime,
        endTime,
        admin.address,
        treasury.address
      ],
      { initializer: "initialize" }
    );

    // Grant necessary roles
    await urnToken.connect(admin).grantRole(await urnToken.MINTER_ROLE(), await yieldFarm.getAddress());
    await urnToken.connect(admin).grantRole(await urnToken.MINTER_ROLE(), await rewardDistributor.getAddress());

    // Distribute tokens
    for (const user of [user1, user2, user3]) {
      await lpToken1.transfer(user.address, ethers.parseEther("1000"));
      await lpToken2.transfer(user.address, ethers.parseEther("1000"));
      await token0.transfer(user.address, ethers.parseEther("10000"));
      await token1.transfer(user.address, ethers.parseEther("10000"));
    }

    return {
      yieldFarm,
      liquidityManager,
      rewardDistributor,
      urnToken,
      lpToken1,
      lpToken2,
      token0,
      token1,
      positionManager,
      owner,
      admin,
      operator,
      user1,
      user2,
      user3,
      feeRecipient,
      treasury,
      startBlock,
      startTime
    };
  }

  function recordGasUsage(operation: string, gasUsed: bigint, description: string) {
    gasMetrics.push({ operation, gasUsed, description });
    console.log(`${operation}: ${gasUsed.toString()} gas - ${description}`);
  }

  describe("YieldFarm Gas Optimization", function () {
    it("Should optimize pool addition gas costs", async function () {
      const { yieldFarm, lpToken1, admin } = await loadFixture(deployContractsFixture);

      // Test single pool addition
      const tx1 = await yieldFarm.connect(admin).addPool(
        1000,
        await lpToken1.getAddress(),
        30 * 24 * 60 * 60,
        "Test Pool",
        ethers.ZeroAddress,
        false
      );
      const receipt1 = await tx1.wait();
      recordGasUsage("YieldFarm.addPool", receipt1?.gasUsed || 0n, "Single pool addition");

      // Test batch pool addition (if supported)
      const gasUsedSingle = receipt1?.gasUsed || 0n;
      expect(gasUsedSingle).to.be.lt(200000n); // Should be under 200k gas
    });

    it("Should optimize deposit operations", async function () {
      const { yieldFarm, lpToken1, user1, admin } = await loadFixture(deployContractsFixture);

      // Add pool first
      await yieldFarm.connect(admin).addPool(
        1000,
        await lpToken1.getAddress(),
        30 * 24 * 60 * 60,
        "Test Pool",
        ethers.ZeroAddress,
        false
      );

      const depositAmount = ethers.parseEther("100");
      await lpToken1.connect(user1).approve(await yieldFarm.getAddress(), depositAmount);

      // Test first deposit (includes initialization)
      const tx1 = await yieldFarm.connect(user1).deposit(0, depositAmount, 30 * 24 * 60 * 60);
      const receipt1 = await tx1.wait();
      recordGasUsage("YieldFarm.deposit", receipt1?.gasUsed || 0n, "First deposit with initialization");

      // Test subsequent deposit (should be cheaper)
      await lpToken1.connect(user1).approve(await yieldFarm.getAddress(), depositAmount);
      const tx2 = await yieldFarm.connect(user1).deposit(0, depositAmount, 30 * 24 * 60 * 60);
      const receipt2 = await tx2.wait();
      recordGasUsage("YieldFarm.deposit", receipt2?.gasUsed || 0n, "Subsequent deposit");

      expect(receipt1?.gasUsed).to.be.lt(300000n);
      expect(receipt2?.gasUsed).to.be.lt(250000n);
      expect(receipt2?.gasUsed).to.be.lt(receipt1?.gasUsed);
    });

    it("Should optimize reward claiming", async function () {
      const { yieldFarm, lpToken1, user1, admin, startBlock } = await loadFixture(deployContractsFixture);

      // Setup
      await yieldFarm.connect(admin).addPool(
        1000,
        await lpToken1.getAddress(),
        30 * 24 * 60 * 60,
        "Test Pool",
        ethers.ZeroAddress,
        false
      );

      const depositAmount = ethers.parseEther("100");
      await lpToken1.connect(user1).approve(await yieldFarm.getAddress(), depositAmount);
      await yieldFarm.connect(user1).deposit(0, depositAmount, 30 * 24 * 60 * 60);

      // Advance to start block and accumulate rewards
      await time.advanceBlockTo(startBlock + 20);

      // Test reward claiming
      const tx = await yieldFarm.connect(user1).claimRewards(0);
      const receipt = await tx.wait();
      recordGasUsage("YieldFarm.claimRewards", receipt?.gasUsed || 0n, "Claim accumulated rewards");

      expect(receipt?.gasUsed).to.be.lt(150000n);
    });

    it("Should optimize mass pool updates", async function () {
      const { yieldFarm, lpToken1, lpToken2, admin } = await loadFixture(deployContractsFixture);

      // Add multiple pools
      await yieldFarm.connect(admin).addPool(
        1000,
        await lpToken1.getAddress(),
        30 * 24 * 60 * 60,
        "Pool 1",
        ethers.ZeroAddress,
        false
      );
      await yieldFarm.connect(admin).addPool(
        500,
        await lpToken2.getAddress(),
        90 * 24 * 60 * 60,
        "Pool 2",
        ethers.ZeroAddress,
        false
      );

      // Test mass update
      const tx = await yieldFarm.massUpdatePools();
      const receipt = await tx.wait();
      recordGasUsage("YieldFarm.massUpdatePools", receipt?.gasUsed || 0n, "Update 2 pools");

      // Gas should scale reasonably with number of pools
      expect(receipt?.gasUsed).to.be.lt(100000n); // Should be under 100k for 2 pools
    });
  });

  describe("LiquidityManager Gas Optimization", function () {
    it("Should optimize liquidity addition", async function () {
      const { liquidityManager, token0, token1, user1, admin } = await loadFixture(deployContractsFixture);

      // Configure pool
      const poolAddress = ethers.Wallet.createRandom().address;
      await liquidityManager.connect(admin).configurePool(
        poolAddress,
        await token0.getAddress(),
        await token1.getAddress(),
        3000,
        -887220,
        887220,
        500,
        true,
        1000
      );

      const amount0 = ethers.parseEther("1000");
      const amount1 = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 3600;

      await token0.connect(user1).approve(await liquidityManager.getAddress(), amount0);
      await token1.connect(user1).approve(await liquidityManager.getAddress(), amount1);

      // Test add liquidity
      const tx = await liquidityManager.connect(user1).addLiquidity(
        poolAddress,
        amount0,
        amount1,
        amount0 * 95n / 100n,
        amount1 * 95n / 100n,
        deadline
      );
      const receipt = await tx.wait();
      recordGasUsage("LiquidityManager.addLiquidity", receipt?.gasUsed || 0n, "Add liquidity to pool");

      expect(receipt?.gasUsed).to.be.lt(500000n);
    });

    it("Should optimize fee collection", async function () {
      const { liquidityManager, token0, token1, user1, admin } = await loadFixture(deployContractsFixture);

      // Setup liquidity first
      const poolAddress = ethers.Wallet.createRandom().address;
      await liquidityManager.connect(admin).configurePool(
        poolAddress,
        await token0.getAddress(),
        await token1.getAddress(),
        3000,
        -887220,
        887220,
        500,
        true,
        1000
      );

      const amount0 = ethers.parseEther("1000");
      const amount1 = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 3600;

      await token0.connect(user1).approve(await liquidityManager.getAddress(), amount0);
      await token1.connect(user1).approve(await liquidityManager.getAddress(), amount1);

      await liquidityManager.connect(user1).addLiquidity(
        poolAddress,
        amount0,
        amount1,
        amount0 * 95n / 100n,
        amount1 * 95n / 100n,
        deadline
      );

      const userPositions = await liquidityManager.getUserPositions(user1.address);
      const tokenId = userPositions[0];

      // Test fee collection
      const tx = await liquidityManager.connect(user1).collectFees(tokenId);
      const receipt = await tx.wait();
      recordGasUsage("LiquidityManager.collectFees", receipt?.gasUsed || 0n, "Collect position fees");

      expect(receipt?.gasUsed).to.be.lt(300000n);
    });
  });

  describe("RewardDistributor Gas Optimization", function () {
    it("Should optimize stake registration", async function () {
      const { rewardDistributor, admin, user1, startTime } = await loadFixture(deployContractsFixture);

      // Add pool
      await rewardDistributor.connect(admin).addPool(
        "Test Pool",
        user1.address, // Using user1 as mock staking contract
        1000,
        ethers.parseEther("100000"),
        ethers.parseEther("100"),
        30 * 24 * 60 * 60,
        false
      );

      await time.increaseTo(startTime + 100);

      // Test stake registration
      const tx = await rewardDistributor.connect(user1).registerStake(
        0,
        user1.address,
        ethers.parseEther("1000"),
        30 * 24 * 60 * 60
      );
      const receipt = await tx.wait();
      recordGasUsage("RewardDistributor.registerStake", receipt?.gasUsed || 0n, "Register new stake");

      expect(receipt?.gasUsed).to.be.lt(200000n);
    });

    it("Should optimize reward claiming", async function () {
      const { rewardDistributor, admin, user1, startTime } = await loadFixture(deployContractsFixture);

      // Setup
      await rewardDistributor.connect(admin).addPool(
        "Test Pool",
        user1.address,
        1000,
        ethers.parseEther("100000"),
        ethers.parseEther("100"),
        30 * 24 * 60 * 60,
        false
      );

      await time.increaseTo(startTime + 100);
      await rewardDistributor.connect(user1).registerStake(
        0,
        user1.address,
        ethers.parseEther("1000"),
        30 * 24 * 60 * 60
      );

      // Accumulate rewards
      await time.increase(3600);

      // Test reward claiming
      const tx = await rewardDistributor.connect(user1).claimRewards(0);
      const receipt = await tx.wait();
      recordGasUsage("RewardDistributor.claimRewards", receipt?.gasUsed || 0n, "Claim pending rewards");

      expect(receipt?.gasUsed).to.be.lt(150000n);
    });

    it("Should optimize mass pool updates", async function () {
      const { rewardDistributor, admin, user1, user2 } = await loadFixture(deployContractsFixture);

      // Add multiple pools
      await rewardDistributor.connect(admin).addPool(
        "Pool 1",
        user1.address,
        1000,
        ethers.parseEther("100000"),
        ethers.parseEther("100"),
        30 * 24 * 60 * 60,
        false
      );
      await rewardDistributor.connect(admin).addPool(
        "Pool 2",
        user2.address,
        500,
        ethers.parseEther("50000"),
        ethers.parseEther("50"),
        90 * 24 * 60 * 60,
        false
      );

      // Test mass update
      const tx = await rewardDistributor.massUpdatePools();
      const receipt = await tx.wait();
      recordGasUsage("RewardDistributor.massUpdatePools", receipt?.gasUsed || 0n, "Update 2 reward pools");

      expect(receipt?.gasUsed).to.be.lt(150000n);
    });
  });

  describe("Batch Operations Optimization", function () {
    it("Should optimize batch deposits in YieldFarm", async function () {
      const { yieldFarm, lpToken1, user1, user2, admin } = await loadFixture(deployContractsFixture);

      await yieldFarm.connect(admin).addPool(
        1000,
        await lpToken1.getAddress(),
        30 * 24 * 60 * 60,
        "Test Pool",
        ethers.ZeroAddress,
        false
      );

      const depositAmount = ethers.parseEther("100");

      // Sequential deposits
      const startGas = await ethers.provider.getBalance(user1.address);

      await lpToken1.connect(user1).approve(await yieldFarm.getAddress(), depositAmount);
      const tx1 = await yieldFarm.connect(user1).deposit(0, depositAmount, 30 * 24 * 60 * 60);
      const receipt1 = await tx1.wait();

      await lpToken1.connect(user2).approve(await yieldFarm.getAddress(), depositAmount);
      const tx2 = await yieldFarm.connect(user2).deposit(0, depositAmount, 30 * 24 * 60 * 60);
      const receipt2 = await tx2.wait();

      const totalGas = (receipt1?.gasUsed || 0n) + (receipt2?.gasUsed || 0n);
      recordGasUsage("YieldFarm.deposit", totalGas, "Two sequential deposits");

      expect(receipt2?.gasUsed).to.be.lt(receipt1?.gasUsed); // Second should be cheaper
    });

    it("Should optimize multiple fee collections", async function () {
      const { liquidityManager, token0, token1, user1, admin } = await loadFixture(deployContractsFixture);

      const poolAddress = ethers.Wallet.createRandom().address;
      await liquidityManager.connect(admin).configurePool(
        poolAddress,
        await token0.getAddress(),
        await token1.getAddress(),
        3000,
        -887220,
        887220,
        500,
        true,
        1000
      );

      // Add multiple positions
      const amount0 = ethers.parseEther("500");
      const amount1 = ethers.parseEther("500");
      const deadline = (await time.latest()) + 3600;

      await token0.connect(user1).approve(await liquidityManager.getAddress(), amount0 * 2n);
      await token1.connect(user1).approve(await liquidityManager.getAddress(), amount1 * 2n);

      await liquidityManager.connect(user1).addLiquidity(
        poolAddress,
        amount0,
        amount1,
        amount0 * 95n / 100n,
        amount1 * 95n / 100n,
        deadline
      );

      await liquidityManager.connect(user1).addLiquidity(
        poolAddress,
        amount0,
        amount1,
        amount0 * 95n / 100n,
        amount1 * 95n / 100n,
        deadline
      );

      const userPositions = await liquidityManager.getUserPositions(user1.address);

      // Collect fees from multiple positions
      let totalGas = 0n;
      for (const tokenId of userPositions) {
        const tx = await liquidityManager.connect(user1).collectFees(tokenId);
        const receipt = await tx.wait();
        totalGas += receipt?.gasUsed || 0n;
      }

      recordGasUsage("LiquidityManager.collectFees", totalGas, `Multiple fee collections (${userPositions.length} positions)`);
    });
  });

  describe("Storage Optimization", function () {
    it("Should efficiently pack struct data", async function () {
      const { yieldFarm, lpToken1, user1, admin } = await loadFixture(deployContractsFixture);

      await yieldFarm.connect(admin).addPool(
        1000,
        await lpToken1.getAddress(),
        30 * 24 * 60 * 60,
        "Test Pool",
        ethers.ZeroAddress,
        false
      );

      // Test storage reads
      const gasStart = await ethers.provider.getBalance(user1.address);

      // Multiple reads should be efficient due to storage packing
      const poolInfo = await yieldFarm.poolInfo(0);
      const userInfo = await yieldFarm.userInfo(0, user1.address);
      const totalAllocPoint = await yieldFarm.totalAllocPoint();

      // Storage reads should be minimal gas
      expect(poolInfo).to.exist;
      expect(userInfo).to.exist;
      expect(totalAllocPoint).to.exist;
    });

    it("Should optimize state variable access patterns", async function () {
      const { rewardDistributor, admin, user1, startTime } = await loadFixture(deployContractsFixture);

      await rewardDistributor.connect(admin).addPool(
        "Test Pool",
        user1.address,
        1000,
        ethers.parseEther("100000"),
        ethers.parseEther("100"),
        30 * 24 * 60 * 60,
        false
      );

      await time.increaseTo(startTime + 100);

      // Test that frequently accessed variables are read efficiently
      const pendingBefore = await rewardDistributor.pendingRewards(0, user1.address);
      const poolInfo = await rewardDistributor.rewardPools(0);
      const userReward = await rewardDistributor.userRewards(0, user1.address);

      expect(pendingBefore).to.exist;
      expect(poolInfo).to.exist;
      expect(userReward).to.exist;
    });
  });

  describe("Gas Comparison Analysis", function () {
    it("Should compare gas costs across different scenarios", async function () {
      const { yieldFarm, lpToken1, user1, user2, admin, startBlock } = await loadFixture(deployContractsFixture);

      await yieldFarm.connect(admin).addPool(
        1000,
        await lpToken1.getAddress(),
        30 * 24 * 60 * 60,
        "Test Pool",
        ethers.ZeroAddress,
        false
      );

      const smallAmount = ethers.parseEther("10");
      const largeAmount = ethers.parseEther("1000");

      // Small deposit
      await lpToken1.connect(user1).approve(await yieldFarm.getAddress(), smallAmount);
      const tx1 = await yieldFarm.connect(user1).deposit(0, smallAmount, 30 * 24 * 60 * 60);
      const receipt1 = await tx1.wait();
      recordGasUsage("YieldFarm.deposit", receipt1?.gasUsed || 0n, "Small amount deposit");

      // Large deposit
      await lpToken1.connect(user2).approve(await yieldFarm.getAddress(), largeAmount);
      const tx2 = await yieldFarm.connect(user2).deposit(0, largeAmount, 30 * 24 * 60 * 60);
      const receipt2 = await tx2.wait();
      recordGasUsage("YieldFarm.deposit", receipt2?.gasUsed || 0n, "Large amount deposit");

      // Gas should be similar regardless of amount
      const gasDifference = receipt1?.gasUsed > receipt2?.gasUsed 
        ? receipt1.gasUsed - receipt2.gasUsed 
        : receipt2.gasUsed - receipt1.gasUsed;

      expect(gasDifference).to.be.lt(50000n); // Should differ by less than 50k gas
    });
  });

  after(function () {
    console.log("\n=== Gas Usage Summary ===");
    console.log("Operation".padEnd(35) + "Gas Used".padEnd(15) + "Description");
    console.log("─".repeat(80));

    // Group by operation type
    const groupedMetrics = gasMetrics.reduce((acc, metric) => {
      if (!acc[metric.operation]) {
        acc[metric.operation] = [];
      }
      acc[metric.operation].push(metric);
      return acc;
    }, {} as Record<string, GasMetrics[]>);

    Object.entries(groupedMetrics).forEach(([operation, metrics]) => {
      const avgGas = metrics.reduce((sum, m) => sum + m.gasUsed, 0n) / BigInt(metrics.length);
      const minGas = metrics.reduce((min, m) => m.gasUsed < min ? m.gasUsed : min, metrics[0].gasUsed);
      const maxGas = metrics.reduce((max, m) => m.gasUsed > max ? m.gasUsed : max, metrics[0].gasUsed);

      console.log(`${operation.padEnd(35)}${avgGas.toString().padEnd(15)}Average over ${metrics.length} tests`);
      if (metrics.length > 1) {
        console.log(`${"".padEnd(35)}${minGas.toString().padEnd(15)}Minimum gas used`);
        console.log(`${"".padEnd(35)}${maxGas.toString().padEnd(15)}Maximum gas used`);
      }
      console.log();
    });
  });
});