import { ethers, network } from "hardhat";
import { DeploymentManager } from "./deploy/DeploymentManager";

async function main() {
  console.log(`🌐 Deploying to network: ${network.name}`);

  // Load network-specific configuration
  const config = DeploymentManager.loadConfig(network.name);

  // Check deployer balance
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 Deployer balance: ${ethers.formatEther(balance)} ETH`);

  // Estimate deployment cost
  const { totalCost } = await DeploymentManager.estimateDeploymentCost(config);
  
  if (balance < totalCost) {
    console.error(`❌ Insufficient balance. Required: ${ethers.formatEther(totalCost)} ETH`);
    process.exit(1);
  }

  // Create deployment manager and deploy
  const deploymentManager = new DeploymentManager(config);
  const result = await deploymentManager.deploy();

  console.log(`\n🎉 Deployment Summary:`);
  console.log(`Network: ${result.network}`);
  console.log(`Deployer: ${result.deployer}`);
  console.log(`Total Gas Used: ${result.gasUsed.total}`);
  console.log(`\nContract Addresses:`);
  console.log(`UrnToken: ${result.contracts.urnToken.address}`);
  console.log(`YieldFarm: ${result.contracts.yieldFarm.address}`);
  console.log(`LiquidityManager: ${result.contracts.liquidityManager.address}`);
  console.log(`RewardDistributor: ${result.contracts.rewardDistributor.address}`);

  console.log(`\nVerification Status:`);
  console.log(`UrnToken: ${result.verification.urnToken ? '✅' : '❌'}`);
  console.log(`YieldFarm: ${result.verification.yieldFarm ? '✅' : '❌'}`);
  console.log(`LiquidityManager: ${result.verification.liquidityManager ? '✅' : '❌'}`);
  console.log(`RewardDistributor: ${result.verification.rewardDistributor ? '✅' : '❌'}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });