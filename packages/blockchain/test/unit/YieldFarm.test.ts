import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Contract, Signer } from "ethers";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

describe("YieldFarm", function () {
  // Test constants
  const INITIAL_URN_PER_BLOCK = ethers.parseEther("10");
  const BONUS_MULTIPLIER = 10n;
  const SECONDS_PER_BLOCK = 12n; // Ethereum average block time
  const DAY_IN_SECONDS = 86400n;
  const EMERGENCY_WITHDRAW_FEE = 500n; // 5%

  async function deployYieldFarmFixture() {
    const [owner, admin, operator, user1, user2, user3, feeRecipient, treasury] = await ethers.getSigners();

    // Deploy UrnToken first
    const UrnTokenFactory = await ethers.getContractFactory("UrnToken");
    const urnToken = await upgrades.deployProxy(
      UrnTokenFactory,
      [
        "Urn Token",
        "URN",
        ethers.parseEther("1000000"), // 1M initial supply
        admin.address
      ],
      { initializer: "initialize" }
    );

    // Deploy mock ERC20 tokens for LP tokens
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const lpToken1 = await MockERC20Factory.deploy("LP Token 1", "LP1", ethers.parseEther("10000"));
    const lpToken2 = await MockERC20Factory.deploy("LP Token 2", "LP2", ethers.parseEther("10000"));

    // Deploy mock Chainlink price feeds
    const MockAggregatorFactory = await ethers.getContractFactory("MockAggregator");
    const priceFeed1 = await MockAggregatorFactory.deploy(8, ethers.parseUnits("1", 8)); // $1
    const priceFeed2 = await MockAggregatorFactory.deploy(8, ethers.parseUnits("2", 8)); // $2

    // Calculate start and end blocks
    const currentBlock = await ethers.provider.getBlockNumber();
    const startBlock = currentBlock + 10;
    const bonusEndBlock = startBlock + 100;

    // Deploy YieldFarm
    const YieldFarmFactory = await ethers.getContractFactory("YieldFarm");
    const yieldFarm = await upgrades.deployProxy(
      YieldFarmFactory,
      [
        await urnToken.getAddress(),
        INITIAL_URN_PER_BLOCK,
        startBlock,
        bonusEndBlock,
        admin.address,
        feeRecipient.address
      ],
      { initializer: "initialize" }
    );

    // Grant minter role to YieldFarm
    await urnToken.connect(admin).grantRole(await urnToken.MINTER_ROLE(), await yieldFarm.getAddress());

    // Distribute LP tokens to users
    await lpToken1.transfer(user1.address, ethers.parseEther("1000"));
    await lpToken1.transfer(user2.address, ethers.parseEther("1000"));
    await lpToken1.transfer(user3.address, ethers.parseEther("1000"));
    
    await lpToken2.transfer(user1.address, ethers.parseEther("1000"));
    await lpToken2.transfer(user2.address, ethers.parseEther("1000"));
    await lpToken2.transfer(user3.address, ethers.parseEther("1000"));

    return {
      yieldFarm,
      urnToken,
      lpToken1,
      lpToken2,
      priceFeed1,
      priceFeed2,
      owner,
      admin,
      operator,
      user1,
      user2,
      user3,
      feeRecipient,
      treasury,
      startBlock,
      bonusEndBlock
    };
  }

  async function deployWithPoolsFixture() {
    const fixture = await loadFixture(deployYieldFarmFixture);
    const { yieldFarm, lpToken1, lpToken2, priceFeed1, priceFeed2, admin } = fixture;

    // Add pools
    await yieldFarm.connect(admin).addPool(
      1000, // allocPoint
      await lpToken1.getAddress(),
      30 * 24 * 60 * 60, // 30 days lock period
      "ETH-USDC LP",
      await priceFeed1.getAddress(),
      false
    );

    await yieldFarm.connect(admin).addPool(
      500, // allocPoint
      await lpToken2.getAddress(),
      90 * 24 * 60 * 60, // 90 days lock period
      "URN-ETH LP",
      await priceFeed2.getAddress(),
      false
    );

    return fixture;
  }

  describe("Deployment", function () {
    it("Should deploy with correct initial parameters", async function () {
      const { yieldFarm, urnToken, admin, feeRecipient, startBlock, bonusEndBlock } = await loadFixture(deployYieldFarmFixture);

      expect(await yieldFarm.urnToken()).to.equal(await urnToken.getAddress());
      expect(await yieldFarm.urnPerBlock()).to.equal(INITIAL_URN_PER_BLOCK);
      expect(await yieldFarm.startBlock()).to.equal(startBlock);
      expect(await yieldFarm.bonusEndBlock()).to.equal(bonusEndBlock);
      expect(await yieldFarm.feeRecipient()).to.equal(feeRecipient.address);
      expect(await yieldFarm.emergencyWithdrawFee()).to.equal(EMERGENCY_WITHDRAW_FEE);
    });

    it("Should grant correct roles to admin", async function () {
      const { yieldFarm, admin } = await loadFixture(deployYieldFarmFixture);

      const adminRole = await yieldFarm.ADMIN_ROLE();
      const operatorRole = await yieldFarm.OPERATOR_ROLE();
      const upgraderRole = await yieldFarm.UPGRADER_ROLE();

      expect(await yieldFarm.hasRole(adminRole, admin.address)).to.be.true;
      expect(await yieldFarm.hasRole(operatorRole, admin.address)).to.be.true;
      expect(await yieldFarm.hasRole(upgraderRole, admin.address)).to.be.true;
    });

    it("Should have default reward multipliers", async function () {
      const { yieldFarm } = await loadFixture(deployYieldFarmFixture);

      const multiplier30Days = await yieldFarm.rewardMultipliers(0);
      const multiplier90Days = await yieldFarm.rewardMultipliers(1);
      const multiplier365Days = await yieldFarm.rewardMultipliers(3);

      expect(multiplier30Days.lockPeriod).to.equal(30n * DAY_IN_SECONDS);
      expect(multiplier30Days.multiplier).to.equal(10000); // 1x
      expect(multiplier90Days.multiplier).to.equal(12500); // 1.25x
      expect(multiplier365Days.multiplier).to.equal(20000); // 2x
    });

    it("Should revert with invalid parameters", async function () {
      const [admin, feeRecipient] = await ethers.getSigners();
      const UrnTokenFactory = await ethers.getContractFactory("UrnToken");
      const urnToken = await upgrades.deployProxy(
        UrnTokenFactory,
        ["Urn Token", "URN", ethers.parseEther("1000000"), admin.address],
        { initializer: "initialize" }
      );

      const YieldFarmFactory = await ethers.getContractFactory("YieldFarm");
      const currentBlock = await ethers.provider.getBlockNumber();

      // Invalid URN token
      await expect(
        upgrades.deployProxy(
          YieldFarmFactory,
          [
            ethers.ZeroAddress,
            INITIAL_URN_PER_BLOCK,
            currentBlock + 10,
            currentBlock + 100,
            admin.address,
            feeRecipient.address
          ],
          { initializer: "initialize" }
        )
      ).to.be.revertedWith("Invalid URN token");

      // Emission rate too high
      await expect(
        upgrades.deployProxy(
          YieldFarmFactory,
          [
            await urnToken.getAddress(),
            ethers.parseEther("1001"), // Above MAX_EMISSION_RATE
            currentBlock + 10,
            currentBlock + 100,
            admin.address,
            feeRecipient.address
          ],
          { initializer: "initialize" }
        )
      ).to.be.revertedWith("Emission rate too high");
    });
  });

  describe("Pool Management", function () {
    it("Should add pool correctly", async function () {
      const { yieldFarm, lpToken1, priceFeed1, admin } = await loadFixture(deployYieldFarmFixture);

      await expect(
        yieldFarm.connect(admin).addPool(
          1000,
          await lpToken1.getAddress(),
          30 * 24 * 60 * 60,
          "ETH-USDC LP",
          await priceFeed1.getAddress(),
          false
        )
      ).to.emit(yieldFarm, "PoolAdded")
        .withArgs(0, await lpToken1.getAddress(), 1000, 30 * 24 * 60 * 60, "ETH-USDC LP");

      const poolInfo = await yieldFarm.poolInfo(0);
      expect(poolInfo.lpToken).to.equal(await lpToken1.getAddress());
      expect(poolInfo.allocPoint).to.equal(1000);
      expect(poolInfo.isActive).to.be.true;
      expect(poolInfo.name).to.equal("ETH-USDC LP");
      expect(await yieldFarm.totalAllocPoint()).to.equal(1000);
    });

    it("Should not allow non-admin to add pools", async function () {
      const { yieldFarm, lpToken1, priceFeed1, user1 } = await loadFixture(deployYieldFarmFixture);

      await expect(
        yieldFarm.connect(user1).addPool(
          1000,
          await lpToken1.getAddress(),
          30 * 24 * 60 * 60,
          "ETH-USDC LP",
          await priceFeed1.getAddress(),
          false
        )
      ).to.be.revertedWithCustomError(yieldFarm, "AccessControlUnauthorizedAccount");
    });

    it("Should not allow duplicate LP tokens", async function () {
      const { yieldFarm, lpToken1, priceFeed1, admin } = await loadFixture(deployYieldFarmFixture);

      await yieldFarm.connect(admin).addPool(
        1000,
        await lpToken1.getAddress(),
        30 * 24 * 60 * 60,
        "ETH-USDC LP",
        await priceFeed1.getAddress(),
        false
      );

      await expect(
        yieldFarm.connect(admin).addPool(
          500,
          await lpToken1.getAddress(),
          60 * 24 * 60 * 60,
          "Duplicate LP",
          await priceFeed1.getAddress(),
          false
        )
      ).to.be.revertedWith("LP token already exists");
    });

    it("Should update pool correctly", async function () {
      const { yieldFarm, admin } = await loadFixture(deployWithPoolsFixture);

      await expect(
        yieldFarm.connect(admin).updatePool(
          0, // pid
          2000, // new allocPoint
          60 * 24 * 60 * 60, // new lock period
          false, // deactivate
          false
        )
      ).to.emit(yieldFarm, "PoolUpdated")
        .withArgs(0, 2000, false);

      const poolInfo = await yieldFarm.poolInfo(0);
      expect(poolInfo.allocPoint).to.equal(2000);
      expect(poolInfo.lockPeriod).to.equal(60 * 24 * 60 * 60);
      expect(poolInfo.isActive).to.be.false;
    });

    it("Should return correct pool length", async function () {
      const { yieldFarm } = await loadFixture(deployWithPoolsFixture);
      expect(await yieldFarm.poolLength()).to.equal(2);
    });
  });

  describe("Staking Operations", function () {
    it("Should allow users to deposit LP tokens", async function () {
      const { yieldFarm, lpToken1, user1 } = await loadFixture(deployWithPoolsFixture);

      const depositAmount = ethers.parseEther("100");
      const lockPeriod = 30 * 24 * 60 * 60; // 30 days

      // Approve LP tokens
      await lpToken1.connect(user1).approve(await yieldFarm.getAddress(), depositAmount);

      await expect(
        yieldFarm.connect(user1).deposit(0, depositAmount, lockPeriod)
      ).to.emit(yieldFarm, "Deposit")
        .withArgs(user1.address, 0, depositAmount, lockPeriod);

      const userInfo = await yieldFarm.userInfo(0, user1.address);
      expect(userInfo.amount).to.equal(depositAmount);
      expect(userInfo.multiplier).to.equal(10000); // 1x for 30 days

      const poolInfo = await yieldFarm.poolInfo(0);
      expect(poolInfo.totalStaked).to.equal(depositAmount);
    });

    it("Should require minimum lock period", async function () {
      const { yieldFarm, lpToken1, user1 } = await loadFixture(deployWithPoolsFixture);

      const depositAmount = ethers.parseEther("100");
      const shortLockPeriod = 15 * 24 * 60 * 60; // 15 days (less than required 30)

      await lpToken1.connect(user1).approve(await yieldFarm.getAddress(), depositAmount);

      await expect(
        yieldFarm.connect(user1).deposit(0, depositAmount, shortLockPeriod)
      ).to.be.revertedWith("Lock period too short");
    });

    it("Should apply correct multipliers for different lock periods", async function () {
      const { yieldFarm, lpToken1, user1, user2, user3 } = await loadFixture(deployWithPoolsFixture);

      const depositAmount = ethers.parseEther("100");

      // User1: 30 days (1x multiplier)
      await lpToken1.connect(user1).approve(await yieldFarm.getAddress(), depositAmount);
      await yieldFarm.connect(user1).deposit(0, depositAmount, 30 * 24 * 60 * 60);
      let userInfo = await yieldFarm.userInfo(0, user1.address);
      expect(userInfo.multiplier).to.equal(10000); // 1x

      // User2: 90 days (1.25x multiplier)
      await lpToken1.connect(user2).approve(await yieldFarm.getAddress(), depositAmount);
      await yieldFarm.connect(user2).deposit(0, depositAmount, 90 * 24 * 60 * 60);
      userInfo = await yieldFarm.userInfo(0, user2.address);
      expect(userInfo.multiplier).to.equal(12500); // 1.25x

      // User3: 365 days (2x multiplier)
      await lpToken1.connect(user3).approve(await yieldFarm.getAddress(), depositAmount);
      await yieldFarm.connect(user3).deposit(0, depositAmount, 365 * 24 * 60 * 60);
      userInfo = await yieldFarm.userInfo(0, user3.address);
      expect(userInfo.multiplier).to.equal(20000); // 2x
    });

    it("Should not allow deposit when pool is inactive", async function () {
      const { yieldFarm, lpToken1, user1, admin } = await loadFixture(deployWithPoolsFixture);

      // Deactivate pool
      await yieldFarm.connect(admin).updatePool(0, 1000, 30 * 24 * 60 * 60, false, false);

      const depositAmount = ethers.parseEther("100");
      await lpToken1.connect(user1).approve(await yieldFarm.getAddress(), depositAmount);

      await expect(
        yieldFarm.connect(user1).deposit(0, depositAmount, 30 * 24 * 60 * 60)
      ).to.be.revertedWith("Pool not active");
    });
  });

  describe("Reward Calculations", function () {
    it("Should calculate pending rewards correctly", async function () {
      const { yieldFarm, lpToken1, user1, startBlock } = await loadFixture(deployWithPoolsFixture);

      const depositAmount = ethers.parseEther("100");
      await lpToken1.connect(user1).approve(await yieldFarm.getAddress(), depositAmount);
      await yieldFarm.connect(user1).deposit(0, depositAmount, 30 * 24 * 60 * 60);

      // Mine some blocks to accumulate rewards
      await time.advanceBlockTo(startBlock + 10);
      await yieldFarm.updatePoolRewards(0);

      const pendingRewards = await yieldFarm.pendingUrn(0, user1.address);
      expect(pendingRewards).to.be.gt(0);
    });

    it("Should calculate multiplier correctly during bonus period", async function () {
      const { yieldFarm, startBlock, bonusEndBlock } = await loadFixture(deployWithPoolsFixture);

      // Test multiplier during bonus period
      const multiplierBonus = await yieldFarm.getMultiplier(startBlock, startBlock + 10);
      expect(multiplierBonus).to.equal(10 * BONUS_MULTIPLIER); // 10 blocks * 10x bonus

      // Test multiplier after bonus period
      const multiplierNormal = await yieldFarm.getMultiplier(bonusEndBlock + 1, bonusEndBlock + 11);
      expect(multiplierNormal).to.equal(10); // 10 blocks * 1x normal

      // Test multiplier spanning bonus period
      const multiplierSpanning = await yieldFarm.getMultiplier(bonusEndBlock - 5, bonusEndBlock + 5);
      const expectedSpanning = 5 * BONUS_MULTIPLIER + 5; // 5 bonus blocks + 5 normal blocks
      expect(multiplierSpanning).to.equal(expectedSpanning);
    });

    it("Should distribute rewards proportionally among pools", async function () {
      const { yieldFarm, lpToken1, lpToken2, user1, user2, startBlock } = await loadFixture(deployWithPoolsFixture);

      const depositAmount = ethers.parseEther("100");

      // User1 deposits in pool 0 (allocPoint: 1000)
      await lpToken1.connect(user1).approve(await yieldFarm.getAddress(), depositAmount);
      await yieldFarm.connect(user1).deposit(0, depositAmount, 30 * 24 * 60 * 60);

      // User2 deposits in pool 1 (allocPoint: 500)
      await lpToken2.connect(user2).approve(await yieldFarm.getAddress(), depositAmount);
      await yieldFarm.connect(user2).deposit(1, depositAmount, 90 * 24 * 60 * 60);

      // Mine blocks to accumulate rewards
      await time.advanceBlockTo(startBlock + 20);
      await yieldFarm.massUpdatePools();

      const pendingRewards1 = await yieldFarm.pendingUrn(0, user1.address);
      const pendingRewards2 = await yieldFarm.pendingUrn(1, user2.address);

      // Pool 0 should get 2/3 of rewards (1000/(1000+500))
      // Pool 1 should get 1/3 of rewards (500/(1000+500))
      // But user2 has 1.25x multiplier, so effective rewards might be different
      expect(pendingRewards1).to.be.gt(0);
      expect(pendingRewards2).to.be.gt(0);
    });
  });

  describe("Withdrawal Operations", function () {
    it("Should allow withdrawal after lock period", async function () {
      const { yieldFarm, lpToken1, user1, startBlock } = await loadFixture(deployWithPoolsFixture);

      const depositAmount = ethers.parseEther("100");
      await lpToken1.connect(user1).approve(await yieldFarm.getAddress(), depositAmount);
      await yieldFarm.connect(user1).deposit(0, depositAmount, 30 * 24 * 60 * 60);

      // Fast forward past lock period
      await time.increase(31 * 24 * 60 * 60);
      await time.advanceBlockTo(startBlock + 50);

      const balanceBefore = await lpToken1.balanceOf(user1.address);
      
      await expect(
        yieldFarm.connect(user1).withdraw(0, depositAmount)
      ).to.emit(yieldFarm, "Withdraw")
        .withArgs(user1.address, 0, depositAmount)
        .and.to.emit(yieldFarm, "RewardsClaimed");

      const balanceAfter = await lpToken1.balanceOf(user1.address);
      expect(balanceAfter - balanceBefore).to.equal(depositAmount);

      const userInfo = await yieldFarm.userInfo(0, user1.address);
      expect(userInfo.amount).to.equal(0);
    });

    it("Should not allow withdrawal during lock period", async function () {
      const { yieldFarm, lpToken1, user1 } = await loadFixture(deployWithPoolsFixture);

      const depositAmount = ethers.parseEther("100");
      await lpToken1.connect(user1).approve(await yieldFarm.getAddress(), depositAmount);
      await yieldFarm.connect(user1).deposit(0, depositAmount, 30 * 24 * 60 * 60);

      await expect(
        yieldFarm.connect(user1).withdraw(0, depositAmount)
      ).to.be.revertedWith("Tokens still locked");
    });

    it("Should allow partial withdrawal", async function () {
      const { yieldFarm, lpToken1, user1 } = await loadFixture(deployWithPoolsFixture);

      const depositAmount = ethers.parseEther("100");
      const withdrawAmount = ethers.parseEther("30");

      await lpToken1.connect(user1).approve(await yieldFarm.getAddress(), depositAmount);
      await yieldFarm.connect(user1).deposit(0, depositAmount, 30 * 24 * 60 * 60);

      // Fast forward past lock period
      await time.increase(31 * 24 * 60 * 60);

      await yieldFarm.connect(user1).withdraw(0, withdrawAmount);

      const userInfo = await yieldFarm.userInfo(0, user1.address);
      expect(userInfo.amount).to.equal(depositAmount - withdrawAmount);
    });
  });

  describe("Emergency Withdrawal", function () {
    it("Should allow emergency withdrawal with fee", async function () {
      const { yieldFarm, lpToken1, user1, feeRecipient } = await loadFixture(deployWithPoolsFixture);

      const depositAmount = ethers.parseEther("100");
      await lpToken1.connect(user1).approve(await yieldFarm.getAddress(), depositAmount);
      await yieldFarm.connect(user1).deposit(0, depositAmount, 30 * 24 * 60 * 60);

      const feeRecipientBalanceBefore = await lpToken1.balanceOf(feeRecipient.address);
      const userBalanceBefore = await lpToken1.balanceOf(user1.address);

      const expectedFee = (depositAmount * EMERGENCY_WITHDRAW_FEE) / 10000n;
      const expectedAmount = depositAmount - expectedFee;

      await expect(
        yieldFarm.connect(user1).emergencyWithdraw(0)
      ).to.emit(yieldFarm, "EmergencyWithdraw")
        .withArgs(user1.address, 0, expectedAmount, expectedFee);

      const feeRecipientBalanceAfter = await lpToken1.balanceOf(feeRecipient.address);
      const userBalanceAfter = await lpToken1.balanceOf(user1.address);

      expect(feeRecipientBalanceAfter - feeRecipientBalanceBefore).to.equal(expectedFee);
      expect(userBalanceAfter - userBalanceBefore).to.equal(expectedAmount);

      const userInfo = await yieldFarm.userInfo(0, user1.address);
      expect(userInfo.amount).to.equal(0);
    });
  });

  describe("Reward Claiming", function () {
    it("Should allow claiming rewards without withdrawal", async function () {
      const { yieldFarm, urnToken, lpToken1, user1, startBlock } = await loadFixture(deployWithPoolsFixture);

      const depositAmount = ethers.parseEther("100");
      await lpToken1.connect(user1).approve(await yieldFarm.getAddress(), depositAmount);
      await yieldFarm.connect(user1).deposit(0, depositAmount, 30 * 24 * 60 * 60);

      // Mine blocks to accumulate rewards
      await time.advanceBlockTo(startBlock + 20);

      const balanceBefore = await urnToken.balanceOf(user1.address);
      const pendingBefore = await yieldFarm.pendingUrn(0, user1.address);

      await expect(
        yieldFarm.connect(user1).claimRewards(0)
      ).to.emit(yieldFarm, "RewardsClaimed")
        .withArgs(user1.address, 0, anyValue);

      const balanceAfter = await urnToken.balanceOf(user1.address);
      expect(balanceAfter - balanceBefore).to.be.gt(0);
      expect(balanceAfter - balanceBefore).to.equal(pendingBefore);

      // User should still have staked tokens
      const userInfo = await yieldFarm.userInfo(0, user1.address);
      expect(userInfo.amount).to.equal(depositAmount);
    });
  });

  describe("Administrative Functions", function () {
    it("Should allow admin to update emission rate", async function () {
      const { yieldFarm, admin } = await loadFixture(deployWithPoolsFixture);

      const newRate = ethers.parseEther("5");
      
      await expect(
        yieldFarm.connect(admin).updateEmissionRate(newRate)
      ).to.emit(yieldFarm, "EmissionRateUpdated")
        .withArgs(INITIAL_URN_PER_BLOCK, newRate);

      expect(await yieldFarm.urnPerBlock()).to.equal(newRate);
    });

    it("Should not allow emission rate above maximum", async function () {
      const { yieldFarm, admin } = await loadFixture(deployWithPoolsFixture);

      const tooHighRate = ethers.parseEther("1001"); // Above MAX_EMISSION_RATE

      await expect(
        yieldFarm.connect(admin).updateEmissionRate(tooHighRate)
      ).to.be.revertedWith("Emission rate too high");
    });

    it("Should allow admin to update emergency withdraw fee", async function () {
      const { yieldFarm, admin } = await loadFixture(deployWithPoolsFixture);

      const newFee = 1000n; // 10%
      await yieldFarm.connect(admin).updateEmergencyWithdrawFee(newFee);
      expect(await yieldFarm.emergencyWithdrawFee()).to.equal(newFee);
    });

    it("Should not allow emergency withdraw fee above 20%", async function () {
      const { yieldFarm, admin } = await loadFixture(deployWithPoolsFixture);

      const tooHighFee = 2001n; // 20.01%

      await expect(
        yieldFarm.connect(admin).updateEmergencyWithdrawFee(tooHighFee)
      ).to.be.revertedWith("Fee too high");
    });

    it("Should allow admin to pause and unpause", async function () {
      const { yieldFarm, lpToken1, user1, admin } = await loadFixture(deployWithPoolsFixture);

      // Pause contract
      await yieldFarm.connect(admin).pause();
      expect(await yieldFarm.paused()).to.be.true;

      // Should not allow deposits when paused
      const depositAmount = ethers.parseEther("100");
      await lpToken1.connect(user1).approve(await yieldFarm.getAddress(), depositAmount);

      await expect(
        yieldFarm.connect(user1).deposit(0, depositAmount, 30 * 24 * 60 * 60)
      ).to.be.revertedWithCustomError(yieldFarm, "EnforcedPause");

      // Unpause contract
      await yieldFarm.connect(admin).unpause();
      expect(await yieldFarm.paused()).to.be.false;

      // Should allow deposits when unpaused
      await expect(
        yieldFarm.connect(user1).deposit(0, depositAmount, 30 * 24 * 60 * 60)
      ).to.not.be.reverted;
    });
  });

  describe("Pool APR Calculation", function () {
    it("Should calculate APR correctly", async function () {
      const { yieldFarm, lpToken1, user1 } = await loadFixture(deployWithPoolsFixture);

      const depositAmount = ethers.parseEther("1000");
      await lpToken1.connect(user1).approve(await yieldFarm.getAddress(), depositAmount);
      await yieldFarm.connect(user1).deposit(0, depositAmount, 30 * 24 * 60 * 60);

      const apr = await yieldFarm.getPoolAPR(0);
      expect(apr).to.be.gt(0);
    });

    it("Should return 0 APR for empty pool", async function () {
      const { yieldFarm } = await loadFixture(deployWithPoolsFixture);

      const apr = await yieldFarm.getPoolAPR(0);
      expect(apr).to.equal(0);
    });
  });

  describe("User Information", function () {
    it("Should return user info for all pools", async function () {
      const { yieldFarm, lpToken1, lpToken2, user1 } = await loadFixture(deployWithPoolsFixture);

      const depositAmount = ethers.parseEther("100");

      // Deposit in both pools
      await lpToken1.connect(user1).approve(await yieldFarm.getAddress(), depositAmount);
      await yieldFarm.connect(user1).deposit(0, depositAmount, 30 * 24 * 60 * 60);

      await lpToken2.connect(user1).approve(await yieldFarm.getAddress(), depositAmount);
      await yieldFarm.connect(user1).deposit(1, depositAmount, 90 * 24 * 60 * 60);

      const userInfos = await yieldFarm.getUserInfo(user1.address);
      expect(userInfos).to.have.lengthOf(2);
      expect(userInfos[0].amount).to.equal(depositAmount);
      expect(userInfos[1].amount).to.equal(depositAmount);
    });
  });

  describe("Gas Optimization", function () {
    it("Should have reasonable gas costs for common operations", async function () {
      const { yieldFarm, lpToken1, user1 } = await loadFixture(deployWithPoolsFixture);

      const depositAmount = ethers.parseEther("100");
      await lpToken1.connect(user1).approve(await yieldFarm.getAddress(), depositAmount);

      // Test deposit gas cost
      const depositTx = await yieldFarm.connect(user1).deposit(0, depositAmount, 30 * 24 * 60 * 60);
      const depositReceipt = await depositTx.wait();
      expect(depositReceipt?.gasUsed).to.be.lt(300000); // Should be under 300k gas

      // Fast forward and test claim gas cost
      await time.increase(31 * 24 * 60 * 60);
      const claimTx = await yieldFarm.connect(user1).claimRewards(0);
      const claimReceipt = await claimTx.wait();
      expect(claimReceipt?.gasUsed).to.be.lt(200000); // Should be under 200k gas
    });
  });
});

// Mock contracts for testing
contract MockERC20 {
  string public name;
  string public symbol;
  uint8 public decimals = 18;
  uint256 public totalSupply;
  mapping(address => uint256) public balanceOf;
  mapping(address => mapping(address => uint256)) public allowance;

  constructor(string memory _name, string memory _symbol, uint256 _totalSupply) {
    name = _name;
    symbol = _symbol;
    totalSupply = _totalSupply;
    balanceOf[msg.sender] = _totalSupply;
  }

  function transfer(address to, uint256 amount) external returns (bool) {
    balanceOf[msg.sender] -= amount;
    balanceOf[to] += amount;
    return true;
  }

  function approve(address spender, uint256 amount) external returns (bool) {
    allowance[msg.sender][spender] = amount;
    return true;
  }

  function transferFrom(address from, address to, uint256 amount) external returns (bool) {
    allowance[from][msg.sender] -= amount;
    balanceOf[from] -= amount;
    balanceOf[to] += amount;
    return true;
  }
}

contract MockAggregator {
  uint8 public decimals;
  int256 public latestAnswer;

  constructor(uint8 _decimals, int256 _initialAnswer) {
    decimals = _decimals;
    latestAnswer = _initialAnswer;
  }

  function latestRoundData()
    external
    view
    returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
  {
    return (1, latestAnswer, block.timestamp, block.timestamp, 1);
  }
}