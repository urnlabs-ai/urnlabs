import { ethers, upgrades, network, run } from "hardhat";
import { Contract } from "ethers";
import fs from "fs";
import path from "path";

export interface DeploymentConfig {
  network: string;
  // UrnToken config
  urnToken: {
    name: string;
    symbol: string;
    initialSupply: string;
  };
  // YieldFarm config
  yieldFarm: {
    urnPerBlock: string;
    bonusBlocks: number;
    emergencyWithdrawFee: number; // basis points
  };
  // LiquidityManager config
  liquidityManager: {
    positionManager: string;
    swapRouter: string;
    quoter: string;
    managementFee: number; // basis points
  };
  // RewardDistributor config
  rewardDistributor: {
    rewardPerSecond: string;
    durationDays: number;
    inflationRate: number; // basis points
    burnRate: number; // basis points
    treasuryRate: number; // basis points
  };
  // Addresses
  addresses: {
    admin: string;
    feeRecipient: string;
    treasury: string;
  };
  // Verification settings
  verification: {
    enabled: boolean;
    apiKey?: string;
  };
}

export interface DeploymentResult {
  network: string;
  timestamp: string;
  deployer: string;
  gasUsed: {
    total: bigint;
    breakdown: Record<string, bigint>;
  };
  contracts: {
    urnToken: {
      address: string;
      implementation?: string;
      txHash: string;
    };
    yieldFarm: {
      address: string;
      implementation?: string;
      txHash: string;
    };
    liquidityManager: {
      address: string;
      implementation?: string;
      txHash: string;
    };
    rewardDistributor: {
      address: string;
      implementation?: string;
      txHash: string;
    };
  };
  verification: {
    urnToken: boolean;
    yieldFarm: boolean;
    liquidityManager: boolean;
    rewardDistributor: boolean;
  };
}

export class DeploymentManager {
  private config: DeploymentConfig;
  private deploymentResult: Partial<DeploymentResult>;

  constructor(config: DeploymentConfig) {
    this.config = config;
    this.deploymentResult = {
      network: config.network,
      timestamp: new Date().toISOString(),
      gasUsed: { total: 0n, breakdown: {} },
      contracts: {},
      verification: {
        urnToken: false,
        yieldFarm: false,
        liquidityManager: false,
        rewardDistributor: false,
      },
    };
  }

  async deploy(): Promise<DeploymentResult> {
    console.log(`\n🚀 Starting deployment on ${this.config.network}...`);

    const [deployer] = await ethers.getSigners();
    this.deploymentResult.deployer = deployer.address;

    console.log(`Deployer address: ${deployer.address}`);
    console.log(`Deployer balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);

    try {
      // Deploy contracts in order
      const urnToken = await this.deployUrnToken();
      const yieldFarm = await this.deployYieldFarm(urnToken);
      const liquidityManager = await this.deployLiquidityManager();
      const rewardDistributor = await this.deployRewardDistributor(urnToken);

      // Setup contracts
      await this.setupContracts(urnToken, yieldFarm, rewardDistributor);

      // Verify contracts if enabled
      if (this.config.verification.enabled) {
        await this.verifyContracts();
      }

      // Save deployment result
      await this.saveDeploymentResult();

      console.log(`\n✅ Deployment completed successfully!`);
      console.log(`Total gas used: ${this.deploymentResult.gasUsed?.total}`);

      return this.deploymentResult as DeploymentResult;
    } catch (error) {
      console.error(`\n❌ Deployment failed:`, error);
      throw error;
    }
  }

  private async deployUrnToken(): Promise<Contract> {
    console.log(`\n📄 Deploying UrnToken...`);

    const UrnTokenFactory = await ethers.getContractFactory("UrnToken");
    const urnToken = await upgrades.deployProxy(
      UrnTokenFactory,
      [
        this.config.urnToken.name,
        this.config.urnToken.symbol,
        ethers.parseEther(this.config.urnToken.initialSupply),
        this.config.addresses.admin,
      ],
      {
        initializer: "initialize",
        kind: "uups",
      }
    );

    await urnToken.waitForDeployment();
    const deployTx = urnToken.deploymentTransaction();
    const receipt = await deployTx?.wait();

    const proxyAddress = await urnToken.getAddress();
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    this.deploymentResult.contracts!.urnToken = {
      address: proxyAddress,
      implementation: implementationAddress,
      txHash: deployTx?.hash || "",
    };

    this.recordGasUsage("UrnToken", receipt?.gasUsed || 0n);

    console.log(`✅ UrnToken deployed:`);
    console.log(`   Proxy: ${proxyAddress}`);
    console.log(`   Implementation: ${implementationAddress}`);
    console.log(`   Gas used: ${receipt?.gasUsed}`);

    return urnToken;
  }

  private async deployYieldFarm(urnToken: Contract): Promise<Contract> {
    console.log(`\n🌾 Deploying YieldFarm...`);

    const currentBlock = await ethers.provider.getBlockNumber();
    const startBlock = currentBlock + 10; // Start in 10 blocks
    const bonusEndBlock = startBlock + this.config.yieldFarm.bonusBlocks;

    const YieldFarmFactory = await ethers.getContractFactory("YieldFarm");
    const yieldFarm = await upgrades.deployProxy(
      YieldFarmFactory,
      [
        await urnToken.getAddress(),
        ethers.parseEther(this.config.yieldFarm.urnPerBlock),
        startBlock,
        bonusEndBlock,
        this.config.addresses.admin,
        this.config.addresses.feeRecipient,
      ],
      {
        initializer: "initialize",
        kind: "uups",
      }
    );

    await yieldFarm.waitForDeployment();
    const deployTx = yieldFarm.deploymentTransaction();
    const receipt = await deployTx?.wait();

    const proxyAddress = await yieldFarm.getAddress();
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    this.deploymentResult.contracts!.yieldFarm = {
      address: proxyAddress,
      implementation: implementationAddress,
      txHash: deployTx?.hash || "",
    };

    this.recordGasUsage("YieldFarm", receipt?.gasUsed || 0n);

    console.log(`✅ YieldFarm deployed:`);
    console.log(`   Proxy: ${proxyAddress}`);
    console.log(`   Implementation: ${implementationAddress}`);
    console.log(`   Start Block: ${startBlock}`);
    console.log(`   Bonus End Block: ${bonusEndBlock}`);
    console.log(`   Gas used: ${receipt?.gasUsed}`);

    return yieldFarm;
  }

  private async deployLiquidityManager(): Promise<Contract> {
    console.log(`\n💧 Deploying LiquidityManager...`);

    const LiquidityManagerFactory = await ethers.getContractFactory("LiquidityManager");
    const liquidityManager = await upgrades.deployProxy(
      LiquidityManagerFactory,
      [
        this.config.liquidityManager.positionManager,
        this.config.liquidityManager.swapRouter,
        this.config.liquidityManager.quoter,
        this.config.addresses.admin,
        this.config.addresses.feeRecipient,
      ],
      {
        initializer: "initialize",
        kind: "uups",
      }
    );

    await liquidityManager.waitForDeployment();
    const deployTx = liquidityManager.deploymentTransaction();
    const receipt = await deployTx?.wait();

    const proxyAddress = await liquidityManager.getAddress();
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    this.deploymentResult.contracts!.liquidityManager = {
      address: proxyAddress,
      implementation: implementationAddress,
      txHash: deployTx?.hash || "",
    };

    this.recordGasUsage("LiquidityManager", receipt?.gasUsed || 0n);

    console.log(`✅ LiquidityManager deployed:`);
    console.log(`   Proxy: ${proxyAddress}`);
    console.log(`   Implementation: ${implementationAddress}`);
    console.log(`   Gas used: ${receipt?.gasUsed}`);

    return liquidityManager;
  }

  private async deployRewardDistributor(urnToken: Contract): Promise<Contract> {
    console.log(`\n🎁 Deploying RewardDistributor...`);

    const currentTime = Math.floor(Date.now() / 1000);
    const startTime = currentTime + 300; // Start in 5 minutes
    const endTime = startTime + (this.config.rewardDistributor.durationDays * 24 * 60 * 60);

    const RewardDistributorFactory = await ethers.getContractFactory("RewardDistributor");
    const rewardDistributor = await upgrades.deployProxy(
      RewardDistributorFactory,
      [
        await urnToken.getAddress(),
        ethers.parseEther(this.config.rewardDistributor.rewardPerSecond),
        startTime,
        endTime,
        this.config.addresses.admin,
        this.config.addresses.treasury,
      ],
      {
        initializer: "initialize",
        kind: "uups",
      }
    );

    await rewardDistributor.waitForDeployment();
    const deployTx = rewardDistributor.deploymentTransaction();
    const receipt = await deployTx?.wait();

    const proxyAddress = await rewardDistributor.getAddress();
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    this.deploymentResult.contracts!.rewardDistributor = {
      address: proxyAddress,
      implementation: implementationAddress,
      txHash: deployTx?.hash || "",
    };

    this.recordGasUsage("RewardDistributor", receipt?.gasUsed || 0n);

    console.log(`✅ RewardDistributor deployed:`);
    console.log(`   Proxy: ${proxyAddress}`);
    console.log(`   Implementation: ${implementationAddress}`);
    console.log(`   Start Time: ${new Date(startTime * 1000).toISOString()}`);
    console.log(`   End Time: ${new Date(endTime * 1000).toISOString()}`);
    console.log(`   Gas used: ${receipt?.gasUsed}`);

    return rewardDistributor;
  }

  private async setupContracts(
    urnToken: Contract,
    yieldFarm: Contract,
    rewardDistributor: Contract
  ): Promise<void> {
    console.log(`\n⚙️  Setting up contracts...`);

    const [deployer] = await ethers.getSigners();

    try {
      // Grant minter roles
      console.log(`Granting minter role to YieldFarm...`);
      const minterRole = await urnToken.MINTER_ROLE();
      await urnToken.grantRole(minterRole, await yieldFarm.getAddress());

      console.log(`Granting minter role to RewardDistributor...`);
      await urnToken.grantRole(minterRole, await rewardDistributor.getAddress());

      // Set emergency withdraw fee if different from default
      if (this.config.yieldFarm.emergencyWithdrawFee !== 500) {
        console.log(`Setting emergency withdraw fee to ${this.config.yieldFarm.emergencyWithdrawFee} bps...`);
        await yieldFarm.updateEmergencyWithdrawFee(this.config.yieldFarm.emergencyWithdrawFee);
      }

      // Set management fee if different from default
      if (this.config.liquidityManager.managementFee !== 100) {
        console.log(`Setting management fee to ${this.config.liquidityManager.managementFee} bps...`);
        await (await ethers.getContractAt("LiquidityManager", this.deploymentResult.contracts!.liquidityManager!.address))
          .setManagementFee(this.config.liquidityManager.managementFee);
      }

      // Update reward parameters if different from defaults
      const rewardDistributorContract = await ethers.getContractAt(
        "RewardDistributor",
        this.deploymentResult.contracts!.rewardDistributor!.address
      );

      if (
        this.config.rewardDistributor.inflationRate !== 500 ||
        this.config.rewardDistributor.burnRate !== 1000 ||
        this.config.rewardDistributor.treasuryRate !== 2000
      ) {
        console.log(`Updating reward parameters...`);
        await rewardDistributorContract.updateRewardParameters(
          ethers.parseEther(this.config.rewardDistributor.rewardPerSecond),
          this.config.rewardDistributor.inflationRate,
          this.config.rewardDistributor.burnRate,
          this.config.rewardDistributor.treasuryRate
        );
      }

      console.log(`✅ Contract setup completed`);
    } catch (error) {
      console.error(`❌ Contract setup failed:`, error);
      throw error;
    }
  }

  private async verifyContracts(): Promise<void> {
    console.log(`\n🔍 Verifying contracts on ${this.config.network}...`);

    if (!this.config.verification.apiKey && this.config.network !== "localhost") {
      console.log(`⚠️  No API key provided, skipping verification`);
      return;
    }

    try {
      // Verify UrnToken implementation
      await this.verifyContract(
        "UrnToken",
        this.deploymentResult.contracts!.urnToken!.implementation!,
        []
      );

      // Verify YieldFarm implementation
      await this.verifyContract(
        "YieldFarm",
        this.deploymentResult.contracts!.yieldFarm!.implementation!,
        []
      );

      // Verify LiquidityManager implementation
      await this.verifyContract(
        "LiquidityManager",
        this.deploymentResult.contracts!.liquidityManager!.implementation!,
        []
      );

      // Verify RewardDistributor implementation
      await this.verifyContract(
        "RewardDistributor",
        this.deploymentResult.contracts!.rewardDistributor!.implementation!,
        []
      );

      console.log(`✅ All contracts verified successfully`);
    } catch (error) {
      console.error(`❌ Contract verification failed:`, error);
    }
  }

  private async verifyContract(name: string, address: string, constructorArguments: any[]): Promise<void> {
    try {
      console.log(`Verifying ${name} at ${address}...`);

      await run("verify:verify", {
        address,
        constructorArguments,
        contract: `contracts/${name}.sol:${name}`,
      });

      this.deploymentResult.verification![name.toLowerCase() as keyof typeof this.deploymentResult.verification] = true;
      console.log(`✅ ${name} verified`);
    } catch (error) {
      console.error(`❌ Failed to verify ${name}:`, error);
      this.deploymentResult.verification![name.toLowerCase() as keyof typeof this.deploymentResult.verification] = false;
    }
  }

  private recordGasUsage(contractName: string, gasUsed: bigint): void {
    if (!this.deploymentResult.gasUsed) {
      this.deploymentResult.gasUsed = { total: 0n, breakdown: {} };
    }
    this.deploymentResult.gasUsed.breakdown[contractName] = gasUsed;
    this.deploymentResult.gasUsed.total += gasUsed;
  }

  private async saveDeploymentResult(): Promise<void> {
    const deploymentDir = path.join(__dirname, "../../deployments");
    if (!fs.existsSync(deploymentDir)) {
      fs.mkdirSync(deploymentDir, { recursive: true });
    }

    const filename = `${this.config.network}-${Date.now()}.json`;
    const filepath = path.join(deploymentDir, filename);

    // Convert BigInt to string for JSON serialization
    const serializable = JSON.parse(
      JSON.stringify(this.deploymentResult, (key, value) =>
        typeof value === "bigint" ? value.toString() : value
      )
    );

    fs.writeFileSync(filepath, JSON.stringify(serializable, null, 2));

    // Also save as latest
    const latestPath = path.join(deploymentDir, `${this.config.network}-latest.json`);
    fs.writeFileSync(latestPath, JSON.stringify(serializable, null, 2));

    console.log(`💾 Deployment result saved to ${filepath}`);
  }

  // Utility methods
  static loadConfig(network: string): DeploymentConfig {
    const configPath = path.join(__dirname, "../config", `${network}.json`);
    if (!fs.existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  }

  static async estimateDeploymentCost(config: DeploymentConfig): Promise<{
    totalCost: bigint;
    breakdown: Record<string, bigint>;
  }> {
    console.log(`📊 Estimating deployment costs for ${config.network}...`);

    const [deployer] = await ethers.getSigners();
    const gasPrice = (await ethers.provider.getFeeData()).gasPrice || 0n;

    // Estimate gas for each contract (these are rough estimates)
    const gasEstimates = {
      UrnToken: 2000000n,
      YieldFarm: 3000000n,
      LiquidityManager: 2500000n,
      RewardDistributor: 2800000n,
      Setup: 500000n, // For role grants and configuration
    };

    const breakdown: Record<string, bigint> = {};
    let totalGas = 0n;

    for (const [contract, gas] of Object.entries(gasEstimates)) {
      const cost = gas * gasPrice;
      breakdown[contract] = cost;
      totalGas += gas;
    }

    const totalCost = totalGas * gasPrice;

    console.log(`Estimated costs:`);
    for (const [contract, cost] of Object.entries(breakdown)) {
      console.log(`  ${contract}: ${ethers.formatEther(cost)} ETH`);
    }
    console.log(`  Total: ${ethers.formatEther(totalCost)} ETH`);

    return { totalCost, breakdown };
  }
}