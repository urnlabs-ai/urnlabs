import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("YieldFarm", function () {
  async function deployYieldFarmFixture() {
    const [owner, user1, user2, user3] = await ethers.getSigners();

    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const stakingToken = await MockERC20.deploy("Staking Token", "STK", ethers.parseEther("1000000"));
    const rewardToken = await MockERC20.deploy("Reward Token", "RWD", ethers.parseEther("1000000"));

    // Deploy YieldFarm
    const YieldFarm = await ethers.getContractFactory("YieldFarm");
    const yieldFarm = await YieldFarm.deploy(
      await stakingToken.getAddress(),
      await rewardToken.getAddress(),
      ethers.parseEther("100"), // 100 tokens per second reward rate
      await time.latest() + 100 // start time
    );

    // Setup initial balances
    await stakingToken.transfer(user1.address, ethers.parseEther("1000"));
    await stakingToken.transfer(user2.address, ethers.parseEther("1000"));
    await rewardToken.transfer(await yieldFarm.getAddress(), ethers.parseEther("100000"));

    return {
      yieldFarm,
      stakingToken,
      rewardToken,
      owner,
      user1,
      user2,
      user3
    };
  }

  describe("Deployment", function () {
    it("Should set the correct staking and reward tokens", async function () {
      const { yieldFarm, stakingToken, rewardToken } = await loadFixture(deployYieldFarmFixture);

      expect(await yieldFarm.stakingToken()).to.equal(await stakingToken.getAddress());
      expect(await yieldFarm.rewardToken()).to.equal(await rewardToken.getAddress());
    });

    it("Should set the correct reward rate", async function () {
      const { yieldFarm } = await loadFixture(deployYieldFarmFixture);

      expect(await yieldFarm.rewardRate()).to.equal(ethers.parseEther("100"));
    });

    it("Should set the correct owner", async function () {
      const { yieldFarm, owner } = await loadFixture(deployYieldFarmFixture);

      expect(await yieldFarm.owner()).to.equal(owner.address);
    });
  });

  describe("Pool Management", function () {
    it("Should add a new pool", async function () {
      const { yieldFarm, stakingToken, owner } = await loadFixture(deployYieldFarmFixture);

      await yieldFarm.connect(owner).addPool(
        await stakingToken.getAddress(),
        1000, // allocation points
        false // with update
      );

      const poolInfo = await yieldFarm.poolInfo(0);
      expect(poolInfo.lpToken).to.equal(await stakingToken.getAddress());
      expect(poolInfo.allocPoint).to.equal(1000);
    });

    it("Should update pool allocation", async function () {
      const { yieldFarm, stakingToken, owner } = await loadFixture(deployYieldFarmFixture);

      await yieldFarm.connect(owner).addPool(
        await stakingToken.getAddress(),
        1000,
        false
      );

      await yieldFarm.connect(owner).setPool(0, 2000, false);

      const poolInfo = await yieldFarm.poolInfo(0);
      expect(poolInfo.allocPoint).to.equal(2000);
    });

    it("Should not allow non-owner to add pools", async function () {
      const { yieldFarm, stakingToken, user1 } = await loadFixture(deployYieldFarmFixture);

      await expect(
        yieldFarm.connect(user1).addPool(
          await stakingToken.getAddress(),
          1000,
          false
        )
      ).to.be.reverted;
    });
  });

  describe("Staking", function () {
    beforeEach(async function () {
      const { yieldFarm, stakingToken, owner } = await loadFixture(deployYieldFarmFixture);

      // Add a pool before staking
      await yieldFarm.connect(owner).addPool(
        await stakingToken.getAddress(),
        1000,
        false
      );
    });

    it("Should allow users to stake tokens", async function () {
      const { yieldFarm, stakingToken, user1 } = await loadFixture(deployYieldFarmFixture);

      const stakeAmount = ethers.parseEther("100");
      await stakingToken.connect(user1).approve(await yieldFarm.getAddress(), stakeAmount);
      
      await yieldFarm.connect(user1).deposit(0, stakeAmount);

      const userInfo = await yieldFarm.userInfo(0, user1.address);
      expect(userInfo.amount).to.equal(stakeAmount);
    });

    it("Should update pool when staking", async function () {
      const { yieldFarm, stakingToken, user1, owner } = await loadFixture(deployYieldFarmFixture);

      // Add pool
      await yieldFarm.connect(owner).addPool(
        await stakingToken.getAddress(),
        1000,
        false
      );

      const stakeAmount = ethers.parseEther("100");
      await stakingToken.connect(user1).approve(await yieldFarm.getAddress(), stakeAmount);
      
      await time.increase(200); // Move past start time
      await yieldFarm.connect(user1).deposit(0, stakeAmount);

      const poolInfo = await yieldFarm.poolInfo(0);
      expect(poolInfo.lastRewardBlock).to.be.greaterThan(0);
    });

    it("Should not allow staking zero amount", async function () {
      const { yieldFarm, user1 } = await loadFixture(deployYieldFarmFixture);

      await expect(
        yieldFarm.connect(user1).deposit(0, 0)
      ).to.be.revertedWith("Cannot stake 0 tokens");
    });
  });

  describe("Withdrawing", function () {
    beforeEach(async function () {
      const { yieldFarm, stakingToken, user1, owner } = await loadFixture(deployYieldFarmFixture);

      // Add pool and stake tokens
      await yieldFarm.connect(owner).addPool(
        await stakingToken.getAddress(),
        1000,
        false
      );

      const stakeAmount = ethers.parseEther("100");
      await stakingToken.connect(user1).approve(await yieldFarm.getAddress(), stakeAmount);
      await yieldFarm.connect(user1).deposit(0, stakeAmount);
    });

    it("Should allow users to withdraw staked tokens", async function () {
      const { yieldFarm, stakingToken, user1 } = await loadFixture(deployYieldFarmFixture);

      const withdrawAmount = ethers.parseEther("50");
      const initialBalance = await stakingToken.balanceOf(user1.address);

      await yieldFarm.connect(user1).withdraw(0, withdrawAmount);

      const finalBalance = await stakingToken.balanceOf(user1.address);
      expect(finalBalance - initialBalance).to.equal(withdrawAmount);
    });

    it("Should not allow withdrawing more than staked", async function () {
      const { yieldFarm, user1 } = await loadFixture(deployYieldFarmFixture);

      const withdrawAmount = ethers.parseEther("200"); // More than staked

      await expect(
        yieldFarm.connect(user1).withdraw(0, withdrawAmount)
      ).to.be.revertedWith("Insufficient staked amount");
    });

    it("Should update user info after withdrawal", async function () {
      const { yieldFarm, user1 } = await loadFixture(deployYieldFarmFixture);

      const withdrawAmount = ethers.parseEther("50");
      await yieldFarm.connect(user1).withdraw(0, withdrawAmount);

      const userInfo = await yieldFarm.userInfo(0, user1.address);
      expect(userInfo.amount).to.equal(ethers.parseEther("50")); // 100 - 50
    });
  });

  describe("Rewards", function () {
    beforeEach(async function () {
      const { yieldFarm, stakingToken, user1, owner } = await loadFixture(deployYieldFarmFixture);

      // Add pool and stake tokens
      await yieldFarm.connect(owner).addPool(
        await stakingToken.getAddress(),
        1000,
        false
      );

      const stakeAmount = ethers.parseEther("100");
      await stakingToken.connect(user1).approve(await yieldFarm.getAddress(), stakeAmount);
      await time.increase(200); // Move past start time
      await yieldFarm.connect(user1).deposit(0, stakeAmount);
    });

    it("Should calculate pending rewards correctly", async function () {
      const { yieldFarm, user1 } = await loadFixture(deployYieldFarmFixture);

      await time.increase(100); // Let some time pass for rewards

      const pendingRewards = await yieldFarm.pendingReward(0, user1.address);
      expect(pendingRewards).to.be.greaterThan(0);
    });

    it("Should harvest rewards", async function () {
      const { yieldFarm, rewardToken, user1 } = await loadFixture(deployYieldFarmFixture);

      await time.increase(100);
      const initialBalance = await rewardToken.balanceOf(user1.address);

      await yieldFarm.connect(user1).harvest(0);

      const finalBalance = await rewardToken.balanceOf(user1.address);
      expect(finalBalance).to.be.greaterThan(initialBalance);
    });

    it("Should reset pending rewards after harvest", async function () {
      const { yieldFarm, user1 } = await loadFixture(deployYieldFarmFixture);

      await time.increase(100);
      await yieldFarm.connect(user1).harvest(0);

      const pendingAfterHarvest = await yieldFarm.pendingReward(0, user1.address);
      expect(pendingAfterHarvest).to.equal(0);
    });
  });

  describe("Emergency Functions", function () {
    it("Should allow emergency withdrawal", async function () {
      const { yieldFarm, stakingToken, user1, owner } = await loadFixture(deployYieldFarmFixture);

      // Add pool and stake
      await yieldFarm.connect(owner).addPool(
        await stakingToken.getAddress(),
        1000,
        false
      );

      const stakeAmount = ethers.parseEther("100");
      await stakingToken.connect(user1).approve(await yieldFarm.getAddress(), stakeAmount);
      await yieldFarm.connect(user1).deposit(0, stakeAmount);

      const initialBalance = await stakingToken.balanceOf(user1.address);
      await yieldFarm.connect(user1).emergencyWithdraw(0);

      const finalBalance = await stakingToken.balanceOf(user1.address);
      expect(finalBalance - initialBalance).to.equal(stakeAmount);

      // User info should be reset
      const userInfo = await yieldFarm.userInfo(0, user1.address);
      expect(userInfo.amount).to.equal(0);
      expect(userInfo.rewardDebt).to.equal(0);
    });

    it("Should allow owner to pause contract", async function () {
      const { yieldFarm, owner } = await loadFixture(deployYieldFarmFixture);

      await yieldFarm.connect(owner).pause();
      expect(await yieldFarm.paused()).to.be.true;
    });

    it("Should not allow operations when paused", async function () {
      const { yieldFarm, stakingToken, user1, owner } = await loadFixture(deployYieldFarmFixture);

      await yieldFarm.connect(owner).addPool(
        await stakingToken.getAddress(),
        1000,
        false
      );
      await yieldFarm.connect(owner).pause();

      const stakeAmount = ethers.parseEther("100");
      await stakingToken.connect(user1).approve(await yieldFarm.getAddress(), stakeAmount);

      await expect(
        yieldFarm.connect(user1).deposit(0, stakeAmount)
      ).to.be.revertedWith("Pausable: paused");
    });
  });

  describe("Events", function () {
    it("Should emit Deposit event", async function () {
      const { yieldFarm, stakingToken, user1, owner } = await loadFixture(deployYieldFarmFixture);

      await yieldFarm.connect(owner).addPool(
        await stakingToken.getAddress(),
        1000,
        false
      );

      const stakeAmount = ethers.parseEther("100");
      await stakingToken.connect(user1).approve(await yieldFarm.getAddress(), stakeAmount);

      await expect(yieldFarm.connect(user1).deposit(0, stakeAmount))
        .to.emit(yieldFarm, "Deposit")
        .withArgs(user1.address, 0, stakeAmount);
    });

    it("Should emit Withdraw event", async function () {
      const { yieldFarm, stakingToken, user1, owner } = await loadFixture(deployYieldFarmFixture);

      await yieldFarm.connect(owner).addPool(
        await stakingToken.getAddress(),
        1000,
        false
      );

      const stakeAmount = ethers.parseEther("100");
      await stakingToken.connect(user1).approve(await yieldFarm.getAddress(), stakeAmount);
      await yieldFarm.connect(user1).deposit(0, stakeAmount);

      const withdrawAmount = ethers.parseEther("50");
      await expect(yieldFarm.connect(user1).withdraw(0, withdrawAmount))
        .to.emit(yieldFarm, "Withdraw")
        .withArgs(user1.address, 0, withdrawAmount);
    });

    it("Should emit Harvest event", async function () {
      const { yieldFarm, stakingToken, user1, owner } = await loadFixture(deployYieldFarmFixture);

      await yieldFarm.connect(owner).addPool(
        await stakingToken.getAddress(),
        1000,
        false
      );

      const stakeAmount = ethers.parseEther("100");
      await stakingToken.connect(user1).approve(await yieldFarm.getAddress(), stakeAmount);
      await time.increase(200);
      await yieldFarm.connect(user1).deposit(0, stakeAmount);

      await time.increase(100);
      await expect(yieldFarm.connect(user1).harvest(0))
        .to.emit(yieldFarm, "Harvest");
    });
  });

  describe("Multi-user scenarios", function () {
    it("Should handle multiple users staking correctly", async function () {
      const { yieldFarm, stakingToken, user1, user2, owner } = await loadFixture(deployYieldFarmFixture);

      await yieldFarm.connect(owner).addPool(
        await stakingToken.getAddress(),
        1000,
        false
      );

      // User1 stakes
      const stake1 = ethers.parseEther("100");
      await stakingToken.connect(user1).approve(await yieldFarm.getAddress(), stake1);
      await time.increase(200);
      await yieldFarm.connect(user1).deposit(0, stake1);

      // User2 stakes
      const stake2 = ethers.parseEther("200");
      await stakingToken.connect(user2).approve(await yieldFarm.getAddress(), stake2);
      await yieldFarm.connect(user2).deposit(0, stake2);

      // Check both users have correct amounts
      const user1Info = await yieldFarm.userInfo(0, user1.address);
      const user2Info = await yieldFarm.userInfo(0, user2.address);

      expect(user1Info.amount).to.equal(stake1);
      expect(user2Info.amount).to.equal(stake2);
    });

    it("Should distribute rewards proportionally", async function () {
      const { yieldFarm, stakingToken, rewardToken, user1, user2, owner } = await loadFixture(deployYieldFarmFixture);

      await yieldFarm.connect(owner).addPool(
        await stakingToken.getAddress(),
        1000,
        false
      );

      // User1 stakes 100 tokens
      const stake1 = ethers.parseEther("100");
      await stakingToken.connect(user1).approve(await yieldFarm.getAddress(), stake1);
      await time.increase(200);
      await yieldFarm.connect(user1).deposit(0, stake1);

      // User2 stakes 300 tokens (3x more)
      const stake2 = ethers.parseEther("300");
      await stakingToken.connect(user2).approve(await yieldFarm.getAddress(), stake2);
      await yieldFarm.connect(user2).deposit(0, stake2);

      // Let time pass for rewards
      await time.increase(100);

      // Harvest rewards
      const user1BalBefore = await rewardToken.balanceOf(user1.address);
      const user2BalBefore = await rewardToken.balanceOf(user2.address);

      await yieldFarm.connect(user1).harvest(0);
      await yieldFarm.connect(user2).harvest(0);

      const user1Rewards = await rewardToken.balanceOf(user1.address) - user1BalBefore;
      const user2Rewards = await rewardToken.balanceOf(user2.address) - user2BalBefore;

      // User2 should get approximately 3x more rewards (allowing for some variance due to timing)
      expect(user2Rewards).to.be.greaterThan(user1Rewards * BigInt(2));
    });
  });
});