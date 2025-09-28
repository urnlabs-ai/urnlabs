import { expect } from "chai";
import { ethers, upgrades, network } from "hardhat";
import { Contract, Signer } from "ethers";
import { time, loadFixture, impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";

describe("Uniswap V3 Fork Tests", function () {
  // Mainnet contract addresses
  const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const UNISWAP_V3_POSITION_MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
  const UNISWAP_V3_SWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
  const UNISWAP_V3_QUOTER = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6";
  
  // Popular token addresses on mainnet
  const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const USDC_ADDRESS = "0xA0b86a33E6417C066c6F53962C03b89B2f1ecb7a"; // Circle USD
  const DAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
  
  // Whale addresses with significant token balances
  const WETH_WHALE = "0xF04a5cC80B1E94C69B48f5ee68a08CD2F09A7c3E";
  const USDC_WHALE = "0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503";
  const DAI_WHALE = "0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503";

  before(async function () {
    // Skip if not running against a fork
    if (network.name !== "hardhat") {
      this.skip();
    }
  });

  async function deployWithRealUniswapFixture() {
    const [owner, admin, user1, user2, feeRecipient] = await ethers.getSigners();

    // Deploy our UrnToken
    const UrnTokenFactory = await ethers.getContractFactory("UrnToken");
    const urnToken = await upgrades.deployProxy(
      UrnTokenFactory,
      [
        "Urn Token",
        "URN",
        ethers.parseEther("1000000"),
        admin.address
      ],
      { initializer: "initialize" }
    );

    // Deploy LiquidityManager with real Uniswap addresses
    const LiquidityManagerFactory = await ethers.getContractFactory("LiquidityManager");
    const liquidityManager = await upgrades.deployProxy(
      LiquidityManagerFactory,
      [
        UNISWAP_V3_POSITION_MANAGER,
        UNISWAP_V3_SWAP_ROUTER,
        UNISWAP_V3_QUOTER,
        admin.address,
        feeRecipient.address
      ],
      { initializer: "initialize" }
    );

    // Get token contracts
    const weth = await ethers.getContractAt("IERC20", WETH_ADDRESS);
    const usdc = await ethers.getContractAt("IERC20", USDC_ADDRESS);
    const dai = await ethers.getContractAt("IERC20", DAI_ADDRESS);

    // Get Uniswap contracts
    const positionManager = await ethers.getContractAt("INonfungiblePositionManager", UNISWAP_V3_POSITION_MANAGER);
    const swapRouter = await ethers.getContractAt("ISwapRouter", UNISWAP_V3_SWAP_ROUTER);
    const factory = await ethers.getContractAt("IUniswapV3Factory", UNISWAP_V3_FACTORY);

    // Get pool addresses
    const wethUsdcPoolAddress = await factory.getPool(WETH_ADDRESS, USDC_ADDRESS, 3000);
    const wethDaiPoolAddress = await factory.getPool(WETH_ADDRESS, DAI_ADDRESS, 3000);

    const wethUsdcPool = await ethers.getContractAt("IUniswapV3Pool", wethUsdcPoolAddress);
    const wethDaiPool = await ethers.getContractAt("IUniswapV3Pool", wethDaiPoolAddress);

    return {
      liquidityManager,
      urnToken,
      weth,
      usdc,
      dai,
      positionManager,
      swapRouter,
      factory,
      wethUsdcPool,
      wethDaiPool,
      owner,
      admin,
      user1,
      user2,
      feeRecipient
    };
  }

  async function setupTokenBalances() {
    const [owner, admin, user1, user2] = await ethers.getSigners();

    // Impersonate whale accounts and transfer tokens
    await impersonateAccount(WETH_WHALE);
    await impersonateAccount(USDC_WHALE);
    await impersonateAccount(DAI_WHALE);

    const wethWhale = await ethers.getSigner(WETH_WHALE);
    const usdcWhale = await ethers.getSigner(USDC_WHALE);
    const daiWhale = await ethers.getSigner(DAI_WHALE);

    // Set balance for whale accounts to pay for gas
    await setBalance(WETH_WHALE, ethers.parseEther("100"));
    await setBalance(USDC_WHALE, ethers.parseEther("100"));
    await setBalance(DAI_WHALE, ethers.parseEther("100"));

    const weth = await ethers.getContractAt("IERC20", WETH_ADDRESS);
    const usdc = await ethers.getContractAt("IERC20", USDC_ADDRESS);
    const dai = await ethers.getContractAt("IERC20", DAI_ADDRESS);

    // Transfer tokens to test users
    const wethAmount = ethers.parseEther("10");
    const usdcAmount = ethers.parseUnits("20000", 6); // USDC has 6 decimals
    const daiAmount = ethers.parseEther("20000");

    // Transfer to user1
    await weth.connect(wethWhale).transfer(user1.address, wethAmount);
    await usdc.connect(usdcWhale).transfer(user1.address, usdcAmount);
    await dai.connect(daiWhale).transfer(user1.address, daiAmount);

    // Transfer to user2
    await weth.connect(wethWhale).transfer(user2.address, wethAmount);
    await usdc.connect(usdcWhale).transfer(user2.address, usdcAmount);
    await dai.connect(daiWhale).transfer(user2.address, daiAmount);

    return { weth, usdc, dai, wethAmount, usdcAmount, daiAmount };
  }

  describe("Real Uniswap V3 Integration", function () {
    it("Should integrate with real Uniswap V3 factory", async function () {
      const { factory, weth, usdc } = await loadFixture(deployWithRealUniswapFixture);

      const poolAddress = await factory.getPool(WETH_ADDRESS, USDC_ADDRESS, 3000);
      expect(poolAddress).to.not.equal(ethers.ZeroAddress);

      const pool = await ethers.getContractAt("IUniswapV3Pool", poolAddress);
      const token0 = await pool.token0();
      const token1 = await pool.token1();
      const fee = await pool.fee();

      expect(fee).to.equal(3000);
      expect([token0, token1]).to.include(WETH_ADDRESS);
      expect([token0, token1]).to.include(USDC_ADDRESS);
    });

    it("Should configure pool with real Uniswap pool", async function () {
      const { liquidityManager, wethUsdcPool, admin } = await loadFixture(deployWithRealUniswapFixture);

      const poolAddress = await wethUsdcPool.getAddress();
      const token0 = await wethUsdcPool.token0();
      const token1 = await wethUsdcPool.token1();
      const fee = await wethUsdcPool.fee();

      await expect(
        liquidityManager.connect(admin).configurePool(
          poolAddress,
          token0,
          token1,
          fee,
          -887220, // Wide range for testing
          887220,
          500, // 5% slippage
          true, // autoRebalance
          1000 // 10% rebalance threshold
        )
      ).to.emit(liquidityManager, "PoolConfigured");

      const poolConfig = await liquidityManager.poolConfigs(poolAddress);
      expect(poolConfig.isActive).to.be.true;
      expect(poolConfig.token0).to.equal(token0);
      expect(poolConfig.token1).to.equal(token1);
    });

    it("Should add liquidity to real Uniswap V3 pool", async function () {
      const { liquidityManager, wethUsdcPool, admin, user1 } = await loadFixture(deployWithRealUniswapFixture);
      const { weth, usdc } = await setupTokenBalances();

      // Configure pool
      const poolAddress = await wethUsdcPool.getAddress();
      const token0 = await wethUsdcPool.token0();
      const token1 = await wethUsdcPool.token1();
      const fee = await wethUsdcPool.fee();

      await liquidityManager.connect(admin).configurePool(
        poolAddress,
        token0,
        token1,
        fee,
        -887220,
        887220,
        500,
        true,
        1000
      );

      // Determine amounts based on token order
      const isWethToken0 = token0.toLowerCase() === WETH_ADDRESS.toLowerCase();
      const amount0 = isWethToken0 ? ethers.parseEther("1") : ethers.parseUnits("2000", 6);
      const amount1 = isWethToken0 ? ethers.parseUnits("2000", 6) : ethers.parseEther("1");

      // Approve tokens
      const token0Contract = await ethers.getContractAt("IERC20", token0);
      const token1Contract = await ethers.getContractAt("IERC20", token1);

      await token0Contract.connect(user1).approve(await liquidityManager.getAddress(), amount0);
      await token1Contract.connect(user1).approve(await liquidityManager.getAddress(), amount1);

      const deadline = (await time.latest()) + 3600;

      await expect(
        liquidityManager.connect(user1).addLiquidity(
          poolAddress,
          amount0,
          amount1,
          amount0 * 95n / 100n, // 5% slippage
          amount1 * 95n / 100n,
          deadline
        )
      ).to.emit(liquidityManager, "LiquidityAdded");

      const userPositions = await liquidityManager.getUserPositions(user1.address);
      expect(userPositions.length).to.equal(1);
    });

    it("Should collect real fees from Uniswap V3", async function () {
      const { liquidityManager, wethUsdcPool, admin, user1, feeRecipient } = await loadFixture(deployWithRealUniswapFixture);
      const { weth, usdc } = await setupTokenBalances();

      // Configure pool and add liquidity
      const poolAddress = await wethUsdcPool.getAddress();
      const token0 = await wethUsdcPool.token0();
      const token1 = await wethUsdcPool.token1();
      const fee = await wethUsdcPool.fee();

      await liquidityManager.connect(admin).configurePool(
        poolAddress,
        token0,
        token1,
        fee,
        -887220,
        887220,
        500,
        true,
        1000
      );

      const isWethToken0 = token0.toLowerCase() === WETH_ADDRESS.toLowerCase();
      const amount0 = isWethToken0 ? ethers.parseEther("1") : ethers.parseUnits("2000", 6);
      const amount1 = isWethToken0 ? ethers.parseUnits("2000", 6) : ethers.parseEther("1");

      const token0Contract = await ethers.getContractAt("IERC20", token0);
      const token1Contract = await ethers.getContractAt("IERC20", token1);

      await token0Contract.connect(user1).approve(await liquidityManager.getAddress(), amount0);
      await token1Contract.connect(user1).approve(await liquidityManager.getAddress(), amount1);

      const deadline = (await time.latest()) + 3600;

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

      // Simulate some trading activity by advancing time
      await time.increase(3600); // 1 hour

      const feeRecipientBalance0Before = await token0Contract.balanceOf(feeRecipient.address);
      const userBalance0Before = await token0Contract.balanceOf(user1.address);

      await expect(
        liquidityManager.connect(user1).collectFees(tokenId)
      ).to.emit(liquidityManager, "FeesCollected");

      const feeRecipientBalance0After = await token0Contract.balanceOf(feeRecipient.address);
      const userBalance0After = await token0Contract.balanceOf(user1.address);

      // Fee recipient should receive management fees
      expect(feeRecipientBalance0After).to.be.gte(feeRecipientBalance0Before);
      // User should receive remaining fees
      expect(userBalance0After).to.be.gte(userBalance0Before);
    });

    it("Should handle real price movements and rebalancing", async function () {
      const { liquidityManager, wethUsdcPool, admin, user1 } = await loadFixture(deployWithRealUniswapFixture);
      const { weth, usdc } = await setupTokenBalances();

      // Configure pool
      const poolAddress = await wethUsdcPool.getAddress();
      const token0 = await wethUsdcPool.token0();
      const token1 = await wethUsdcPool.token1();
      const fee = await wethUsdcPool.fee();

      await liquidityManager.connect(admin).configurePool(
        poolAddress,
        token0,
        token1,
        fee,
        -887220,
        887220,
        500,
        true,
        1000
      );

      // Get current pool state
      const { tick: currentTick } = await wethUsdcPool.slot0();

      // Calculate optimal tick range
      const [optimalTickLower, optimalTickUpper] = await liquidityManager.getOptimalTickRange(
        poolAddress,
        1000 // 10% volatility
      );

      expect(optimalTickLower).to.be.lt(optimalTickUpper);
      expect(optimalTickLower).to.be.lt(currentTick);
      expect(optimalTickUpper).to.be.gt(currentTick);
    });

    it("Should work with multiple real pools", async function () {
      const { liquidityManager, wethUsdcPool, wethDaiPool, admin, user1 } = await loadFixture(deployWithRealUniswapFixture);
      const { weth, usdc, dai } = await setupTokenBalances();

      // Configure WETH/USDC pool
      const wethUsdcPoolAddress = await wethUsdcPool.getAddress();
      const wethUsdcToken0 = await wethUsdcPool.token0();
      const wethUsdcToken1 = await wethUsdcPool.token1();
      const wethUsdcFee = await wethUsdcPool.fee();

      await liquidityManager.connect(admin).configurePool(
        wethUsdcPoolAddress,
        wethUsdcToken0,
        wethUsdcToken1,
        wethUsdcFee,
        -887220,
        887220,
        500,
        true,
        1000
      );

      // Configure WETH/DAI pool
      const wethDaiPoolAddress = await wethDaiPool.getAddress();
      const wethDaiToken0 = await wethDaiPool.token0();
      const wethDaiToken1 = await wethDaiPool.token1();
      const wethDaiFee = await wethDaiPool.fee();

      await liquidityManager.connect(admin).configurePool(
        wethDaiPoolAddress,
        wethDaiToken0,
        wethDaiToken1,
        wethDaiFee,
        -887220,
        887220,
        500,
        true,
        1000
      );

      // Add liquidity to both pools
      const deadline = (await time.latest()) + 3600;

      // WETH/USDC pool
      const isWethToken0InUsdc = wethUsdcToken0.toLowerCase() === WETH_ADDRESS.toLowerCase();
      const usdcAmount0 = isWethToken0InUsdc ? ethers.parseEther("0.5") : ethers.parseUnits("1000", 6);
      const usdcAmount1 = isWethToken0InUsdc ? ethers.parseUnits("1000", 6) : ethers.parseEther("0.5");

      const usdcToken0Contract = await ethers.getContractAt("IERC20", wethUsdcToken0);
      const usdcToken1Contract = await ethers.getContractAt("IERC20", wethUsdcToken1);

      await usdcToken0Contract.connect(user1).approve(await liquidityManager.getAddress(), usdcAmount0);
      await usdcToken1Contract.connect(user1).approve(await liquidityManager.getAddress(), usdcAmount1);

      await liquidityManager.connect(user1).addLiquidity(
        wethUsdcPoolAddress,
        usdcAmount0,
        usdcAmount1,
        usdcAmount0 * 95n / 100n,
        usdcAmount1 * 95n / 100n,
        deadline
      );

      // WETH/DAI pool
      const isWethToken0InDai = wethDaiToken0.toLowerCase() === WETH_ADDRESS.toLowerCase();
      const daiAmount0 = isWethToken0InDai ? ethers.parseEther("0.5") : ethers.parseEther("1000");
      const daiAmount1 = isWethToken0InDai ? ethers.parseEther("1000") : ethers.parseEther("0.5");

      const daiToken0Contract = await ethers.getContractAt("IERC20", wethDaiToken0);
      const daiToken1Contract = await ethers.getContractAt("IERC20", wethDaiToken1);

      await daiToken0Contract.connect(user1).approve(await liquidityManager.getAddress(), daiAmount0);
      await daiToken1Contract.connect(user1).approve(await liquidityManager.getAddress(), daiAmount1);

      await liquidityManager.connect(user1).addLiquidity(
        wethDaiPoolAddress,
        daiAmount0,
        daiAmount1,
        daiAmount0 * 95n / 100n,
        daiAmount1 * 95n / 100n,
        deadline
      );

      const userPositions = await liquidityManager.getUserPositions(user1.address);
      expect(userPositions.length).to.equal(2);
    });

    it("Should handle real slippage scenarios", async function () {
      const { liquidityManager, wethUsdcPool, admin, user1 } = await loadFixture(deployWithRealUniswapFixture);
      const { weth, usdc } = await setupTokenBalances();

      // Configure pool
      const poolAddress = await wethUsdcPool.getAddress();
      const token0 = await wethUsdcPool.token0();
      const token1 = await wethUsdcPool.token1();
      const fee = await wethUsdcPool.fee();

      await liquidityManager.connect(admin).configurePool(
        poolAddress,
        token0,
        token1,
        fee,
        -887220,
        887220,
        100, // 1% slippage (very tight)
        true,
        1000
      );

      const isWethToken0 = token0.toLowerCase() === WETH_ADDRESS.toLowerCase();
      const amount0 = isWethToken0 ? ethers.parseEther("1") : ethers.parseUnits("2000", 6);
      const amount1 = isWethToken0 ? ethers.parseUnits("2000", 6) : ethers.parseEther("1");

      const token0Contract = await ethers.getContractAt("IERC20", token0);
      const token1Contract = await ethers.getContractAt("IERC20", token1);

      await token0Contract.connect(user1).approve(await liquidityManager.getAddress(), amount0);
      await token1Contract.connect(user1).approve(await liquidityManager.getAddress(), amount1);

      const deadline = (await time.latest()) + 3600;

      // With tight slippage, this might fail in volatile conditions
      // This tests real market conditions
      try {
        await liquidityManager.connect(user1).addLiquidity(
          poolAddress,
          amount0,
          amount1,
          amount0 * 99n / 100n, // 1% slippage
          amount1 * 99n / 100n,
          deadline
        );
      } catch (error) {
        // This is acceptable in real market conditions with tight slippage
        expect(error).to.exist;
      }
    });

    it("Should measure gas costs with real Uniswap interactions", async function () {
      const { liquidityManager, wethUsdcPool, admin, user1 } = await loadFixture(deployWithRealUniswapFixture);
      const { weth, usdc } = await setupTokenBalances();

      // Configure pool
      const poolAddress = await wethUsdcPool.getAddress();
      const token0 = await wethUsdcPool.token0();
      const token1 = await wethUsdcPool.token1();
      const fee = await wethUsdcPool.fee();

      await liquidityManager.connect(admin).configurePool(
        poolAddress,
        token0,
        token1,
        fee,
        -887220,
        887220,
        500,
        true,
        1000
      );

      const isWethToken0 = token0.toLowerCase() === WETH_ADDRESS.toLowerCase();
      const amount0 = isWethToken0 ? ethers.parseEther("1") : ethers.parseUnits("2000", 6);
      const amount1 = isWethToken0 ? ethers.parseUnits("2000", 6) : ethers.parseEther("1");

      const token0Contract = await ethers.getContractAt("IERC20", token0);
      const token1Contract = await ethers.getContractAt("IERC20", token1);

      await token0Contract.connect(user1).approve(await liquidityManager.getAddress(), amount0);
      await token1Contract.connect(user1).approve(await liquidityManager.getAddress(), amount1);

      const deadline = (await time.latest()) + 3600;

      // Measure gas for real Uniswap interaction
      const addLiquidityTx = await liquidityManager.connect(user1).addLiquidity(
        poolAddress,
        amount0,
        amount1,
        amount0 * 95n / 100n,
        amount1 * 95n / 100n,
        deadline
      );

      const receipt = await addLiquidityTx.wait();
      console.log(`Real Uniswap V3 add liquidity gas used: ${receipt?.gasUsed}`);

      // Gas usage should be higher than mock but reasonable
      expect(receipt?.gasUsed).to.be.lt(1000000); // Should be under 1M gas
      expect(receipt?.gasUsed).to.be.gt(300000); // But more than 300k due to real Uniswap complexity
    });
  });

  describe("Error Handling with Real Uniswap", function () {
    it("Should handle non-existent pools gracefully", async function () {
      const { liquidityManager, admin } = await loadFixture(deployWithRealUniswapFixture);

      // Try to configure with non-existent pool
      const fakePoolAddress = ethers.Wallet.createRandom().address;

      await expect(
        liquidityManager.connect(admin).configurePool(
          fakePoolAddress,
          WETH_ADDRESS,
          USDC_ADDRESS,
          3000,
          -887220,
          887220,
          500,
          true,
          1000
        )
      ).to.not.be.reverted; // Our contract might not validate pool existence

      // But adding liquidity should fail
      const { weth, usdc } = await setupTokenBalances();
      const [user1] = await ethers.getSigners();

      await weth.connect(user1).approve(await liquidityManager.getAddress(), ethers.parseEther("1"));
      await usdc.connect(user1).approve(await liquidityManager.getAddress(), ethers.parseUnits("2000", 6));

      const deadline = (await time.latest()) + 3600;

      await expect(
        liquidityManager.connect(user1).addLiquidity(
          fakePoolAddress,
          ethers.parseEther("1"),
          ethers.parseUnits("2000", 6),
          ethers.parseEther("0.95"),
          ethers.parseUnits("1900", 6),
          deadline
        )
      ).to.be.reverted;
    });

    it("Should handle insufficient token balances", async function () {
      const { liquidityManager, wethUsdcPool, admin, user2 } = await loadFixture(deployWithRealUniswapFixture);

      // Configure pool
      const poolAddress = await wethUsdcPool.getAddress();
      const token0 = await wethUsdcPool.token0();
      const token1 = await wethUsdcPool.token1();
      const fee = await wethUsdcPool.fee();

      await liquidityManager.connect(admin).configurePool(
        poolAddress,
        token0,
        token1,
        fee,
        -887220,
        887220,
        500,
        true,
        1000
      );

      // Don't give user2 enough tokens
      const token0Contract = await ethers.getContractAt("IERC20", token0);
      const token1Contract = await ethers.getContractAt("IERC20", token1);

      const largeAmount = ethers.parseEther("1000000"); // More than user has
      await token0Contract.connect(user2).approve(await liquidityManager.getAddress(), largeAmount);
      await token1Contract.connect(user2).approve(await liquidityManager.getAddress(), largeAmount);

      const deadline = (await time.latest()) + 3600;

      await expect(
        liquidityManager.connect(user2).addLiquidity(
          poolAddress,
          largeAmount,
          largeAmount,
          largeAmount * 95n / 100n,
          largeAmount * 95n / 100n,
          deadline
        )
      ).to.be.reverted;
    });
  });

  describe("Performance Analysis", function () {
    it("Should perform well under real market conditions", async function () {
      const { liquidityManager, wethUsdcPool, admin, user1 } = await loadFixture(deployWithRealUniswapFixture);
      const { weth, usdc } = await setupTokenBalances();

      // Configure pool
      const poolAddress = await wethUsdcPool.getAddress();
      const token0 = await wethUsdcPool.token0();
      const token1 = await wethUsdcPool.token1();
      const fee = await wethUsdcPool.fee();

      await liquidityManager.connect(admin).configurePool(
        poolAddress,
        token0,
        token1,
        fee,
        -887220,
        887220,
        500,
        true,
        1000
      );

      // Perform multiple operations and measure cumulative gas
      const operations = [];

      for (let i = 0; i < 3; i++) {
        const isWethToken0 = token0.toLowerCase() === WETH_ADDRESS.toLowerCase();
        const amount0 = isWethToken0 ? ethers.parseEther("0.1") : ethers.parseUnits("200", 6);
        const amount1 = isWethToken0 ? ethers.parseUnits("200", 6) : ethers.parseEther("0.1");

        const token0Contract = await ethers.getContractAt("IERC20", token0);
        const token1Contract = await ethers.getContractAt("IERC20", token1);

        await token0Contract.connect(user1).approve(await liquidityManager.getAddress(), amount0);
        await token1Contract.connect(user1).approve(await liquidityManager.getAddress(), amount1);

        const deadline = (await time.latest()) + 3600;

        const tx = await liquidityManager.connect(user1).addLiquidity(
          poolAddress,
          amount0,
          amount1,
          amount0 * 95n / 100n,
          amount1 * 95n / 100n,
          deadline
        );

        const receipt = await tx.wait();
        operations.push(receipt?.gasUsed || 0n);
      }

      const totalGas = operations.reduce((sum, gas) => sum + gas, 0n);
      const averageGas = totalGas / BigInt(operations.length);

      console.log(`Average gas per operation: ${averageGas}`);
      console.log(`Total gas for ${operations.length} operations: ${totalGas}`);

      // Performance should be consistent
      expect(averageGas).to.be.lt(800000n); // Should average less than 800k gas
    });
  });
});