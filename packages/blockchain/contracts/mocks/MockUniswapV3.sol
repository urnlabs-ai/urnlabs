// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title MockUniswapV3Pool
 * @dev Mock Uniswap V3 pool for testing purposes
 */
contract MockUniswapV3Pool {
    using SafeERC20 for IERC20;

    address public token0;
    address public token1;
    uint24 public fee;
    int24 public tickSpacing;
    
    struct Slot0 {
        uint160 sqrtPriceX96;
        int24 tick;
        uint16 observationIndex;
        uint16 observationCardinality;
        uint16 observationCardinalityNext;
        uint8 feeProtocol;
        bool unlocked;
    }

    Slot0 public slot0;

    constructor(
        address _token0,
        address _token1,
        uint24 _fee
    ) {
        token0 = _token0;
        token1 = _token1;
        fee = _fee;
        tickSpacing = _fee == 500 ? int24(10) : _fee == 3000 ? int24(60) : int24(200);
        
        // Set initial price (1:1 ratio)
        slot0 = Slot0({
            sqrtPriceX96: 79228162514264337593543950336, // sqrt(1) * 2^96
            tick: 0,
            observationIndex: 0,
            observationCardinality: 1,
            observationCardinalityNext: 1,
            feeProtocol: 0,
            unlocked: true
        });
    }

    function setTick(int24 _tick) external {
        slot0.tick = _tick;
        // Update sqrtPriceX96 based on tick (simplified)
        slot0.sqrtPriceX96 = uint160(79228162514264337593543950336); // Keep at 1:1 for simplicity
    }
}

/**
 * @title MockNonfungiblePositionManager
 * @dev Mock Uniswap V3 Position Manager for testing purposes
 */
contract MockNonfungiblePositionManager {
    using SafeERC20 for IERC20;

    struct Position {
        uint96 nonce;
        address operator;
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint256 feeGrowthInside0LastX128;
        uint256 feeGrowthInside1LastX128;
        uint128 tokensOwed0;
        uint128 tokensOwed1;
    }

    mapping(uint256 => Position) public positions;
    uint256 private nextTokenId = 1;

    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    struct DecreaseLiquidityParams {
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function mint(MintParams calldata params)
        external
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        )
    {
        require(block.timestamp <= params.deadline, "Transaction too old");

        tokenId = nextTokenId++;
        
        // Simplified liquidity calculation
        liquidity = uint128((params.amount0Desired + params.amount1Desired) / 2);
        amount0 = params.amount0Desired;
        amount1 = params.amount1Desired;

        // Transfer tokens
        IERC20(params.token0).safeTransferFrom(msg.sender, address(this), amount0);
        IERC20(params.token1).safeTransferFrom(msg.sender, address(this), amount1);

        positions[tokenId] = Position({
            nonce: 0,
            operator: address(0),
            token0: params.token0,
            token1: params.token1,
            fee: params.fee,
            tickLower: params.tickLower,
            tickUpper: params.tickUpper,
            liquidity: liquidity,
            feeGrowthInside0LastX128: 0,
            feeGrowthInside1LastX128: 0,
            tokensOwed0: 0,
            tokensOwed1: 0
        });
    }

    function decreaseLiquidity(DecreaseLiquidityParams calldata params)
        external
        returns (uint256 amount0, uint256 amount1)
    {
        require(block.timestamp <= params.deadline, "Transaction too old");
        
        Position storage position = positions[params.tokenId];
        require(position.liquidity >= params.liquidity, "Insufficient liquidity");

        // Simplified calculation
        amount0 = (uint256(params.liquidity) * 1e18) / uint256(position.liquidity);
        amount1 = amount0; // Simplified 1:1 ratio

        position.liquidity -= params.liquidity;
        position.tokensOwed0 += uint128(amount0);
        position.tokensOwed1 += uint128(amount1);
    }

    function collect(CollectParams calldata params)
        external
        returns (uint256 amount0, uint256 amount1)
    {
        Position storage position = positions[params.tokenId];
        
        amount0 = position.tokensOwed0;
        amount1 = position.tokensOwed1;

        // Add some mock fees (1% of collected amount)
        uint256 fees0 = amount0 / 100;
        uint256 fees1 = amount1 / 100;
        
        amount0 += fees0;
        amount1 += fees1;

        // Transfer tokens
        IERC20(position.token0).safeTransfer(params.recipient, amount0);
        IERC20(position.token1).safeTransfer(params.recipient, amount1);

        // Reset owed amounts
        position.tokensOwed0 = 0;
        position.tokensOwed1 = 0;
    }

    function burn(uint256 tokenId) external {
        Position storage position = positions[tokenId];
        require(position.liquidity == 0, "Not empty");
        delete positions[tokenId];
    }
}

/**
 * @title MockSwapRouter
 * @dev Mock Uniswap V3 Swap Router for testing purposes
 */
contract MockSwapRouter {
    using SafeERC20 for IERC20;

    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        returns (uint256 amountOut)
    {
        require(block.timestamp <= params.deadline, "Transaction too old");

        // Simplified 1:1 swap for testing
        amountOut = params.amountIn;
        require(amountOut >= params.amountOutMinimum, "Too little received");

        IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), params.amountIn);
        IERC20(params.tokenOut).safeTransfer(params.recipient, amountOut);
    }
}

/**
 * @title MockQuoter
 * @dev Mock Uniswap V3 Quoter for testing purposes
 */
contract MockQuoter {
    function quoteExactInputSingle(
        address,
        address,
        uint24,
        uint256 amountIn,
        uint160
    ) external pure returns (uint256 amountOut) {
        // Simplified 1:1 quote for testing
        amountOut = amountIn;
    }
}