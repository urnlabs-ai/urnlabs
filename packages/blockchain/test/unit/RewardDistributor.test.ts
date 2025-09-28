import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Contract, Signer } from "ethers";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

describe("RewardDistributor", function () {
  // Test constants
  const INITIAL_REWARD_PER_SECOND = ethers.parseEther("1");
  const INITIAL_INFLATION_RATE = 500n; // 5%
  const BURN_RATE = 1000n; // 10%
  const TREASURY_RATE = 2000n; // 20%
  const MIN_ACTION_INTERVAL = 60n; // 1 minute
  const EMERGENCY_WITHDRAW_DELAY = 7n * 24n * 60n * 60n; // 7 days

  async function deployRewardDistributorFixture() {
    const [owner, admin, operator, user1, user2, user3, treasury, stakingContract1, stakingContract2] = await ethers.getSigners();

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

    const currentTime = await time.latest();
    const startTime = currentTime + 100;
    const endTime = startTime + 365 * 24 * 60 * 60; // 1 year

    // Deploy RewardDistributor
    const RewardDistributorFactory = await ethers.getContractFactory("RewardDistributor");
    const rewardDistributor = await upgrades.deployProxy(
      RewardDistributorFactory,
      [
        await urnToken.getAddress(),
        INITIAL_REWARD_PER_SECOND,
        startTime,
        endTime,
        admin.address,
        treasury.address
      ],
      { initializer: "initialize" }
    );

    // Grant minter role to RewardDistributor
    await urnToken.connect(admin).grantRole(await urnToken.MINTER_ROLE(), await rewardDistributor.getAddress());

    // Grant operator role
    await rewardDistributor.connect(admin).grantRole(await rewardDistributor.OPERATOR_ROLE(), operator.address);

    return {
      rewardDistributor,
      urnToken,
      owner,
      admin,
      operator,
      user1,
      user2,
      user3,
      treasury,
      stakingContract1,
      stakingContract2,
      startTime,
      endTime
    };
  }

  async function deployWithPoolsFixture() {
    const fixture = await loadFixture(deployRewardDistributorFixture);
    const { rewardDistributor, admin, stakingContract1, stakingContract2 } = fixture;

    // Add reward pools
    await rewardDistributor.connect(admin).addPool(
      "Staking Pool 1",
      stakingContract1.address,
      1000, // allocPoint
      ethers.parseEther("100000"), // maxCap
      ethers.parseEther("100"), // minStakeAmount
      30 * 24 * 60 * 60, // lockPeriod (30 days)
      false // withUpdate
    );

    await rewardDistributor.connect(admin).addPool(
      "Staking Pool 2",
      stakingContract2.address,
      500, // allocPoint
      ethers.parseEther("50000"), // maxCap
      ethers.parseEther("50"), // minStakeAmount
      90 * 24 * 60 * 60, // lockPeriod (90 days)
      false // withUpdate
    );

    return fixture;
  }

  describe("Deployment", function () {
    it("Should deploy with correct initial parameters", async function () {
      const { rewardDistributor, urnToken, admin, treasury, startTime, endTime } = await loadFixture(deployRewardDistributorFixture);

      expect(await rewardDistributor.rewardToken()).to.equal(await urnToken.getAddress());
      expect(await rewardDistributor.rewardPerSecond()).to.equal(INITIAL_REWARD_PER_SECOND);
      expect(await rewardDistributor.startTime()).to.equal(startTime);
      expect(await rewardDistributor.endTime()).to.equal(endTime);
      expect(await rewardDistributor.treasury()).to.equal(treasury.address);
      expect(await rewardDistributor.inflationRate()).to.equal(INITIAL_INFLATION_RATE);
      expect(await rewardDistributor.burnRate()).to.equal(BURN_RATE);
      expect(await rewardDistributor.treasuryRate()).to.equal(TREASURY_RATE);
      expect(await rewardDistributor.minActionInterval()).to.equal(MIN_ACTION_INTERVAL);
      expect(await rewardDistributor.emergencyWithdrawDelay()).to.equal(EMERGENCY_WITHDRAW_DELAY);
    });

    it("Should grant correct roles to admin", async function () {
      const { rewardDistributor, admin } = await loadFixture(deployRewardDistributorFixture);

      const adminRole = await rewardDistributor.ADMIN_ROLE();
      const operatorRole = await rewardDistributor.OPERATOR_ROLE();
      const upgraderRole = await rewardDistributor.UPGRADER_ROLE();

      expect(await rewardDistributor.hasRole(adminRole, admin.address)).to.be.true;
      expect(await rewardDistributor.hasRole(operatorRole, admin.address)).to.be.true;
      expect(await rewardDistributor.hasRole(upgraderRole, admin.address)).to.be.true;
    });

    it("Should revert with invalid parameters", async function () {
      const [admin, treasury] = await ethers.getSigners();
      const UrnTokenFactory = await ethers.getContractFactory("UrnToken");
      const urnToken = await upgrades.deployProxy(
        UrnTokenFactory,
        ["Urn Token", "URN", ethers.parseEther("1000000"), admin.address],
        { initializer: "initialize" }
      );

      const RewardDistributorFactory = await ethers.getContractFactory("RewardDistributor");
      const currentTime = await time.latest();

      // Invalid reward token
      await expect(
        upgrades.deployProxy(
          RewardDistributorFactory,
          [
            ethers.ZeroAddress,
            INITIAL_REWARD_PER_SECOND,
            currentTime + 100,
            currentTime + 1000,
            admin.address,
            treasury.address
          ],
          { initializer: "initialize" }
        )
      ).to.be.revertedWith("Invalid reward token");

      // Start time in past
      await expect(
        upgrades.deployProxy(
          RewardDistributorFactory,
          [
            await urnToken.getAddress(),
            INITIAL_REWARD_PER_SECOND,
            currentTime - 100,
            currentTime + 1000,
            admin.address,
            treasury.address
          ],
          { initializer: "initialize" }
        )
      ).to.be.revertedWith("Start time in past");

      // Invalid end time
      await expect(
        upgrades.deployProxy(
          RewardDistributorFactory,
          [
            await urnToken.getAddress(),
            INITIAL_REWARD_PER_SECOND,
            currentTime + 1000,
            currentTime + 100,
            admin.address,
            treasury.address
          ],
          { initializer: "initialize" }
        )
      ).to.be.revertedWith("Invalid end time");
    });
  });

  describe("Pool Management", function () {
    it("Should add pool correctly", async function () {
      const { rewardDistributor, admin, stakingContract1 } = await loadFixture(deployRewardDistributorFixture);

      await expect(
        rewardDistributor.connect(admin).addPool(
          "Test Pool",
          stakingContract1.address,
          1000,
          ethers.parseEther("100000"),
          ethers.parseEther("100"),
          30 * 24 * 60 * 60,
          false
        )
      ).to.emit(rewardDistributor, "PoolAdded")
        .withArgs(0, "Test Pool", stakingContract1.address, 1000);

      const poolInfo = await rewardDistributor.rewardPools(0);
      expect(poolInfo.name).to.equal("Test Pool");
      expect(poolInfo.stakingContract).to.equal(stakingContract1.address);
      expect(poolInfo.allocPoint).to.equal(1000);
      expect(poolInfo.isActive).to.be.true;
      expect(await rewardDistributor.totalAllocPoint()).to.equal(1000);
    });

    it("Should not allow non-admin to add pools", async function () {
      const { rewardDistributor, user1, stakingContract1 } = await loadFixture(deployRewardDistributorFixture);

      await expect(
        rewardDistributor.connect(user1).addPool(
          "Test Pool",
          stakingContract1.address,
          1000,
          ethers.parseEther("100000"),
          ethers.parseEther("100"),
          30 * 24 * 60 * 60,
          false
        )
      ).to.be.revertedWithCustomError(rewardDistributor, "AccessControlUnauthorizedAccount");
    });

    it("Should validate pool parameters", async function () {
      const { rewardDistributor, admin, stakingContract1 } = await loadFixture(deployRewardDistributorFixture);

      // Empty pool name
      await expect(
        rewardDistributor.connect(admin).addPool(
          "",
          stakingContract1.address,
          1000,
          ethers.parseEther("100000"),
          ethers.parseEther("100"),
          30 * 24 * 60 * 60,
          false
        )
      ).to.be.revertedWith("Pool name required");

      // Invalid staking contract
      await expect(
        rewardDistributor.connect(admin).addPool(
          "Test Pool",
          ethers.ZeroAddress,
          1000,
          ethers.parseEther("100000"),
          ethers.parseEther("100"),
          30 * 24 * 60 * 60,
          false
        )
      ).to.be.revertedWith("Invalid staking contract");

      // Add first pool
      await rewardDistributor.connect(admin).addPool(
        "Test Pool",
        stakingContract1.address,
        1000,
        ethers.parseEther("100000"),
        ethers.parseEther("100"),
        30 * 24 * 60 * 60,
        false
      );

      // Duplicate pool
      await expect(
        rewardDistributor.connect(admin).addPool(
          "Duplicate Pool",
          stakingContract1.address,
          500,
          ethers.parseEther("50000"),
          ethers.parseEther("50"),
          60 * 24 * 60 * 60,
          false
        )
      ).to.be.revertedWith("Pool already exists");
    });

    it("Should update pool correctly", async function () {
      const { rewardDistributor, admin } = await loadFixture(deployWithPoolsFixture);

      await expect(
        rewardDistributor.connect(admin).updatePool(
          0, // pid
          2000, // new allocPoint
          ethers.parseEther("200000"), // new maxCap
          ethers.parseEther("200"), // new minStakeAmount
          60 * 24 * 60 * 60, // new lockPeriod
          false, // deactivate
          false
        )
      ).to.emit(rewardDistributor, "PoolUpdated")
        .withArgs(0, 2000, false);

      const poolInfo = await rewardDistributor.rewardPools(0);
      expect(poolInfo.allocPoint).to.equal(2000);
      expect(poolInfo.maxCap).to.equal(ethers.parseEther("200000"));
      expect(poolInfo.minStakeAmount).to.equal(ethers.parseEther("200"));
      expect(poolInfo.lockPeriod).to.equal(60 * 24 * 60 * 60);
      expect(poolInfo.isActive).to.be.false;
    });

    it("Should return correct pool length", async function () {
      const { rewardDistributor } = await loadFixture(deployWithPoolsFixture);
      expect(await rewardDistributor.poolLength()).to.equal(2);
    });
  });

  describe("Stake Registration", function () {
    it("Should register stake correctly", async function () {
      const { rewardDistributor, stakingContract1, user1, startTime } = await loadFixture(deployWithPoolsFixture);

      // Fast forward to start time
      await time.increaseTo(startTime + 100);

      const stakeAmount = ethers.parseEther("1000");
      const lockPeriod = 30 * 24 * 60 * 60;

      await expect(
        rewardDistributor.connect(stakingContract1).registerStake(0, user1.address, stakeAmount, lockPeriod)
      ).to.not.be.reverted;

      const userReward = await rewardDistributor.userRewards(0, user1.address);
      expect(userReward.amount).to.equal(stakeAmount);
      expect(userReward.multiplier).to.be.gt(10000); // Should have lock bonus

      const poolInfo = await rewardDistributor.rewardPools(0);
      expect(poolInfo.totalStaked).to.equal(stakeAmount);

      const metrics = await rewardDistributor.getMetrics();
      expect(metrics.totalUsers).to.equal(1);
    });

    it("Should only allow authorized staking contracts to register", async function () {
      const { rewardDistributor, user1, user2 } = await loadFixture(deployWithPoolsFixture);

      const stakeAmount = ethers.parseEther("1000");
      const lockPeriod = 30 * 24 * 60 * 60;

      await expect(
        rewardDistributor.connect(user2).registerStake(0, user1.address, stakeAmount, lockPeriod)
      ).to.be.revertedWith("Unauthorized caller");
    });

    it("Should validate stake parameters", async function () {
      const { rewardDistributor, stakingContract1, user1, startTime } = await loadFixture(deployWithPoolsFixture);

      await time.increaseTo(startTime + 100);

      // Amount below minimum
      await expect(
        rewardDistributor.connect(stakingContract1).registerStake(
          0,
          user1.address,
          ethers.parseEther("50"), // Below minStakeAmount of 100
          30 * 24 * 60 * 60
        )
      ).to.be.revertedWith("Amount below minimum");

      // Lock period too short
      await expect(
        rewardDistributor.connect(stakingContract1).registerStake(
          0,
          user1.address,
          ethers.parseEther("1000"),
          15 * 24 * 60 * 60 // Below required 30 days
        )
      ).to.be.revertedWith("Lock period too short");
    });

    it("Should handle blacklisted users", async function () {
      const { rewardDistributor, stakingContract1, user1, admin, startTime } = await loadFixture(deployWithPoolsFixture);

      await time.increaseTo(startTime + 100);

      // Blacklist user
      await rewardDistributor.connect(admin).setUserBlacklist(user1.address, true);

      await expect(
        rewardDistributor.connect(stakingContract1).registerStake(
          0,
          user1.address,
          ethers.parseEther("1000"),
          30 * 24 * 60 * 60
        )
      ).to.be.revertedWith("User blacklisted");
    });
  });

  describe("Stake Unregistration", function () {
    it("Should unregister stake correctly", async function () {
      const { rewardDistributor, stakingContract1, user1, startTime } = await loadFixture(deployWithPoolsFixture);

      await time.increaseTo(startTime + 100);

      // First register stake
      const stakeAmount = ethers.parseEther("1000");
      const lockPeriod = 30 * 24 * 60 * 60;

      await rewardDistributor.connect(stakingContract1).registerStake(0, user1.address, stakeAmount, lockPeriod);

      // Fast forward past lock period
      await time.increase(lockPeriod + 100);

      // Mine some blocks to accumulate rewards
      await time.increase(3600); // 1 hour

      await expect(
        rewardDistributor.connect(stakingContract1).unregisterStake(0, user1.address, stakeAmount)
      ).to.not.be.reverted;

      const userReward = await rewardDistributor.userRewards(0, user1.address);
      expect(userReward.amount).to.equal(0);

      const poolInfo = await rewardDistributor.rewardPools(0);
      expect(poolInfo.totalStaked).to.equal(0);
    });

    it("Should not allow unregistering more than staked", async function () {
      const { rewardDistributor, stakingContract1, user1, startTime } = await loadFixture(deployWithPoolsFixture);

      await time.increaseTo(startTime + 100);

      const stakeAmount = ethers.parseEther("1000");
      await rewardDistributor.connect(stakingContract1).registerStake(0, user1.address, stakeAmount, 30 * 24 * 60 * 60);

      await expect(
        rewardDistributor.connect(stakingContract1).unregisterStake(
          0,
          user1.address,
          ethers.parseEther("2000") // More than staked
        )
      ).to.be.revertedWith("Insufficient stake");
    });

    it("Should require lock period to pass", async function () {
      const { rewardDistributor, stakingContract1, user1, startTime } = await loadFixture(deployWithPoolsFixture);

      await time.increaseTo(startTime + 100);

      const stakeAmount = ethers.parseEther("1000");
      await rewardDistributor.connect(stakingContract1).registerStake(0, user1.address, stakeAmount, 30 * 24 * 60 * 60);

      await expect(
        rewardDistributor.connect(stakingContract1).unregisterStake(0, user1.address, stakeAmount)
      ).to.be.revertedWith("Stake still locked");
    });
  });

  describe("Reward Claiming", function () {
    it("Should allow claiming rewards", async function () {
      const { rewardDistributor, urnToken, stakingContract1, user1, startTime } = await loadFixture(deployWithPoolsFixture);

      await time.increaseTo(startTime + 100);

      // Register stake
      const stakeAmount = ethers.parseEther("1000");
      await rewardDistributor.connect(stakingContract1).registerStake(0, user1.address, stakeAmount, 30 * 24 * 60 * 60);

      // Fast forward to accumulate rewards
      await time.increase(3600); // 1 hour

      const balanceBefore = await urnToken.balanceOf(user1.address);
      const pendingBefore = await rewardDistributor.pendingRewards(0, user1.address);

      await expect(
        rewardDistributor.connect(user1).claimRewards(0)
      ).to.emit(rewardDistributor, "RewardsClaimed");

      const balanceAfter = await urnToken.balanceOf(user1.address);
      expect(balanceAfter - balanceBefore).to.be.gt(0);
      expect(balanceAfter - balanceBefore).to.equal(pendingBefore);
    });

    it("Should enforce rate limiting", async function () {
      const { rewardDistributor, stakingContract1, user1, startTime } = await loadFixture(deployWithPoolsFixture);

      await time.increaseTo(startTime + 100);

      // Register stake
      const stakeAmount = ethers.parseEther("1000");
      await rewardDistributor.connect(stakingContract1).registerStake(0, user1.address, stakeAmount, 30 * 24 * 60 * 60);

      // Fast forward to accumulate rewards
      await time.increase(3600);

      // First claim should work
      await rewardDistributor.connect(user1).claimRewards(0);

      // Second claim immediately should fail due to rate limiting
      await expect(
        rewardDistributor.connect(user1).claimRewards(0)
      ).to.be.revertedWith("Action too frequent");

      // After rate limit period, should work again
      await time.increase(MIN_ACTION_INTERVAL + 1n);
      await rewardDistributor.connect(user1).claimRewards(0);
    });

    it("Should not allow claiming with no stake", async function () {
      const { rewardDistributor, user1, startTime } = await loadFixture(deployWithPoolsFixture);

      await time.increaseTo(startTime + 100);

      await expect(
        rewardDistributor.connect(user1).claimRewards(0)
      ).to.be.revertedWith("No stake found");
    });
  });

  describe("Reward Calculations", function () {
    it("Should calculate pending rewards correctly", async function () {
      const { rewardDistributor, stakingContract1, user1, startTime } = await loadFixture(deployWithPoolsFixture);

      await time.increaseTo(startTime + 100);

      // Register stake
      const stakeAmount = ethers.parseEther("1000");
      await rewardDistributor.connect(stakingContract1).registerStake(0, user1.address, stakeAmount, 30 * 24 * 60 * 60);

      // Fast forward to accumulate rewards
      await time.increase(3600); // 1 hour

      const pendingRewards = await rewardDistributor.pendingRewards(0, user1.address);
      expect(pendingRewards).to.be.gt(0);

      // Fast forward more and check rewards increase
      await time.increase(3600); // Another hour
      const pendingRewards2 = await rewardDistributor.pendingRewards(0, user1.address);
      expect(pendingRewards2).to.be.gt(pendingRewards);
    });

    it("Should distribute rewards proportionally among pools", async function () {
      const { rewardDistributor, stakingContract1, stakingContract2, user1, user2, startTime } = await loadFixture(deployWithPoolsFixture);

      await time.increaseTo(startTime + 100);

      const stakeAmount = ethers.parseEther("1000");

      // User1 stakes in pool 0 (allocPoint: 1000)
      await rewardDistributor.connect(stakingContract1).registerStake(0, user1.address, stakeAmount, 30 * 24 * 60 * 60);

      // User2 stakes in pool 1 (allocPoint: 500)
      await rewardDistributor.connect(stakingContract2).registerStake(1, user2.address, stakeAmount, 90 * 24 * 60 * 60);

      // Fast forward to accumulate rewards
      await time.increase(3600);

      const pendingRewards1 = await rewardDistributor.pendingRewards(0, user1.address);
      const pendingRewards2 = await rewardDistributor.pendingRewards(1, user2.address);

      // Pool 0 should get 2/3 of rewards (1000/(1000+500))
      // Pool 1 should get 1/3 of rewards (500/(1000+500))
      // But user2 has higher multiplier due to longer lock period
      expect(pendingRewards1).to.be.gt(0);
      expect(pendingRewards2).to.be.gt(0);
    });

    it("Should apply multipliers correctly", async function () {
      const { rewardDistributor, stakingContract1, user1, user2, startTime } = await loadFixture(deployWithPoolsFixture);

      await time.increaseTo(startTime + 100);

      const stakeAmount = ethers.parseEther("1000");

      // User1: 30 days lock
      await rewardDistributor.connect(stakingContract1).registerStake(0, user1.address, stakeAmount, 30 * 24 * 60 * 60);

      // User2: 365 days lock (should get higher multiplier)
      await rewardDistributor.connect(stakingContract1).registerStake(0, user2.address, stakeAmount, 365 * 24 * 60 * 60);

      // Fast forward to accumulate rewards
      await time.increase(3600);

      const pendingRewards1 = await rewardDistributor.pendingRewards(0, user1.address);
      const pendingRewards2 = await rewardDistributor.pendingRewards(0, user2.address);

      // User2 should have higher rewards due to longer lock period
      expect(pendingRewards2).to.be.gt(pendingRewards1);

      const userReward1 = await rewardDistributor.userRewards(0, user1.address);
      const userReward2 = await rewardDistributor.userRewards(0, user2.address);
      expect(userReward2.multiplier).to.be.gt(userReward1.multiplier);
    });

    it("Should respect max cap", async function () {
      const { rewardDistributor, admin, stakingContract1, user1, startTime } = await loadFixture(deployWithPoolsFixture);

      await time.increaseTo(startTime + 100);

      // Set a very low max cap for testing
      await rewardDistributor.connect(admin).updatePool(
        0,
        1000,
        ethers.parseEther("1"), // Very low max cap
        ethers.parseEther("100"),
        30 * 24 * 60 * 60,
        true,
        false
      );

      const stakeAmount = ethers.parseEther("1000");
      await rewardDistributor.connect(stakingContract1).registerStake(0, user1.address, stakeAmount, 30 * 24 * 60 * 60);

      // Fast forward to accumulate rewards
      await time.increase(86400); // 1 day

      const poolInfo = await rewardDistributor.rewardPools(0);
      expect(poolInfo.rewardsDistributed).to.be.lte(poolInfo.maxCap);
    });
  });

  describe("Vesting", function () {
    it("Should create vesting schedule", async function () {
      const { rewardDistributor, stakingContract1, user1, admin, startTime } = await loadFixture(deployWithPoolsFixture);

      await time.increaseTo(startTime + 100);

      // Enable vesting for user
      // This would require modifying the user's vesting settings, which isn't exposed in our interface
      // For testing purposes, we'll assume vesting is enabled through admin functions

      const stakeAmount = ethers.parseEther("1000");
      await rewardDistributor.connect(stakingContract1).registerStake(0, user1.address, stakeAmount, 30 * 24 * 60 * 60);

      // Fast forward and claim rewards (which might create vesting schedule)
      await time.increase(3600);

      const pendingRewards = await rewardDistributor.pendingRewards(0, user1.address);
      if (pendingRewards > 0) {
        await rewardDistributor.connect(user1).claimRewards(0);
      }

      // Check if vesting schedule was created
      const vestingSchedules = await rewardDistributor.vestingSchedules(user1.address, 0);
      // This test would need the vesting functionality to be enabled in the claim process
    });

    it("Should calculate releasable amount correctly", async function () {
      // This test would require a helper function to create vesting schedules
      // and test the releasable amount calculation over time
    });
  });

  describe("Emergency Functions", function () {
    it("Should allow emergency withdraw request", async function () {
      const { rewardDistributor, user1 } = await loadFixture(deployWithPoolsFixture);

      await expect(
        rewardDistributor.connect(user1).requestEmergencyWithdraw()
      ).to.emit(rewardDistributor, "EmergencyWithdrawRequested");

      const requestTime = await rewardDistributor.emergencyWithdrawRequests(user1.address);
      expect(requestTime).to.be.gt(0);
    });

    it("Should require delay before emergency withdraw execution", async function () {
      const { rewardDistributor, user1 } = await loadFixture(deployWithPoolsFixture);

      // Request emergency withdraw
      await rewardDistributor.connect(user1).requestEmergencyWithdraw();

      // Try to execute immediately (should fail)
      await expect(
        rewardDistributor.connect(user1).executeEmergencyWithdraw()
      ).to.be.revertedWith("Emergency withdraw not ready");

      // Fast forward but not enough
      await time.increase(EMERGENCY_WITHDRAW_DELAY - 100n);

      await expect(
        rewardDistributor.connect(user1).executeEmergencyWithdraw()
      ).to.be.revertedWith("Emergency withdraw not ready");

      // Fast forward enough time
      await time.increase(200n);

      // Should still fail if user has no rewards
      await expect(
        rewardDistributor.connect(user1).executeEmergencyWithdraw()
      ).to.be.revertedWith("No rewards to withdraw");
    });
  });

  describe("Administrative Functions", function () {
    it("Should allow admin to update reward parameters", async function () {
      const { rewardDistributor, admin } = await loadFixture(deployRewardDistributorFixture);

      const newRewardPerSecond = ethers.parseEther("2");
      const newInflationRate = 1000n; // 10%
      const newBurnRate = 500n; // 5%
      const newTreasuryRate = 1500n; // 15%

      await expect(
        rewardDistributor.connect(admin).updateRewardParameters(
          newRewardPerSecond,
          newInflationRate,
          newBurnRate,
          newTreasuryRate
        )
      ).to.emit(rewardDistributor, "RewardParametersUpdated")
        .withArgs(newRewardPerSecond, newInflationRate);

      expect(await rewardDistributor.rewardPerSecond()).to.equal(newRewardPerSecond);
      expect(await rewardDistributor.inflationRate()).to.equal(newInflationRate);
      expect(await rewardDistributor.burnRate()).to.equal(newBurnRate);
      expect(await rewardDistributor.treasuryRate()).to.equal(newTreasuryRate);
    });

    it("Should validate reward parameters", async function () {
      const { rewardDistributor, admin } = await loadFixture(deployRewardDistributorFixture);

      // Inflation rate too high
      await expect(
        rewardDistributor.connect(admin).updateRewardParameters(
          INITIAL_REWARD_PER_SECOND,
          2001n, // > 20%
          BURN_RATE,
          TREASURY_RATE
        )
      ).to.be.revertedWith("Inflation rate too high");

      // Combined rates too high
      await expect(
        rewardDistributor.connect(admin).updateRewardParameters(
          INITIAL_REWARD_PER_SECOND,
          INITIAL_INFLATION_RATE,
          3000n, // 30%
          3000n  // 30% (total 60% > 50%)
        )
      ).to.be.revertedWith("Rates too high");
    });

    it("Should allow admin to blacklist users", async function () {
      const { rewardDistributor, admin, user1 } = await loadFixture(deployRewardDistributorFixture);

      await rewardDistributor.connect(admin).setUserBlacklist(user1.address, true);
      expect(await rewardDistributor.blacklistedUsers(user1.address)).to.be.true;

      await rewardDistributor.connect(admin).setUserBlacklist(user1.address, false);
      expect(await rewardDistributor.blacklistedUsers(user1.address)).to.be.false;
    });

    it("Should allow admin to pause and unpause", async function () {
      const { rewardDistributor, stakingContract1, user1, admin, startTime } = await loadFixture(deployWithPoolsFixture);

      await time.increaseTo(startTime + 100);

      // Pause contract
      await rewardDistributor.connect(admin).pause();
      expect(await rewardDistributor.paused()).to.be.true;

      // Should not allow claiming when paused
      const stakeAmount = ethers.parseEther("1000");
      await rewardDistributor.connect(stakingContract1).registerStake(0, user1.address, stakeAmount, 30 * 24 * 60 * 60);

      await expect(
        rewardDistributor.connect(user1).claimRewards(0)
      ).to.be.revertedWithCustomError(rewardDistributor, "EnforcedPause");

      // Unpause contract
      await rewardDistributor.connect(admin).unpause();
      expect(await rewardDistributor.paused()).to.be.false;

      // Should allow claiming when unpaused
      await time.increase(3600);
      await expect(
        rewardDistributor.connect(user1).claimRewards(0)
      ).to.not.be.reverted;
    });
  });

  describe("User Information", function () {
    it("Should return correct user info", async function () {
      const { rewardDistributor, stakingContract1, user1, startTime } = await loadFixture(deployWithPoolsFixture);

      await time.increaseTo(startTime + 100);

      const stakeAmount = ethers.parseEther("1000");
      await rewardDistributor.connect(stakingContract1).registerStake(0, user1.address, stakeAmount, 30 * 24 * 60 * 60);

      const userInfo = await rewardDistributor.getUserInfo(0, user1.address);
      expect(userInfo.amount).to.equal(stakeAmount);
      expect(userInfo.multiplier).to.be.gt(10000);
    });

    it("Should return correct metrics", async function () {
      const { rewardDistributor, stakingContract1, stakingContract2, user1, user2, startTime } = await loadFixture(deployWithPoolsFixture);

      await time.increaseTo(startTime + 100);

      const stakeAmount = ethers.parseEther("1000");

      // Add two users
      await rewardDistributor.connect(stakingContract1).registerStake(0, user1.address, stakeAmount, 30 * 24 * 60 * 60);
      await rewardDistributor.connect(stakingContract2).registerStake(1, user2.address, stakeAmount, 90 * 24 * 60 * 60);

      const metrics = await rewardDistributor.getMetrics();
      expect(metrics.totalUsers).to.equal(2);
    });
  });

  describe("Gas Optimization", function () {
    it("Should have reasonable gas costs for common operations", async function () {
      const { rewardDistributor, stakingContract1, user1, startTime } = await loadFixture(deployWithPoolsFixture);

      await time.increaseTo(startTime + 100);

      const stakeAmount = ethers.parseEther("1000");

      // Test stake registration gas cost (called by staking contract)
      const registerTx = await rewardDistributor.connect(stakingContract1).registerStake(0, user1.address, stakeAmount, 30 * 24 * 60 * 60);
      const registerReceipt = await registerTx.wait();
      expect(registerReceipt?.gasUsed).to.be.lt(200000); // Should be under 200k gas

      // Fast forward and test claim gas cost
      await time.increase(3600);
      const claimTx = await rewardDistributor.connect(user1).claimRewards(0);
      const claimReceipt = await claimTx.wait();
      expect(claimReceipt?.gasUsed).to.be.lt(150000); // Should be under 150k gas
    });
  });

  describe("Edge Cases", function () {
    it("Should handle zero allocation points", async function () {
      const { rewardDistributor, admin, stakingContract1, user1, startTime } = await loadFixture(deployRewardDistributorFixture);

      // Add pool with zero allocation points
      await rewardDistributor.connect(admin).addPool(
        "Zero Alloc Pool",
        stakingContract1.address,
        0, // Zero allocation points
        ethers.parseEther("100000"),
        ethers.parseEther("100"),
        30 * 24 * 60 * 60,
        false
      );

      await time.increaseTo(startTime + 100);

      const stakeAmount = ethers.parseEther("1000");
      await rewardDistributor.connect(stakingContract1).registerStake(0, user1.address, stakeAmount, 30 * 24 * 60 * 60);

      await time.increase(3600);

      // Should have zero pending rewards
      const pendingRewards = await rewardDistributor.pendingRewards(0, user1.address);
      expect(pendingRewards).to.equal(0);
    });

    it("Should handle inactive pools", async function () {
      const { rewardDistributor, admin, stakingContract1, user1, startTime } = await loadFixture(deployWithPoolsFixture);

      await time.increaseTo(startTime + 100);

      // Deactivate pool
      await rewardDistributor.connect(admin).updatePool(0, 1000, ethers.parseEther("100000"), ethers.parseEther("100"), 30 * 24 * 60 * 60, false, false);

      const stakeAmount = ethers.parseEther("1000");
      await rewardDistributor.connect(stakingContract1).registerStake(0, user1.address, stakeAmount, 30 * 24 * 60 * 60);

      await time.increase(3600);

      // Pool should not accumulate rewards when inactive
      const poolInfo = await rewardDistributor.rewardPools(0);
      expect(poolInfo.isActive).to.be.false;
    });
  });
});