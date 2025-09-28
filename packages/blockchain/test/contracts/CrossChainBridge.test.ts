import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("CrossChainBridge", function () {
  async function deployCrossChainBridgeFixture() {
    const [owner, validator1, validator2, validator3, user1, user2] = await ethers.getSigners();

    // Deploy mock token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy("Bridge Token", "BTK", ethers.parseEther("1000000"));

    // Deploy CrossChainBridge
    const CrossChainBridge = await ethers.getContractFactory("CrossChainBridge");
    const bridge = await CrossChainBridge.deploy();

    // Setup initial state
    await token.transfer(user1.address, ethers.parseEther("1000"));
    await token.transfer(user2.address, ethers.parseEther("1000"));
    await token.transfer(await bridge.getAddress(), ethers.parseEther("10000")); // Bridge liquidity

    // Add validators
    await bridge.connect(owner).addValidator(validator1.address);
    await bridge.connect(owner).addValidator(validator2.address);
    await bridge.connect(owner).addValidator(validator3.address);

    return {
      bridge,
      token,
      owner,
      validator1,
      validator2,
      validator3,
      user1,
      user2
    };
  }

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      const { bridge, owner } = await loadFixture(deployCrossChainBridgeFixture);

      expect(await bridge.owner()).to.equal(owner.address);
    });

    it("Should initialize with correct required signatures", async function () {
      const { bridge } = await loadFixture(deployCrossChainBridgeFixture);

      expect(await bridge.requiredSignatures()).to.equal(2);
    });

    it("Should start with zero nonce", async function () {
      const { bridge } = await loadFixture(deployCrossChainBridgeFixture);

      expect(await bridge.nonce()).to.equal(0);
    });
  });

  describe("Validator Management", function () {
    it("Should add validators correctly", async function () {
      const { bridge, validator1 } = await loadFixture(deployCrossChainBridgeFixture);

      expect(await bridge.validators(validator1.address)).to.be.true;
      expect(await bridge.validatorCount()).to.equal(3);
    });

    it("Should remove validators correctly", async function () {
      const { bridge, validator1, owner } = await loadFixture(deployCrossChainBridgeFixture);

      await bridge.connect(owner).removeValidator(validator1.address);

      expect(await bridge.validators(validator1.address)).to.be.false;
      expect(await bridge.validatorCount()).to.equal(2);
    });

    it("Should not allow non-owner to add validators", async function () {
      const { bridge, user1, user2 } = await loadFixture(deployCrossChainBridgeFixture);

      await expect(
        bridge.connect(user1).addValidator(user2.address)
      ).to.be.reverted;
    });

    it("Should not allow adding existing validator", async function () {
      const { bridge, validator1, owner } = await loadFixture(deployCrossChainBridgeFixture);

      await expect(
        bridge.connect(owner).addValidator(validator1.address)
      ).to.be.revertedWith("Already a validator");
    });

    it("Should not allow removing non-validator", async function () {
      const { bridge, user1, owner } = await loadFixture(deployCrossChainBridgeFixture);

      await expect(
        bridge.connect(owner).removeValidator(user1.address)
      ).to.be.revertedWith("Not a validator");
    });
  });

  describe("Bridge Initiation", function () {
    it("Should initiate bridge transfer correctly", async function () {
      const { bridge, token, user1 } = await loadFixture(deployCrossChainBridgeFixture);

      const bridgeAmount = ethers.parseEther("100");
      const targetChain = 137; // Polygon
      const recipient = "0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe";

      await token.connect(user1).approve(await bridge.getAddress(), bridgeAmount);

      await expect(
        bridge.connect(user1).initiateBridge(
          await token.getAddress(),
          bridgeAmount,
          targetChain,
          recipient
        )
      ).to.emit(bridge, "BridgeInitiated")
        .withArgs(
          0, // nonce
          user1.address,
          await token.getAddress(),
          bridgeAmount,
          targetChain,
          recipient
        );

      expect(await bridge.nonce()).to.equal(1);
    });

    it("Should lock tokens during bridge initiation", async function () {
      const { bridge, token, user1 } = await loadFixture(deployCrossChainBridgeFixture);

      const bridgeAmount = ethers.parseEther("100");
      const initialBalance = await token.balanceOf(user1.address);

      await token.connect(user1).approve(await bridge.getAddress(), bridgeAmount);
      await bridge.connect(user1).initiateBridge(
        await token.getAddress(),
        bridgeAmount,
        137,
        "0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe"
      );

      const finalBalance = await token.balanceOf(user1.address);
      expect(initialBalance - finalBalance).to.equal(bridgeAmount);
    });

    it("Should not allow bridge with zero amount", async function () {
      const { bridge, token, user1 } = await loadFixture(deployCrossChainBridgeFixture);

      await expect(
        bridge.connect(user1).initiateBridge(
          await token.getAddress(),
          0,
          137,
          "0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe"
        )
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should not allow bridge to same chain", async function () {
      const { bridge, token, user1 } = await loadFixture(deployCrossChainBridgeFixture);

      const currentChainId = await ethers.provider.getNetwork().then(n => n.chainId);

      await expect(
        bridge.connect(user1).initiateBridge(
          await token.getAddress(),
          ethers.parseEther("100"),
          Number(currentChainId),
          "0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe"
        )
      ).to.be.revertedWith("Cannot bridge to same chain");
    });
  });

  describe("Bridge Completion", function () {
    it("Should complete bridge transfer with sufficient signatures", async function () {
      const { bridge, token, validator1, validator2, user1 } = await loadFixture(deployCrossChainBridgeFixture);

      const bridgeAmount = ethers.parseEther("100");
      const nonce = 0;
      
      // Create message hash
      const messageHash = ethers.solidityPackedKeccak256(
        ["uint256", "address", "address", "uint256"],
        [nonce, await token.getAddress(), user1.address, bridgeAmount]
      );

      // Get signatures from validators
      const sig1 = await validator1.signMessage(ethers.getBytes(messageHash));
      const sig2 = await validator2.signMessage(ethers.getBytes(messageHash));

      const signatures = [sig1, sig2];

      const initialBalance = await token.balanceOf(user1.address);

      await bridge.completeBridge(
        nonce,
        await token.getAddress(),
        user1.address,
        bridgeAmount,
        signatures
      );

      const finalBalance = await token.balanceOf(user1.address);
      expect(finalBalance - initialBalance).to.equal(bridgeAmount);
    });

    it("Should mark bridge transfer as completed", async function () {
      const { bridge, token, validator1, validator2, user1 } = await loadFixture(deployCrossChainBridgeFixture);

      const bridgeAmount = ethers.parseEther("100");
      const nonce = 0;
      
      const messageHash = ethers.solidityPackedKeccak256(
        ["uint256", "address", "address", "uint256"],
        [nonce, await token.getAddress(), user1.address, bridgeAmount]
      );

      const sig1 = await validator1.signMessage(ethers.getBytes(messageHash));
      const sig2 = await validator2.signMessage(ethers.getBytes(messageHash));

      await bridge.completeBridge(
        nonce,
        await token.getAddress(),
        user1.address,
        bridgeAmount,
        [sig1, sig2]
      );

      expect(await bridge.completedTransfers(nonce)).to.be.true;
    });

    it("Should not allow completing transfer twice", async function () {
      const { bridge, token, validator1, validator2, user1 } = await loadFixture(deployCrossChainBridgeFixture);

      const bridgeAmount = ethers.parseEther("100");
      const nonce = 0;
      
      const messageHash = ethers.solidityPackedKeccak256(
        ["uint256", "address", "address", "uint256"],
        [nonce, await token.getAddress(), user1.address, bridgeAmount]
      );

      const sig1 = await validator1.signMessage(ethers.getBytes(messageHash));
      const sig2 = await validator2.signMessage(ethers.getBytes(messageHash));

      await bridge.completeBridge(
        nonce,
        await token.getAddress(),
        user1.address,
        bridgeAmount,
        [sig1, sig2]
      );

      await expect(
        bridge.completeBridge(
          nonce,
          await token.getAddress(),
          user1.address,
          bridgeAmount,
          [sig1, sig2]
        )
      ).to.be.revertedWith("Transfer already completed");
    });

    it("Should not allow completion with insufficient signatures", async function () {
      const { bridge, token, validator1, user1 } = await loadFixture(deployCrossChainBridgeFixture);

      const bridgeAmount = ethers.parseEther("100");
      const nonce = 0;
      
      const messageHash = ethers.solidityPackedKeccak256(
        ["uint256", "address", "address", "uint256"],
        [nonce, await token.getAddress(), user1.address, bridgeAmount]
      );

      const sig1 = await validator1.signMessage(ethers.getBytes(messageHash));

      await expect(
        bridge.completeBridge(
          nonce,
          await token.getAddress(),
          user1.address,
          bridgeAmount,
          [sig1] // Only one signature
        )
      ).to.be.revertedWith("Insufficient signatures");
    });

    it("Should not allow completion with invalid signatures", async function () {
      const { bridge, token, user1, user2 } = await loadFixture(deployCrossChainBridgeFixture);

      const bridgeAmount = ethers.parseEther("100");
      const nonce = 0;
      
      const messageHash = ethers.solidityPackedKeccak256(
        ["uint256", "address", "address", "uint256"],
        [nonce, await token.getAddress(), user1.address, bridgeAmount]
      );

      // Get signatures from non-validators
      const sig1 = await user1.signMessage(ethers.getBytes(messageHash));
      const sig2 = await user2.signMessage(ethers.getBytes(messageHash));

      await expect(
        bridge.completeBridge(
          nonce,
          await token.getAddress(),
          user1.address,
          bridgeAmount,
          [sig1, sig2]
        )
      ).to.be.revertedWith("Invalid signature");
    });
  });

  describe("Emergency Functions", function () {
    it("Should allow owner to pause bridge", async function () {
      const { bridge, owner } = await loadFixture(deployCrossChainBridgeFixture);

      await bridge.connect(owner).pause();
      expect(await bridge.paused()).to.be.true;
    });

    it("Should not allow operations when paused", async function () {
      const { bridge, token, user1, owner } = await loadFixture(deployCrossChainBridgeFixture);

      await bridge.connect(owner).pause();

      await token.connect(user1).approve(await bridge.getAddress(), ethers.parseEther("100"));

      await expect(
        bridge.connect(user1).initiateBridge(
          await token.getAddress(),
          ethers.parseEther("100"),
          137,
          "0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe"
        )
      ).to.be.revertedWith("Pausable: paused");
    });

    it("Should allow emergency withdrawal", async function () {
      const { bridge, token, owner } = await loadFixture(deployCrossChainBridgeFixture);

      const initialOwnerBalance = await token.balanceOf(owner.address);
      const bridgeBalance = await token.balanceOf(await bridge.getAddress());

      await bridge.connect(owner).emergencyWithdraw(await token.getAddress());

      const finalOwnerBalance = await token.balanceOf(owner.address);
      expect(finalOwnerBalance - initialOwnerBalance).to.equal(bridgeBalance);
    });

    it("Should not allow non-owner emergency withdrawal", async function () {
      const { bridge, token, user1 } = await loadFixture(deployCrossChainBridgeFixture);

      await expect(
        bridge.connect(user1).emergencyWithdraw(await token.getAddress())
      ).to.be.reverted;
    });
  });

  describe("Liquidity Management", function () {
    it("Should track token liquidity correctly", async function () {
      const { bridge, token } = await loadFixture(deployCrossChainBridgeFixture);

      const bridgeBalance = await token.balanceOf(await bridge.getAddress());
      const liquidity = await bridge.getTokenLiquidity(await token.getAddress());

      expect(liquidity).to.equal(bridgeBalance);
    });

    it("Should not allow bridge transfer exceeding liquidity", async function () {
      const { bridge, token, user1 } = await loadFixture(deployCrossChainBridgeFixture);

      const bridgeBalance = await token.balanceOf(await bridge.getAddress());
      const excessiveAmount = bridgeBalance + ethers.parseEther("1");

      // Give user enough tokens
      await token.transfer(user1.address, excessiveAmount);
      await token.connect(user1).approve(await bridge.getAddress(), excessiveAmount);

      await expect(
        bridge.connect(user1).initiateBridge(
          await token.getAddress(),
          excessiveAmount,
          137,
          "0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe"
        )
      ).to.be.revertedWith("Insufficient bridge liquidity");
    });

    it("Should allow adding liquidity", async function () {
      const { bridge, token, owner } = await loadFixture(deployCrossChainBridgeFixture);

      const addAmount = ethers.parseEther("1000");
      const initialLiquidity = await bridge.getTokenLiquidity(await token.getAddress());

      await token.connect(owner).approve(await bridge.getAddress(), addAmount);
      await bridge.connect(owner).addLiquidity(await token.getAddress(), addAmount);

      const finalLiquidity = await bridge.getTokenLiquidity(await token.getAddress());
      expect(finalLiquidity - initialLiquidity).to.equal(addAmount);
    });
  });

  describe("Fee Management", function () {
    it("Should set bridge fees correctly", async function () {
      const { bridge, token, owner } = await loadFixture(deployCrossChainBridgeFixture);

      const feePercentage = 50; // 0.5%
      await bridge.connect(owner).setBridgeFee(await token.getAddress(), feePercentage);

      expect(await bridge.bridgeFees(await token.getAddress())).to.equal(feePercentage);
    });

    it("Should collect fees during bridge transfers", async function () {
      const { bridge, token, user1, owner } = await loadFixture(deployCrossChainBridgeFixture);

      const feePercentage = 100; // 1%
      await bridge.connect(owner).setBridgeFee(await token.getAddress(), feePercentage);

      const bridgeAmount = ethers.parseEther("100");
      const expectedFee = bridgeAmount * BigInt(feePercentage) / BigInt(10000);

      await token.connect(user1).approve(await bridge.getAddress(), bridgeAmount);
      
      const initialFeeBalance = await bridge.collectedFees(await token.getAddress());

      await bridge.connect(user1).initiateBridge(
        await token.getAddress(),
        bridgeAmount,
        137,
        "0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe"
      );

      const finalFeeBalance = await bridge.collectedFees(await token.getAddress());
      expect(finalFeeBalance - initialFeeBalance).to.equal(expectedFee);
    });

    it("Should allow fee collection by owner", async function () {
      const { bridge, token, user1, owner } = await loadFixture(deployCrossChainBridgeFixture);

      const feePercentage = 100; // 1%
      await bridge.connect(owner).setBridgeFee(await token.getAddress(), feePercentage);

      const bridgeAmount = ethers.parseEther("100");
      await token.connect(user1).approve(await bridge.getAddress(), bridgeAmount);
      await bridge.connect(user1).initiateBridge(
        await token.getAddress(),
        bridgeAmount,
        137,
        "0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe"
      );

      const collectedFees = await bridge.collectedFees(await token.getAddress());
      const initialOwnerBalance = await token.balanceOf(owner.address);

      await bridge.connect(owner).collectFees(await token.getAddress());

      const finalOwnerBalance = await token.balanceOf(owner.address);
      expect(finalOwnerBalance - initialOwnerBalance).to.equal(collectedFees);
      expect(await bridge.collectedFees(await token.getAddress())).to.equal(0);
    });
  });

  describe("Events", function () {
    it("Should emit BridgeInitiated event", async function () {
      const { bridge, token, user1 } = await loadFixture(deployCrossChainBridgeFixture);

      const bridgeAmount = ethers.parseEther("100");
      const targetChain = 137;
      const recipient = "0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe";

      await token.connect(user1).approve(await bridge.getAddress(), bridgeAmount);

      await expect(
        bridge.connect(user1).initiateBridge(
          await token.getAddress(),
          bridgeAmount,
          targetChain,
          recipient
        )
      ).to.emit(bridge, "BridgeInitiated")
        .withArgs(0, user1.address, await token.getAddress(), bridgeAmount, targetChain, recipient);
    });

    it("Should emit BridgeCompleted event", async function () {
      const { bridge, token, validator1, validator2, user1 } = await loadFixture(deployCrossChainBridgeFixture);

      const bridgeAmount = ethers.parseEther("100");
      const nonce = 0;
      
      const messageHash = ethers.solidityPackedKeccak256(
        ["uint256", "address", "address", "uint256"],
        [nonce, await token.getAddress(), user1.address, bridgeAmount]
      );

      const sig1 = await validator1.signMessage(ethers.getBytes(messageHash));
      const sig2 = await validator2.signMessage(ethers.getBytes(messageHash));

      await expect(
        bridge.completeBridge(
          nonce,
          await token.getAddress(),
          user1.address,
          bridgeAmount,
          [sig1, sig2]
        )
      ).to.emit(bridge, "BridgeCompleted")
        .withArgs(nonce, await token.getAddress(), user1.address, bridgeAmount);
    });

    it("Should emit ValidatorAdded event", async function () {
      const { bridge, owner, user1 } = await loadFixture(deployCrossChainBridgeFixture);

      await expect(bridge.connect(owner).addValidator(user1.address))
        .to.emit(bridge, "ValidatorAdded")
        .withArgs(user1.address);
    });

    it("Should emit ValidatorRemoved event", async function () {
      const { bridge, validator1, owner } = await loadFixture(deployCrossChainBridgeFixture);

      await expect(bridge.connect(owner).removeValidator(validator1.address))
        .to.emit(bridge, "ValidatorRemoved")
        .withArgs(validator1.address);
    });
  });
});