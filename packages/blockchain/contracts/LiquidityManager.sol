// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "./UrnToken.sol";

/**
 * @title LiquidityManager
 * @dev Automated liquidity management for Uniswap V3 pools
 * @author Urnlabs Team
 */
contract LiquidityManager is
    Initializable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    struct PoolConfig {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 maxSlippage; // In basis points (100 = 1%)
        bool isActive;
        bool autoRebalance;
        uint256 rebalanceThreshold; // Price deviation threshold for rebalancing
    }

    struct LiquidityPosition {
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0;
        uint256 amount1;
        uint256 fees0;
        uint256 fees1;
        uint256 lastRebalance;
        address owner;
    }

    struct RebalanceParams {
        int24 newTickLower;
        int24 newTickUpper;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    // Uniswap V3 contracts
    INonfungiblePositionManager public positionManager;
    ISwapRouter public swapRouter;
    IQuoter public quoter;

    // Pool configurations
    mapping(address => PoolConfig) public poolConfigs; // pool address => config
    mapping(uint256 => LiquidityPosition) public positions; // tokenId => position
    mapping(address => uint256[]) public userPositions; // user => tokenIds
    mapping(address => bool) public supportedTokens;

    // Price feeds
    mapping(address => AggregatorV3Interface) public priceFeeds;

    // Performance tracking
    mapping(address => uint256) public totalFeesCollected;
    mapping(address => uint256) public totalLiquidityProvided;

    // Settings
    uint256 public managementFee; // Fee in basis points for automated management
    address public feeRecipient;
    uint256 public minLiquidityAmount;
    uint256 public maxPositionsPerUser;

    // Events
    event LiquidityAdded(
        address indexed user,
        address indexed pool,
        uint256 tokenId,
        uint128 liquidity,
        uint256 amount0,
        uint256 amount1
    );

    event LiquidityRemoved(
        address indexed user,
        address indexed pool,
        uint256 tokenId,
        uint128 liquidity,
        uint256 amount0,
        uint256 amount1
    );

    event FeesCollected(
        address indexed user,
        uint256 tokenId,
        uint256 amount0,
        uint256 amount1
    );

    event PositionRebalanced(
        uint256 indexed tokenId,
        int24 oldTickLower,
        int24 oldTickUpper,
        int24 newTickLower,
        int24 newTickUpper
    );

    event PoolConfigured(
        address indexed pool,
        address token0,
        address token1,
        uint24 fee,
        int24 tickLower,
        int24 tickUpper
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _positionManager,
        address _swapRouter,
        address _quoter,
        address _admin,
        address _feeRecipient
    ) public initializer {
        __ReentrancyGuard_init();
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        require(_positionManager != address(0), "Invalid position manager");
        require(_swapRouter != address(0), "Invalid swap router");
        require(_quoter != address(0), "Invalid quoter");
        require(_feeRecipient != address(0), "Invalid fee recipient");

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _admin);
        _grantRole(UPGRADER_ROLE, _admin);

        positionManager = INonfungiblePositionManager(_positionManager);
        swapRouter = ISwapRouter(_swapRouter);
        quoter = IQuoter(_quoter);
        feeRecipient = _feeRecipient;

        managementFee = 100; // 1% default fee
        minLiquidityAmount = 1000; // Minimum 1000 wei
        maxPositionsPerUser = 10;
    }

    /**
     * @dev Configure a liquidity pool
     */
    function configurePool(
        address _pool,
        address _token0,
        address _token1,
        uint24 _fee,
        int24 _tickLower,
        int24 _tickUpper,
        uint256 _maxSlippage,
        bool _autoRebalance,
        uint256 _rebalanceThreshold
    ) external onlyRole(ADMIN_ROLE) {
        require(_pool != address(0), "Invalid pool address");
        require(_token0 != address(0) && _token1 != address(0), "Invalid token addresses");
        require(_maxSlippage <= 1000, "Slippage too high"); // Max 10%
        require(_tickLower < _tickUpper, "Invalid tick range");

        poolConfigs[_pool] = PoolConfig({
            token0: _token0,
            token1: _token1,
            fee: _fee,
            tickLower: _tickLower,
            tickUpper: _tickUpper,
            maxSlippage: _maxSlippage,
            isActive: true,
            autoRebalance: _autoRebalance,
            rebalanceThreshold: _rebalanceThreshold
        });

        // Mark tokens as supported
        supportedTokens[_token0] = true;
        supportedTokens[_token1] = true;

        emit PoolConfigured(_pool, _token0, _token1, _fee, _tickLower, _tickUpper);
    }

    /**
     * @dev Add liquidity to a Uniswap V3 pool
     */
    function addLiquidity(
        address _pool,
        uint256 _amount0Desired,
        uint256 _amount1Desired,
        uint256 _amount0Min,
        uint256 _amount1Min,
        uint256 _deadline
    ) external nonReentrant whenNotPaused returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) {
        require(poolConfigs[_pool].isActive, "Pool not configured");
        require(userPositions[msg.sender].length < maxPositionsPerUser, "Too many positions");
        require(_deadline >= block.timestamp, "Deadline passed");

        PoolConfig memory config = poolConfigs[_pool];

        // Transfer tokens to this contract
        if (_amount0Desired > 0) {
            IERC20(config.token0).safeTransferFrom(msg.sender, address(this), _amount0Desired);
            IERC20(config.token0).approve(address(positionManager), _amount0Desired);
        }
        if (_amount1Desired > 0) {
            IERC20(config.token1).safeTransferFrom(msg.sender, address(this), _amount1Desired);
            IERC20(config.token1).approve(address(positionManager), _amount1Desired);
        }

        // Mint new position
        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
            token0: config.token0,
            token1: config.token1,
            fee: config.fee,
            tickLower: config.tickLower,
            tickUpper: config.tickUpper,
            amount0Desired: _amount0Desired,
            amount1Desired: _amount1Desired,
            amount0Min: _amount0Min,
            amount1Min: _amount1Min,
            recipient: address(this),
            deadline: _deadline
        });

        (tokenId, liquidity, amount0, amount1) = positionManager.mint(params);

        // Store position info
        positions[tokenId] = LiquidityPosition({
            tokenId: tokenId,
            liquidity: liquidity,
            amount0: amount0,
            amount1: amount1,
            fees0: 0,
            fees1: 0,
            lastRebalance: block.timestamp,
            owner: msg.sender
        });

        userPositions[msg.sender].push(tokenId);

        // Update tracking
        totalLiquidityProvided[_pool] += amount0 + amount1;

        // Refund excess tokens
        if (_amount0Desired > amount0) {
            IERC20(config.token0).safeTransfer(msg.sender, _amount0Desired - amount0);
        }
        if (_amount1Desired > amount1) {
            IERC20(config.token1).safeTransfer(msg.sender, _amount1Desired - amount1);
        }

        emit LiquidityAdded(msg.sender, _pool, tokenId, liquidity, amount0, amount1);
    }

    /**
     * @dev Remove liquidity from a position
     */
    function removeLiquidity(
        uint256 _tokenId,
        uint128 _liquidity,
        uint256 _amount0Min,
        uint256 _amount1Min,
        uint256 _deadline
    ) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        LiquidityPosition storage position = positions[_tokenId];
        require(position.owner == msg.sender, "Not position owner");
        require(_liquidity <= position.liquidity, "Insufficient liquidity");
        require(_deadline >= block.timestamp, "Deadline passed");

        // Collect fees first
        collectFees(_tokenId);

        // Decrease liquidity
        INonfungiblePositionManager.DecreaseLiquidityParams memory params = INonfungiblePositionManager.DecreaseLiquidityParams({
            tokenId: _tokenId,
            liquidity: _liquidity,
            amount0Min: _amount0Min,
            amount1Min: _amount1Min,
            deadline: _deadline
        });

        (amount0, amount1) = positionManager.decreaseLiquidity(params);

        // Collect the tokens
        INonfungiblePositionManager.CollectParams memory collectParams = INonfungiblePositionManager.CollectParams({
            tokenId: _tokenId,
            recipient: msg.sender,
            amount0Max: type(uint128).max,
            amount1Max: type(uint128).max
        });

        positionManager.collect(collectParams);

        // Update position
        position.liquidity -= _liquidity;
        position.amount0 = position.amount0 > amount0 ? position.amount0 - amount0 : 0;
        position.amount1 = position.amount1 > amount1 ? position.amount1 - amount1 : 0;

        // If position is fully removed, clean up
        if (position.liquidity == 0) {
            _removePositionFromUser(msg.sender, _tokenId);
            delete positions[_tokenId];
            positionManager.burn(_tokenId);
        }

        emit LiquidityRemoved(msg.sender, address(0), _tokenId, _liquidity, amount0, amount1);
    }

    /**
     * @dev Collect accumulated fees from a position
     */
    function collectFees(uint256 _tokenId) public nonReentrant returns (uint256 amount0, uint256 amount1) {
        LiquidityPosition storage position = positions[_tokenId];
        require(position.owner == msg.sender || hasRole(OPERATOR_ROLE, msg.sender), "Not authorized");

        INonfungiblePositionManager.CollectParams memory params = INonfungiblePositionManager.CollectParams({
            tokenId: _tokenId,
            recipient: address(this),
            amount0Max: type(uint128).max,
            amount1Max: type(uint128).max
        });

        (amount0, amount1) = positionManager.collect(params);

        // Calculate management fee
        uint256 fee0 = (amount0 * managementFee) / 10000;
        uint256 fee1 = (amount1 * managementFee) / 10000;

        // Get token addresses from position
        (, , address token0, address token1, , , , , , , , ) = positionManager.positions(_tokenId);

        // Transfer management fees
        if (fee0 > 0) {
            IERC20(token0).safeTransfer(feeRecipient, fee0);
        }
        if (fee1 > 0) {
            IERC20(token1).safeTransfer(feeRecipient, fee1);
        }

        // Transfer remaining fees to position owner
        uint256 userAmount0 = amount0 - fee0;
        uint256 userAmount1 = amount1 - fee1;

        if (userAmount0 > 0) {
            IERC20(token0).safeTransfer(position.owner, userAmount0);
        }
        if (userAmount1 > 0) {
            IERC20(token1).safeTransfer(position.owner, userAmount1);
        }

        // Update position fees
        position.fees0 += userAmount0;
        position.fees1 += userAmount1;

        // Update global tracking
        totalFeesCollected[token0] += userAmount0;
        totalFeesCollected[token1] += userAmount1;

        emit FeesCollected(position.owner, _tokenId, userAmount0, userAmount1);
    }

    /**
     * @dev Rebalance a position to a new price range
     */
    function rebalancePosition(
        uint256 _tokenId,
        RebalanceParams calldata _params
    ) external nonReentrant onlyRole(OPERATOR_ROLE) {
        LiquidityPosition storage position = positions[_tokenId];
        require(position.liquidity > 0, "Position not found");

        // Get current position info
        (, , address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, , , , , ) = positionManager.positions(_tokenId);

        // Remove all liquidity from current position
        INonfungiblePositionManager.DecreaseLiquidityParams memory decreaseParams = INonfungiblePositionManager.DecreaseLiquidityParams({
            tokenId: _tokenId,
            liquidity: position.liquidity,
            amount0Min: 0,
            amount1Min: 0,
            deadline: _params.deadline
        });

        (uint256 amount0, uint256 amount1) = positionManager.decreaseLiquidity(decreaseParams);

        // Collect the tokens
        INonfungiblePositionManager.CollectParams memory collectParams = INonfungiblePositionManager.CollectParams({
            tokenId: _tokenId,
            recipient: address(this),
            amount0Max: type(uint128).max,
            amount1Max: type(uint128).max
        });

        positionManager.collect(collectParams);

        // Burn old position
        positionManager.burn(_tokenId);

        // Create new position with new price range
        IERC20(token0).approve(address(positionManager), amount0);
        IERC20(token1).approve(address(positionManager), amount1);

        INonfungiblePositionManager.MintParams memory mintParams = INonfungiblePositionManager.MintParams({
            token0: token0,
            token1: token1,
            fee: fee,
            tickLower: _params.newTickLower,
            tickUpper: _params.newTickUpper,
            amount0Desired: amount0,
            amount1Desired: amount1,
            amount0Min: _params.amount0Min,
            amount1Min: _params.amount1Min,
            recipient: address(this),
            deadline: _params.deadline
        });

        (uint256 newTokenId, uint128 liquidity, uint256 newAmount0, uint256 newAmount1) = positionManager.mint(mintParams);

        // Update position mapping
        address owner = position.owner;
        delete positions[_tokenId];
        positions[newTokenId] = LiquidityPosition({
            tokenId: newTokenId,
            liquidity: liquidity,
            amount0: newAmount0,
            amount1: newAmount1,
            fees0: 0,
            fees1: 0,
            lastRebalance: block.timestamp,
            owner: owner
        });

        // Update user positions array
        _updateUserPosition(owner, _tokenId, newTokenId);

        // Refund excess tokens to owner
        if (amount0 > newAmount0) {
            IERC20(token0).safeTransfer(owner, amount0 - newAmount0);
        }
        if (amount1 > newAmount1) {
            IERC20(token1).safeTransfer(owner, amount1 - newAmount1);
        }

        emit PositionRebalanced(_tokenId, tickLower, tickUpper, _params.newTickLower, _params.newTickUpper);
    }

    /**
     * @dev Get optimal tick range based on current price and volatility
     */
    function getOptimalTickRange(
        address _pool,
        uint256 _volatilityBps
    ) external view returns (int24 tickLower, int24 tickUpper) {
        IUniswapV3Pool pool = IUniswapV3Pool(_pool);
        (, int24 currentTick, , , , , ) = pool.slot0();

        // Calculate tick spacing
        int24 tickSpacing = pool.tickSpacing();

        // Calculate range based on volatility
        int24 range = int24(_volatilityBps * int256(tickSpacing) / 10000);

        // Ensure range is aligned to tick spacing
        range = (range / tickSpacing) * tickSpacing;

        tickLower = ((currentTick - range) / tickSpacing) * tickSpacing;
        tickUpper = ((currentTick + range) / tickSpacing) * tickSpacing;
    }

    /**
     * @dev Check if position needs rebalancing
     */
    function needsRebalancing(uint256 _tokenId) external view returns (bool) {
        LiquidityPosition memory position = positions[_tokenId];
        if (position.liquidity == 0) return false;

        // Get position details
        (, , address token0, address token1, , int24 tickLower, int24 tickUpper, , , , , ) = positionManager.positions(_tokenId);

        // Get current pool price
        address poolAddress = _getPoolAddress(token0, token1, 3000); // Assuming 0.3% fee pool
        IUniswapV3Pool pool = IUniswapV3Pool(poolAddress);
        (, int24 currentTick, , , , , ) = pool.slot0();

        // Check if current tick is still within range
        if (currentTick <= tickLower || currentTick >= tickUpper) {
            return true;
        }

        // Check deviation from center
        int24 center = (tickLower + tickUpper) / 2;
        int24 deviation = currentTick > center ? currentTick - center : center - currentTick;
        int24 maxDeviation = (tickUpper - tickLower) / 4; // 25% of range

        return deviation > maxDeviation;
    }

    /**
     * @dev Get user positions
     */
    function getUserPositions(address _user) external view returns (uint256[] memory) {
        return userPositions[_user];
    }

    /**
     * @dev Get position details
     */
    function getPositionDetails(uint256 _tokenId) external view returns (LiquidityPosition memory) {
        return positions[_tokenId];
    }

    /**
     * @dev Set management fee
     */
    function setManagementFee(uint256 _fee) external onlyRole(ADMIN_ROLE) {
        require(_fee <= 1000, "Fee too high"); // Max 10%
        managementFee = _fee;
    }

    /**
     * @dev Set fee recipient
     */
    function setFeeRecipient(address _feeRecipient) external onlyRole(ADMIN_ROLE) {
        require(_feeRecipient != address(0), "Invalid address");
        feeRecipient = _feeRecipient;
    }

    /**
     * @dev Set price feed for a token
     */
    function setPriceFeed(address _token, address _priceFeed) external onlyRole(ADMIN_ROLE) {
        require(_token != address(0) && _priceFeed != address(0), "Invalid addresses");
        priceFeeds[_token] = AggregatorV3Interface(_priceFeed);
    }

    /**
     * @dev Internal function to remove position from user array
     */
    function _removePositionFromUser(address _user, uint256 _tokenId) internal {
        uint256[] storage userPositionIds = userPositions[_user];
        for (uint256 i = 0; i < userPositionIds.length; i++) {
            if (userPositionIds[i] == _tokenId) {
                userPositionIds[i] = userPositionIds[userPositionIds.length - 1];
                userPositionIds.pop();
                break;
            }
        }
    }

    /**
     * @dev Internal function to update user position array after rebalancing
     */
    function _updateUserPosition(address _user, uint256 _oldTokenId, uint256 _newTokenId) internal {
        uint256[] storage userPositionIds = userPositions[_user];
        for (uint256 i = 0; i < userPositionIds.length; i++) {
            if (userPositionIds[i] == _oldTokenId) {
                userPositionIds[i] = _newTokenId;
                break;
            }
        }
    }

    /**
     * @dev Get pool address (this would need to be implemented based on factory)
     */
    function _getPoolAddress(address _token0, address _token1, uint24 _fee) internal pure returns (address) {
        // This is a simplified version - in practice, you'd use the factory to get the pool address
        // For now, return a placeholder
        return address(0);
    }

    /**
     * @dev Pause contract
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause contract
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @dev Required by UUPSUpgradeable
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}