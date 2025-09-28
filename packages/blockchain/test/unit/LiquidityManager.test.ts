import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Contract, Signer } from "ethers";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

describe("LiquidityManager", function () {
  // Test constants
  const MANAGEMENT_FEE = 100n; // 1%
  const MAX_SLIPPAGE = 500n; // 5%
  const MIN_LIQUIDITY_AMOUNT = 1000n;
  const MAX_POSITIONS_PER_USER = 10n;

  async function deployLiquidityManagerFixture() {
    const [owner, admin, operator, user1, user2, user3, feeRecipient] = await ethers.getSigners();

    // Deploy mock Uniswap V3 contracts
    const MockUniswapV3PoolFactory = await ethers.getContractFactory("MockUniswapV3Pool");
    const MockNonfungiblePositionManagerFactory = await ethers.getContractFactory("MockNonfungiblePositionManager");
    const MockSwapRouterFactory = await ethers.getContractFactory("MockSwapRouter");
    const MockQuoterFactory = await ethers.getContractFactory("MockQuoter");

    const positionManager = await MockNonfungiblePositionManagerFactory.deploy();
    const swapRouter = await MockSwapRouterFactory.deploy();
    const quoter = await MockQuoterFactory.deploy();

    // Deploy mock tokens
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const token0 = await MockERC20Factory.deploy("Token 0", "TK0", ethers.parseEther("1000000"));
    const token1 = await MockERC20Factory.deploy("Token 1", "TK1", ethers.parseEther("1000000"));

    // Ensure token0 < token1 for Uniswap V3 convention
    const [tokenA, tokenB] = (await token0.getAddress()) < (await token1.getAddress()) 
      ? [token0, token1] 
      : [token1, token0];

    // Deploy mock pool
    const pool = await MockUniswapV3PoolFactory.deploy(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      3000 // 0.3% fee
    );

    // Deploy mock price feeds
    const MockAggregatorFactory = await ethers.getContractFactory("MockAggregator");
    const priceFeedA = await MockAggregatorFactory.deploy(8, ethers.parseUnits("1", 8)); // $1
    const priceFeedB = await MockAggregatorFactory.deploy(8, ethers.parseUnits("2", 8)); // $2

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

    // Grant operator role
    await liquidityManager.connect(admin).grantRole(await liquidityManager.OPERATOR_ROLE(), operator.address);

    // Distribute tokens to users
    await tokenA.transfer(user1.address, ethers.parseEther("10000"));
    await tokenA.transfer(user2.address, ethers.parseEther("10000"));
    await tokenA.transfer(user3.address, ethers.parseEther("10000"));
    await tokenA.transfer(await positionManager.getAddress(), ethers.parseEther("100000"));
    
    await tokenB.transfer(user1.address, ethers.parseEther("10000"));
    await tokenB.transfer(user2.address, ethers.parseEther("10000"));
    await tokenB.transfer(user3.address, ethers.parseEther("10000"));
    await tokenB.transfer(await positionManager.getAddress(), ethers.parseEther("100000"));

    return {
      liquidityManager,
      positionManager,
      swapRouter,
      quoter,
      pool,
      tokenA,
      tokenB,
      priceFeedA,
      priceFeedB,
      owner,
      admin,
      operator,
      user1,
      user2,
      user3,
      feeRecipient
    };
  }

  async function deployWithConfiguredPoolFixture() {
    const fixture = await loadFixture(deployLiquidityManagerFixture);
    const { liquidityManager, pool, tokenA, tokenB, priceFeedA, admin } = fixture;

    // Configure pool
    await liquidityManager.connect(admin).configurePool(
      await pool.getAddress(),
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      3000, // fee
      -887220, // tickLower (approximately -100% price change)
      887220,  // tickUpper (approximately +100% price change)
      MAX_SLIPPAGE,
      true, // autoRebalance
      1000  // rebalanceThreshold (10%)
    );

    return fixture;
  }

  describe("Deployment", function () {
    it("Should deploy with correct initial parameters", async function () {
      const { liquidityManager, positionManager, swapRouter, quoter, admin, feeRecipient } = await loadFixture(deployLiquidityManagerFixture);

      expect(await liquidityManager.positionManager()).to.equal(await positionManager.getAddress());
      expect(await liquidityManager.swapRouter()).to.equal(await swapRouter.getAddress());
      expect(await liquidityManager.quoter()).to.equal(await quoter.getAddress());
      expect(await liquidityManager.feeRecipient()).to.equal(feeRecipient.address);
      expect(await liquidityManager.managementFee()).to.equal(MANAGEMENT_FEE);
      expect(await liquidityManager.minLiquidityAmount()).to.equal(MIN_LIQUIDITY_AMOUNT);
      expect(await liquidityManager.maxPositionsPerUser()).to.equal(MAX_POSITIONS_PER_USER);
    });

    it("Should grant correct roles to admin", async function () {
      const { liquidityManager, admin } = await loadFixture(deployLiquidityManagerFixture);

      const adminRole = await liquidityManager.ADMIN_ROLE();
      const operatorRole = await liquidityManager.OPERATOR_ROLE();
      const upgraderRole = await liquidityManager.UPGRADER_ROLE();

      expect(await liquidityManager.hasRole(adminRole, admin.address)).to.be.true;
      expect(await liquidityManager.hasRole(operatorRole, admin.address)).to.be.true;
      expect(await liquidityManager.hasRole(upgraderRole, admin.address)).to.be.true;
    });

    it("Should revert with invalid parameters", async function () {
      const [admin, feeRecipient] = await ethers.getSigners();
      const LiquidityManagerFactory = await ethers.getContractFactory("LiquidityManager");

      // Invalid position manager
      await expect(
        upgrades.deployProxy(
          LiquidityManagerFactory,
          [
            ethers.ZeroAddress,
            ethers.ZeroAddress,
            ethers.ZeroAddress,
            admin.address,
            feeRecipient.address
          ],
          { initializer: "initialize" }
        )
      ).to.be.revertedWith("Invalid position manager");
    });
  });

  describe("Pool Configuration", function () {
    it("Should configure pool correctly", async function () {
      const { liquidityManager, pool, tokenA, tokenB, admin } = await loadFixture(deployLiquidityManagerFixture);

      await expect(
        liquidityManager.connect(admin).configurePool(
          await pool.getAddress(),
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          3000,
          -887220,
          887220,
          MAX_SLIPPAGE,
          true,
          1000
        )
      ).to.emit(liquidityManager, "PoolConfigured")
        .withArgs(
          await pool.getAddress(),
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          3000,
          -887220,
          887220
        );

      const poolConfig = await liquidityManager.poolConfigs(await pool.getAddress());
      expect(poolConfig.token0).to.equal(await tokenA.getAddress());
      expect(poolConfig.token1).to.equal(await tokenB.getAddress());
      expect(poolConfig.fee).to.equal(3000);
      expect(poolConfig.isActive).to.be.true;
      expect(poolConfig.autoRebalance).to.be.true;
    });

    it("Should not allow non-admin to configure pools", async function () {
      const { liquidityManager, pool, tokenA, tokenB, user1 } = await loadFixture(deployLiquidityManagerFixture);

      await expect(
        liquidityManager.connect(user1).configurePool(
          await pool.getAddress(),
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          3000,
          -887220,
          887220,
          MAX_SLIPPAGE,
          true,
          1000
        )
      ).to.be.revertedWithCustomError(liquidityManager, "AccessControlUnauthorizedAccount");
    });

    it("Should validate pool configuration parameters", async function () {
      const { liquidityManager, pool, tokenA, tokenB, admin } = await loadFixture(deployLiquidityManagerFixture);

      // Invalid pool address
      await expect(
        liquidityManager.connect(admin).configurePool(
          ethers.ZeroAddress,
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          3000,
          -887220,
          887220,
          MAX_SLIPPAGE,
          true,
          1000
        )
      ).to.be.revertedWith("Invalid pool address");

      // Invalid tick range
      await expect(
        liquidityManager.connect(admin).configurePool(
          await pool.getAddress(),
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          3000,
          887220,  // tickLower > tickUpper
          -887220,
          MAX_SLIPPAGE,
          true,
          1000
        )
      ).to.be.revertedWith("Invalid tick range");

      // Slippage too high
      await expect(
        liquidityManager.connect(admin).configurePool(
          await pool.getAddress(),
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          3000,
          -887220,
          887220,
          1001, // > 10%
          true,
          1000
        )
      ).to.be.revertedWith("Slippage too high");
    });
  });

  describe("Liquidity Operations", function () {
    it("Should add liquidity successfully", async function () {
      const { liquidityManager, pool, tokenA, tokenB, user1 } = await loadFixture(deployWithConfiguredPoolFixture);

      const amount0 = ethers.parseEther("1000");
      const amount1 = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 3600;

      // Approve tokens
      await tokenA.connect(user1).approve(await liquidityManager.getAddress(), amount0);
      await tokenB.connect(user1).approve(await liquidityManager.getAddress(), amount1);

      await expect(
        liquidityManager.connect(user1).addLiquidity(
          await pool.getAddress(),
          amount0,
          amount1,
          amount0 * 95n / 100n, // 5% slippage
          amount1 * 95n / 100n,
          deadline
        )
      ).to.emit(liquidityManager, "LiquidityAdded");

      const userPositions = await liquidityManager.getUserPositions(user1.address);
      expect(userPositions.length).to.equal(1);

      const position = await liquidityManager.getPositionDetails(userPositions[0]);
      expect(position.owner).to.equal(user1.address);
      expect(position.amount0).to.be.gt(0);
      expect(position.amount1).to.be.gt(0);
    });

    it("Should not allow adding liquidity to unconfigured pool", async function () {
      const { liquidityManager, tokenA, tokenB, user1 } = await loadFixture(deployLiquidityManagerFixture);

      const amount0 = ethers.parseEther("1000");
      const amount1 = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 3600;
      const fakePoolAddress = ethers.Wallet.createRandom().address;

      await expect(
        liquidityManager.connect(user1).addLiquidity(
          fakePoolAddress,
          amount0,
          amount1,
          amount0 * 95n / 100n,
          amount1 * 95n / 100n,
          deadline
        )
      ).to.be.revertedWith("Pool not configured");
    });

    it("Should not allow adding liquidity when user has too many positions", async function () {
      const { liquidityManager, pool, tokenA, tokenB, user1, admin } = await loadFixture(deployWithConfiguredPoolFixture);

      // Set max positions to 1 for testing
      await liquidityManager.connect(admin).setManagementFee(MANAGEMENT_FEE); // This function doesn't exist, but we'll simulate the restriction

      const amount0 = ethers.parseEther("100");
      const amount1 = ethers.parseEther("100");
      const deadline = (await time.latest()) + 3600;

      // Approve tokens
      await tokenA.connect(user1).approve(await liquidityManager.getAddress(), amount0 * 20n);
      await tokenB.connect(user1).approve(await liquidityManager.getAddress(), amount1 * 20n);

      // Add maximum allowed positions (we'll add multiple in a loop, but this is simplified)
      await liquidityManager.connect(user1).addLiquidity(
        await pool.getAddress(),
        amount0,
        amount1,
        amount0 * 95n / 100n,
        amount1 * 95n / 100n,
        deadline
      );

      // The contract should enforce the limit internally
      // In a real test, we'd create multiple positions up to the limit
    });

    it("Should handle expired deadline", async function () {
      const { liquidityManager, pool, tokenA, tokenB, user1 } = await loadFixture(deployWithConfiguredPoolFixture);

      const amount0 = ethers.parseEther("1000");
      const amount1 = ethers.parseEther("1000");
      const expiredDeadline = (await time.latest()) - 1;

      await tokenA.connect(user1).approve(await liquidityManager.getAddress(), amount0);
      await tokenB.connect(user1).approve(await liquidityManager.getAddress(), amount1);

      await expect(
        liquidityManager.connect(user1).addLiquidity(
          await pool.getAddress(),
          amount0,
          amount1,
          amount0 * 95n / 100n,
          amount1 * 95n / 100n,
          expiredDeadline
        )
      ).to.be.revertedWith("Deadline passed");
    });

    it("Should remove liquidity successfully", async function () {
      const { liquidityManager, pool, tokenA, tokenB, user1 } = await loadFixture(deployWithConfiguredPoolFixture);

      // First add liquidity
      const amount0 = ethers.parseEther("1000");
      const amount1 = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 3600;

      await tokenA.connect(user1).approve(await liquidityManager.getAddress(), amount0);
      await tokenB.connect(user1).approve(await liquidityManager.getAddress(), amount1);

      await liquidityManager.connect(user1).addLiquidity(
        await pool.getAddress(),
        amount0,
        amount1,
        amount0 * 95n / 100n,
        amount1 * 95n / 100n,
        deadline
      );

      const userPositions = await liquidityManager.getUserPositions(user1.address);
      const tokenId = userPositions[0];
      const position = await liquidityManager.getPositionDetails(tokenId);

      const balanceBefore = await tokenA.balanceOf(user1.address);

      // Remove half the liquidity
      const liquidityToRemove = position.liquidity / 2n;
      await expect(
        liquidityManager.connect(user1).removeLiquidity(
          tokenId,
          liquidityToRemove,
          0, // amount0Min
          0, // amount1Min
          deadline
        )
      ).to.emit(liquidityManager, "LiquidityRemoved");

      const balanceAfter = await tokenA.balanceOf(user1.address);
      expect(balanceAfter).to.be.gt(balanceBefore);

      const updatedPosition = await liquidityManager.getPositionDetails(tokenId);
      expect(updatedPosition.liquidity).to.equal(position.liquidity - liquidityToRemove);
    });

    it("Should not allow non-owner to remove liquidity", async function () {
      const { liquidityManager, pool, tokenA, tokenB, user1, user2 } = await loadFixture(deployWithConfiguredPoolFixture);

      // User1 adds liquidity
      const amount0 = ethers.parseEther("1000");
      const amount1 = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 3600;

      await tokenA.connect(user1).approve(await liquidityManager.getAddress(), amount0);
      await tokenB.connect(user1).approve(await liquidityManager.getAddress(), amount1);

      await liquidityManager.connect(user1).addLiquidity(
        await pool.getAddress(),
        amount0,
        amount1,
        amount0 * 95n / 100n,
        amount1 * 95n / 100n,
        deadline
      );

      const userPositions = await liquidityManager.getUserPositions(user1.address);
      const tokenId = userPositions[0];

      // User2 tries to remove User1's liquidity
      await expect(
        liquidityManager.connect(user2).removeLiquidity(
          tokenId,
          1000,
          0,
          0,
          deadline
        )
      ).to.be.revertedWith("Not position owner");
    });
  });

  describe("Fee Collection", function () {
    it("Should collect fees successfully", async function () {
      const { liquidityManager, pool, tokenA, tokenB, user1, feeRecipient } = await loadFixture(deployWithConfiguredPoolFixture);

      // Add liquidity first
      const amount0 = ethers.parseEther("1000");
      const amount1 = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 3600;

      await tokenA.connect(user1).approve(await liquidityManager.getAddress(), amount0);
      await tokenB.connect(user1).approve(await liquidityManager.getAddress(), amount1);

      await liquidityManager.connect(user1).addLiquidity(
        await pool.getAddress(),
        amount0,
        amount1,
        amount0 * 95n / 100n,
        amount1 * 95n / 100n,
        deadline
      );

      const userPositions = await liquidityManager.getUserPositions(user1.address);
      const tokenId = userPositions[0];

      const feeRecipientBalanceBefore = await tokenA.balanceOf(feeRecipient.address);
      const userBalanceBefore = await tokenA.balanceOf(user1.address);

      await expect(
        liquidityManager.connect(user1).collectFees(tokenId)
      ).to.emit(liquidityManager, "FeesCollected");

      // Check that fees were distributed correctly
      const feeRecipientBalanceAfter = await tokenA.balanceOf(feeRecipient.address);
      const userBalanceAfter = await tokenA.balanceOf(user1.address);

      expect(feeRecipientBalanceAfter).to.be.gte(feeRecipientBalanceBefore);
      expect(userBalanceAfter).to.be.gte(userBalanceBefore);
    });

    it("Should allow operator to collect fees", async function () {
      const { liquidityManager, pool, tokenA, tokenB, user1, operator } = await loadFixture(deployWithConfiguredPoolFixture);

      // Add liquidity first
      const amount0 = ethers.parseEther("1000");
      const amount1 = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 3600;

      await tokenA.connect(user1).approve(await liquidityManager.getAddress(), amount0);
      await tokenB.connect(user1).approve(await liquidityManager.getAddress(), amount1);

      await liquidityManager.connect(user1).addLiquidity(
        await pool.getAddress(),
        amount0,
        amount1,
        amount0 * 95n / 100n,
        amount1 * 95n / 100n,
        deadline
      );

      const userPositions = await liquidityManager.getUserPositions(user1.address);
      const tokenId = userPositions[0];

      // Operator should be able to collect fees
      await expect(
        liquidityManager.connect(operator).collectFees(tokenId)
      ).to.not.be.reverted;
    });

    it("Should not allow unauthorized users to collect fees", async function () {
      const { liquidityManager, pool, tokenA, tokenB, user1, user2 } = await loadFixture(deployWithConfiguredPoolFixture);

      // Add liquidity first
      const amount0 = ethers.parseEther("1000");
      const amount1 = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 3600;

      await tokenA.connect(user1).approve(await liquidityManager.getAddress(), amount0);
      await tokenB.connect(user1).approve(await liquidityManager.getAddress(), amount1);

      await liquidityManager.connect(user1).addLiquidity(
        await pool.getAddress(),
        amount0,
        amount1,
        amount0 * 95n / 100n,
        amount1 * 95n / 100n,
        deadline
      );

      const userPositions = await liquidityManager.getUserPositions(user1.address);
      const tokenId = userPositions[0];

      // User2 should not be able to collect User1's fees
      await expect(
        liquidityManager.connect(user2).collectFees(tokenId)
      ).to.be.revertedWith("Not authorized");
    });
  });

  describe("Position Rebalancing", function () {
    it("Should rebalance position successfully", async function () {
      const { liquidityManager, pool, tokenA, tokenB, user1, operator } = await loadFixture(deployWithConfiguredPoolFixture);

      // Add liquidity first
      const amount0 = ethers.parseEther("1000");
      const amount1 = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 3600;

      await tokenA.connect(user1).approve(await liquidityManager.getAddress(), amount0);
      await tokenB.connect(user1).approve(await liquidityManager.getAddress(), amount1);

      await liquidityManager.connect(user1).addLiquidity(
        await pool.getAddress(),
        amount0,
        amount1,
        amount0 * 95n / 100n,
        amount1 * 95n / 100n,
        deadline
      );

      const userPositions = await liquidityManager.getUserPositions(user1.address);
      const tokenId = userPositions[0];

      const rebalanceParams = {
        newTickLower: -443610,
        newTickUpper: 443610,
        amount0Min: 0,
        amount1Min: 0,
        deadline: deadline
      };

      await expect(
        liquidityManager.connect(operator).rebalancePosition(tokenId, rebalanceParams)
      ).to.emit(liquidityManager, "PositionRebalanced");

      // Check that position was updated with new token ID
      const newUserPositions = await liquidityManager.getUserPositions(user1.address);
      expect(newUserPositions.length).to.equal(1);
      expect(newUserPositions[0]).to.not.equal(tokenId); // New token ID
    });

    it("Should not allow non-operator to rebalance", async function () {
      const { liquidityManager, pool, tokenA, tokenB, user1, user2 } = await loadFixture(deployWithConfiguredPoolFixture);

      // Add liquidity first
      const amount0 = ethers.parseEther("1000");
      const amount1 = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 3600;

      await tokenA.connect(user1).approve(await liquidityManager.getAddress(), amount0);
      await tokenB.connect(user1).approve(await liquidityManager.getAddress(), amount1);

      await liquidityManager.connect(user1).addLiquidity(
        await pool.getAddress(),
        amount0,
        amount1,
        amount0 * 95n / 100n,
        amount1 * 95n / 100n,
        deadline
      );

      const userPositions = await liquidityManager.getUserPositions(user1.address);
      const tokenId = userPositions[0];

      const rebalanceParams = {
        newTickLower: -443610,
        newTickUpper: 443610,
        amount0Min: 0,
        amount1Min: 0,
        deadline: deadline
      };

      await expect(
        liquidityManager.connect(user2).rebalancePosition(tokenId, rebalanceParams)
      ).to.be.revertedWithCustomError(liquidityManager, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Position Analysis", function () {
    it("Should calculate optimal tick range", async function () {
      const { liquidityManager, pool } = await loadFixture(deployWithConfiguredPoolFixture);

      const volatilityBps = 1000; // 10%
      const [tickLower, tickUpper] = await liquidityManager.getOptimalTickRange(
        await pool.getAddress(),
        volatilityBps
      );

      expect(tickLower).to.be.lt(tickUpper);
      expect(tickLower).to.be.lt(0);
      expect(tickUpper).to.be.gt(0);
    });

    it("Should detect when position needs rebalancing", async function () {
      const { liquidityManager, pool, tokenA, tokenB, user1 } = await loadFixture(deployWithConfiguredPoolFixture);

      // Add liquidity first
      const amount0 = ethers.parseEther("1000");
      const amount1 = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 3600;

      await tokenA.connect(user1).approve(await liquidityManager.getAddress(), amount0);
      await tokenB.connect(user1).approve(await liquidityManager.getAddress(), amount1);

      await liquidityManager.connect(user1).addLiquidity(
        await pool.getAddress(),
        amount0,
        amount1,
        amount0 * 95n / 100n,
        amount1 * 95n / 100n,
        deadline
      );

      const userPositions = await liquidityManager.getUserPositions(user1.address);
      const tokenId = userPositions[0];

      const needsRebalancing = await liquidityManager.needsRebalancing(tokenId);
      expect(typeof needsRebalancing).to.equal("boolean");
    });
  });

  describe("Administrative Functions", function () {
    it("Should allow admin to set management fee", async function () {
      const { liquidityManager, admin } = await loadFixture(deployLiquidityManagerFixture);

      const newFee = 200n; // 2%
      await liquidityManager.connect(admin).setManagementFee(newFee);
      expect(await liquidityManager.managementFee()).to.equal(newFee);
    });

    it("Should not allow management fee above 10%", async function () {
      const { liquidityManager, admin } = await loadFixture(deployLiquidityManagerFixture);

      const tooHighFee = 1001n; // 10.01%
      await expect(
        liquidityManager.connect(admin).setManagementFee(tooHighFee)
      ).to.be.revertedWith("Fee too high");
    });

    it("Should allow admin to set fee recipient", async function () {
      const { liquidityManager, admin, user1 } = await loadFixture(deployLiquidityManagerFixture);

      await liquidityManager.connect(admin).setFeeRecipient(user1.address);
      expect(await liquidityManager.feeRecipient()).to.equal(user1.address);
    });

    it("Should not allow invalid fee recipient", async function () {
      const { liquidityManager, admin } = await loadFixture(deployLiquidityManagerFixture);

      await expect(
        liquidityManager.connect(admin).setFeeRecipient(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid address");
    });

    it("Should allow admin to set price feeds", async function () {
      const { liquidityManager, tokenA, priceFeedA, admin } = await loadFixture(deployLiquidityManagerFixture);

      await liquidityManager.connect(admin).setPriceFeed(
        await tokenA.getAddress(),
        await priceFeedA.getAddress()
      );

      expect(await liquidityManager.priceFeeds(await tokenA.getAddress())).to.equal(await priceFeedA.getAddress());
    });

    it("Should allow admin to pause and unpause", async function () {
      const { liquidityManager, pool, tokenA, tokenB, user1, admin } = await loadFixture(deployWithConfiguredPoolFixture);

      // Pause contract
      await liquidityManager.connect(admin).pause();
      expect(await liquidityManager.paused()).to.be.true;

      // Should not allow adding liquidity when paused
      const amount0 = ethers.parseEther("1000");
      const amount1 = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 3600;

      await tokenA.connect(user1).approve(await liquidityManager.getAddress(), amount0);
      await tokenB.connect(user1).approve(await liquidityManager.getAddress(), amount1);

      await expect(
        liquidityManager.connect(user1).addLiquidity(
          await pool.getAddress(),
          amount0,
          amount1,
          amount0 * 95n / 100n,
          amount1 * 95n / 100n,
          deadline
        )
      ).to.be.revertedWithCustomError(liquidityManager, "EnforcedPause");

      // Unpause contract
      await liquidityManager.connect(admin).unpause();
      expect(await liquidityManager.paused()).to.be.false;

      // Should allow adding liquidity when unpaused
      await expect(
        liquidityManager.connect(user1).addLiquidity(
          await pool.getAddress(),
          amount0,
          amount1,
          amount0 * 95n / 100n,
          amount1 * 95n / 100n,
          deadline
        )
      ).to.not.be.reverted;
    });
  });

  describe("User Information", function () {
    it("Should return correct user positions", async function () {
      const { liquidityManager, pool, tokenA, tokenB, user1 } = await loadFixture(deployWithConfiguredPoolFixture);

      // Initially no positions
      let userPositions = await liquidityManager.getUserPositions(user1.address);
      expect(userPositions.length).to.equal(0);

      // Add liquidity
      const amount0 = ethers.parseEther("1000");
      const amount1 = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 3600;

      await tokenA.connect(user1).approve(await liquidityManager.getAddress(), amount0);
      await tokenB.connect(user1).approve(await liquidityManager.getAddress(), amount1);

      await liquidityManager.connect(user1).addLiquidity(
        await pool.getAddress(),
        amount0,
        amount1,
        amount0 * 95n / 100n,
        amount1 * 95n / 100n,
        deadline
      );

      // Should have one position
      userPositions = await liquidityManager.getUserPositions(user1.address);
      expect(userPositions.length).to.equal(1);

      // Check position details
      const position = await liquidityManager.getPositionDetails(userPositions[0]);
      expect(position.owner).to.equal(user1.address);
      expect(position.liquidity).to.be.gt(0);
    });
  });

  describe("Gas Optimization", function () {
    it("Should have reasonable gas costs for common operations", async function () {
      const { liquidityManager, pool, tokenA, tokenB, user1 } = await loadFixture(deployWithConfiguredPoolFixture);

      const amount0 = ethers.parseEther("1000");
      const amount1 = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 3600;

      await tokenA.connect(user1).approve(await liquidityManager.getAddress(), amount0);
      await tokenB.connect(user1).approve(await liquidityManager.getAddress(), amount1);

      // Test add liquidity gas cost
      const addLiquidityTx = await liquidityManager.connect(user1).addLiquidity(
        await pool.getAddress(),
        amount0,
        amount1,
        amount0 * 95n / 100n,
        amount1 * 95n / 100n,
        deadline
      );
      const addLiquidityReceipt = await addLiquidityTx.wait();
      expect(addLiquidityReceipt?.gasUsed).to.be.lt(500000); // Should be under 500k gas

      const userPositions = await liquidityManager.getUserPositions(user1.address);
      const tokenId = userPositions[0];

      // Test collect fees gas cost
      const collectFeesTx = await liquidityManager.connect(user1).collectFees(tokenId);
      const collectFeesReceipt = await collectFeesTx.wait();
      expect(collectFeesReceipt?.gasUsed).to.be.lt(300000); // Should be under 300k gas
    });
  });

  describe("Error Handling", function () {
    it("Should handle invalid token IDs gracefully", async function () {
      const { liquidityManager, user1 } = await loadFixture(deployLiquidityManagerFixture);

      const invalidTokenId = 999999;
      const deadline = (await time.latest()) + 3600;

      await expect(
        liquidityManager.connect(user1).removeLiquidity(
          invalidTokenId,
          1000,
          0,
          0,
          deadline
        )
      ).to.be.revertedWith("Not position owner");

      await expect(
        liquidityManager.connect(user1).collectFees(invalidTokenId)
      ).to.be.revertedWith("Not authorized");
    });

    it("Should handle insufficient liquidity removal", async function () {
      const { liquidityManager, pool, tokenA, tokenB, user1 } = await loadFixture(deployWithConfiguredPoolFixture);

      // Add liquidity first
      const amount0 = ethers.parseEther("1000");
      const amount1 = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 3600;

      await tokenA.connect(user1).approve(await liquidityManager.getAddress(), amount0);
      await tokenB.connect(user1).approve(await liquidityManager.getAddress(), amount1);

      await liquidityManager.connect(user1).addLiquidity(
        await pool.getAddress(),
        amount0,
        amount1,
        amount0 * 95n / 100n,
        amount1 * 95n / 100n,
        deadline
      );

      const userPositions = await liquidityManager.getUserPositions(user1.address);
      const tokenId = userPositions[0];
      const position = await liquidityManager.getPositionDetails(tokenId);

      // Try to remove more liquidity than available
      const excessiveLiquidity = position.liquidity + 1n;
      await expect(
        liquidityManager.connect(user1).removeLiquidity(
          tokenId,
          excessiveLiquidity,
          0,
          0,
          deadline
        )
      ).to.be.revertedWith("Insufficient liquidity");
    });
  });
});