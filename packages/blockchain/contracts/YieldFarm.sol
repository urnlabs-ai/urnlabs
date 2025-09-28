// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "./UrnToken.sol";

/**
 * @title YieldFarm
 * @dev Advanced yield farming contract with LP token staking and URN rewards
 * @author Urnlabs Team
 */
contract YieldFarm is
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

    struct PoolInfo {
        IERC20 lpToken;           // LP token contract
        uint256 allocPoint;      // Allocation points for URN distribution
        uint256 lastRewardBlock; // Last block number when URN distribution occurred
        uint256 accUrnPerShare;  // Accumulated URN per share, times 1e12
        uint256 totalStaked;     // Total amount of LP tokens staked
        uint256 lockPeriod;      // Minimum lock period in seconds
        bool isActive;           // Pool status
        string name;             // Pool name
        AggregatorV3Interface priceFeed; // Chainlink price feed
    }

    struct UserInfo {
        uint256 amount;          // LP tokens provided by user
        uint256 rewardDebt;      // Reward debt for URN calculation
        uint256 lockedUntil;     // Timestamp when tokens can be withdrawn
        uint256 multiplier;      // Lock time multiplier (1x to 3x)
        uint256 totalRewards;    // Total rewards earned
        uint256 lastStakeTime;   // Last time user staked
    }

    struct RewardMultiplier {
        uint256 lockPeriod;      // Lock period in seconds
        uint256 multiplier;      // Multiplier in basis points (10000 = 1x)
    }

    // State variables
    UrnToken public urnToken;
    uint256 public urnPerBlock;
    uint256 public startBlock;
    uint256 public bonusEndBlock;
    uint256 public totalAllocPoint;
    uint256 public constant BONUS_MULTIPLIER = 10;
    uint256 public constant MAX_EMISSION_RATE = 1000 * 10**18; // 1000 URN per block max

    // Pool and user info
    PoolInfo[] public poolInfo;
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    mapping(address => bool) public lpTokenExists;

    // Reward multipliers based on lock period
    RewardMultiplier[] public rewardMultipliers;

    // Emergency withdrawal settings
    uint256 public emergencyWithdrawFee; // Fee in basis points (100 = 1%)
    address public feeRecipient;

    // Performance tracking
    mapping(address => uint256) public userTotalStaked;
    mapping(address => uint256) public userTotalRewards;
    uint256 public totalRewardsDistributed;

    // Events
    event PoolAdded(
        uint256 indexed pid,
        address indexed lpToken,
        uint256 allocPoint,
        uint256 lockPeriod,
        string name
    );

    event PoolUpdated(
        uint256 indexed pid,
        uint256 allocPoint,
        uint256 lockPeriod,
        bool isActive
    );

    event Deposit(
        address indexed user,
        uint256 indexed pid,
        uint256 amount,
        uint256 lockPeriod
    );

    event Withdraw(
        address indexed user,
        uint256 indexed pid,
        uint256 amount
    );

    event EmergencyWithdraw(
        address indexed user,
        uint256 indexed pid,
        uint256 amount,
        uint256 fee
    );

    event RewardsClaimed(
        address indexed user,
        uint256 indexed pid,
        uint256 amount
    );

    event EmissionRateUpdated(uint256 oldRate, uint256 newRate);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        UrnToken _urnToken,
        uint256 _urnPerBlock,
        uint256 _startBlock,
        uint256 _bonusEndBlock,
        address _admin,
        address _feeRecipient
    ) public initializer {
        __ReentrancyGuard_init();
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        require(address(_urnToken) != address(0), "Invalid URN token");
        require(_urnPerBlock <= MAX_EMISSION_RATE, "Emission rate too high");
        require(_startBlock >= block.number, "Start block in past");
        require(_bonusEndBlock > _startBlock, "Invalid bonus period");

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _admin);
        _grantRole(UPGRADER_ROLE, _admin);

        urnToken = _urnToken;
        urnPerBlock = _urnPerBlock;
        startBlock = _startBlock;
        bonusEndBlock = _bonusEndBlock;
        emergencyWithdrawFee = 500; // 5% default fee
        feeRecipient = _feeRecipient;

        // Initialize default lock period multipliers
        rewardMultipliers.push(RewardMultiplier(30 days, 10000));  // 1x for 30 days
        rewardMultipliers.push(RewardMultiplier(90 days, 12500));  // 1.25x for 90 days
        rewardMultipliers.push(RewardMultiplier(180 days, 15000)); // 1.5x for 180 days
        rewardMultipliers.push(RewardMultiplier(365 days, 20000)); // 2x for 1 year
        rewardMultipliers.push(RewardMultiplier(730 days, 30000)); // 3x for 2 years
    }

    /**
     * @dev Add a new LP token pool
     */
    function addPool(
        uint256 _allocPoint,
        IERC20 _lpToken,
        uint256 _lockPeriod,
        string calldata _name,
        address _priceFeed,
        bool _withUpdate
    ) external onlyRole(ADMIN_ROLE) {
        require(address(_lpToken) != address(0), "Invalid LP token");
        require(!lpTokenExists[address(_lpToken)], "LP token already exists");
        require(_lockPeriod >= 1 days, "Lock period too short");
        require(bytes(_name).length > 0, "Pool name required");

        if (_withUpdate) {
            massUpdatePools();
        }

        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocPoint += _allocPoint;
        lpTokenExists[address(_lpToken)] = true;

        poolInfo.push(PoolInfo({
            lpToken: _lpToken,
            allocPoint: _allocPoint,
            lastRewardBlock: lastRewardBlock,
            accUrnPerShare: 0,
            totalStaked: 0,
            lockPeriod: _lockPeriod,
            isActive: true,
            name: _name,
            priceFeed: AggregatorV3Interface(_priceFeed)
        }));

        emit PoolAdded(poolInfo.length - 1, address(_lpToken), _allocPoint, _lockPeriod, _name);
    }

    /**
     * @dev Update pool allocation and settings
     */
    function updatePool(
        uint256 _pid,
        uint256 _allocPoint,
        uint256 _lockPeriod,
        bool _isActive,
        bool _withUpdate
    ) external onlyRole(ADMIN_ROLE) {
        require(_pid < poolInfo.length, "Invalid pool ID");
        require(_lockPeriod >= 1 days, "Lock period too short");

        if (_withUpdate) {
            massUpdatePools();
        }

        PoolInfo storage pool = poolInfo[_pid];
        totalAllocPoint = totalAllocPoint - pool.allocPoint + _allocPoint;
        pool.allocPoint = _allocPoint;
        pool.lockPeriod = _lockPeriod;
        pool.isActive = _isActive;

        emit PoolUpdated(_pid, _allocPoint, _lockPeriod, _isActive);
    }

    /**
     * @dev Return reward multiplier over the given _from to _to block
     */
    function getMultiplier(uint256 _from, uint256 _to) public view returns (uint256) {
        if (_to <= bonusEndBlock) {
            return (_to - _from) * BONUS_MULTIPLIER;
        } else if (_from >= bonusEndBlock) {
            return _to - _from;
        } else {
            return (bonusEndBlock - _from) * BONUS_MULTIPLIER + (_to - bonusEndBlock);
        }
    }

    /**
     * @dev Calculate lock period multiplier for user
     */
    function getLockMultiplier(uint256 lockPeriod) public view returns (uint256) {
        for (uint256 i = rewardMultipliers.length; i > 0; i--) {
            if (lockPeriod >= rewardMultipliers[i - 1].lockPeriod) {
                return rewardMultipliers[i - 1].multiplier;
            }
        }
        return 10000; // Default 1x multiplier
    }

    /**
     * @dev View function to see pending URN rewards
     */
    function pendingUrn(uint256 _pid, address _user) external view returns (uint256) {
        require(_pid < poolInfo.length, "Invalid pool ID");

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];

        uint256 accUrnPerShare = pool.accUrnPerShare;
        uint256 lpSupply = pool.totalStaked;

        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
            uint256 urnReward = (multiplier * urnPerBlock * pool.allocPoint) / totalAllocPoint;
            accUrnPerShare += (urnReward * 1e12) / lpSupply;
        }

        uint256 pending = ((user.amount * accUrnPerShare) / 1e12) - user.rewardDebt;
        return (pending * user.multiplier) / 10000;
    }

    /**
     * @dev Update reward variables for all pools
     */
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePoolRewards(pid);
        }
    }

    /**
     * @dev Update reward variables of the given pool
     */
    function updatePoolRewards(uint256 _pid) public {
        require(_pid < poolInfo.length, "Invalid pool ID");

        PoolInfo storage pool = poolInfo[_pid];

        if (block.number <= pool.lastRewardBlock) {
            return;
        }

        uint256 lpSupply = pool.totalStaked;
        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }

        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint256 urnReward = (multiplier * urnPerBlock * pool.allocPoint) / totalAllocPoint;

        // Mint URN rewards to this contract
        urnToken.mint(address(this), urnReward);

        pool.accUrnPerShare += (urnReward * 1e12) / lpSupply;
        pool.lastRewardBlock = block.number;
    }

    /**
     * @dev Deposit LP tokens with lock period selection
     */
    function deposit(
        uint256 _pid,
        uint256 _amount,
        uint256 _lockPeriod
    ) external nonReentrant whenNotPaused {
        require(_pid < poolInfo.length, "Invalid pool ID");
        require(_amount > 0, "Amount must be greater than 0");

        PoolInfo storage pool = poolInfo[_pid];
        require(pool.isActive, "Pool not active");
        require(_lockPeriod >= pool.lockPeriod, "Lock period too short");

        UserInfo storage user = userInfo[_pid][msg.sender];

        updatePoolRewards(_pid);

        // Claim pending rewards if user has existing stake
        if (user.amount > 0) {
            uint256 pending = ((user.amount * pool.accUrnPerShare) / 1e12) - user.rewardDebt;
            if (pending > 0) {
                pending = (pending * user.multiplier) / 10000;
                safeUrnTransfer(msg.sender, pending);
                user.totalRewards += pending;
                totalRewardsDistributed += pending;
                emit RewardsClaimed(msg.sender, _pid, pending);
            }
        }

        // Transfer LP tokens to contract
        pool.lpToken.safeTransferFrom(msg.sender, address(this), _amount);

        // Update user info
        user.amount += _amount;
        user.lockedUntil = block.timestamp + _lockPeriod;
        user.multiplier = getLockMultiplier(_lockPeriod);
        user.lastStakeTime = block.timestamp;
        user.rewardDebt = (user.amount * pool.accUrnPerShare) / 1e12;

        // Update pool and global stats
        pool.totalStaked += _amount;
        userTotalStaked[msg.sender] += _amount;

        emit Deposit(msg.sender, _pid, _amount, _lockPeriod);
    }

    /**
     * @dev Withdraw LP tokens and claim rewards
     */
    function withdraw(uint256 _pid, uint256 _amount) external nonReentrant {
        require(_pid < poolInfo.length, "Invalid pool ID");

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        require(user.amount >= _amount, "Insufficient balance");
        require(block.timestamp >= user.lockedUntil, "Tokens still locked");

        updatePoolRewards(_pid);

        // Calculate and transfer pending rewards
        uint256 pending = ((user.amount * pool.accUrnPerShare) / 1e12) - user.rewardDebt;
        if (pending > 0) {
            pending = (pending * user.multiplier) / 10000;
            safeUrnTransfer(msg.sender, pending);
            user.totalRewards += pending;
            totalRewardsDistributed += pending;
            emit RewardsClaimed(msg.sender, _pid, pending);
        }

        // Update user info
        user.amount -= _amount;
        user.rewardDebt = (user.amount * pool.accUrnPerShare) / 1e12;

        // Update pool stats
        pool.totalStaked -= _amount;
        userTotalStaked[msg.sender] -= _amount;

        // Transfer LP tokens back to user
        pool.lpToken.safeTransfer(msg.sender, _amount);

        emit Withdraw(msg.sender, _pid, _amount);
    }

    /**
     * @dev Emergency withdraw without caring about rewards
     */
    function emergencyWithdraw(uint256 _pid) external nonReentrant {
        require(_pid < poolInfo.length, "Invalid pool ID");

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        uint256 amount = user.amount;
        require(amount > 0, "No tokens to withdraw");

        // Calculate emergency withdrawal fee
        uint256 fee = (amount * emergencyWithdrawFee) / 10000;
        uint256 amountAfterFee = amount - fee;

        // Update state
        user.amount = 0;
        user.rewardDebt = 0;
        user.lockedUntil = 0;
        user.multiplier = 10000;
        pool.totalStaked -= amount;
        userTotalStaked[msg.sender] -= amount;

        // Transfer tokens
        if (fee > 0) {
            pool.lpToken.safeTransfer(feeRecipient, fee);
        }
        pool.lpToken.safeTransfer(msg.sender, amountAfterFee);

        emit EmergencyWithdraw(msg.sender, _pid, amountAfterFee, fee);
    }

    /**
     * @dev Claim rewards without withdrawing LP tokens
     */
    function claimRewards(uint256 _pid) external nonReentrant {
        require(_pid < poolInfo.length, "Invalid pool ID");

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        require(user.amount > 0, "No stake found");

        updatePoolRewards(_pid);

        uint256 pending = ((user.amount * pool.accUrnPerShare) / 1e12) - user.rewardDebt;
        require(pending > 0, "No rewards to claim");

        pending = (pending * user.multiplier) / 10000;
        user.rewardDebt = (user.amount * pool.accUrnPerShare) / 1e12;
        user.totalRewards += pending;
        totalRewardsDistributed += pending;

        safeUrnTransfer(msg.sender, pending);

        emit RewardsClaimed(msg.sender, _pid, pending);
    }

    /**
     * @dev Safe URN transfer function, just in case if rounding error
     */
    function safeUrnTransfer(address _to, uint256 _amount) internal {
        uint256 urnBal = urnToken.balanceOf(address(this));
        if (_amount > urnBal) {
            urnToken.transfer(_to, urnBal);
        } else {
            urnToken.transfer(_to, _amount);
        }
    }

    /**
     * @dev Update emission rate
     */
    function updateEmissionRate(uint256 _urnPerBlock) external onlyRole(ADMIN_ROLE) {
        require(_urnPerBlock <= MAX_EMISSION_RATE, "Emission rate too high");

        massUpdatePools();

        emit EmissionRateUpdated(urnPerBlock, _urnPerBlock);
        urnPerBlock = _urnPerBlock;
    }

    /**
     * @dev Update emergency withdrawal fee
     */
    function updateEmergencyWithdrawFee(uint256 _fee) external onlyRole(ADMIN_ROLE) {
        require(_fee <= 2000, "Fee too high"); // Max 20%
        emergencyWithdrawFee = _fee;
    }

    /**
     * @dev Update fee recipient
     */
    function updateFeeRecipient(address _feeRecipient) external onlyRole(ADMIN_ROLE) {
        require(_feeRecipient != address(0), "Invalid address");
        feeRecipient = _feeRecipient;
    }

    /**
     * @dev Add or update reward multiplier
     */
    function updateRewardMultiplier(
        uint256 _index,
        uint256 _lockPeriod,
        uint256 _multiplier
    ) external onlyRole(ADMIN_ROLE) {
        require(_multiplier >= 10000 && _multiplier <= 50000, "Invalid multiplier"); // 1x to 5x
        require(_lockPeriod >= 1 days, "Lock period too short");

        if (_index < rewardMultipliers.length) {
            rewardMultipliers[_index].lockPeriod = _lockPeriod;
            rewardMultipliers[_index].multiplier = _multiplier;
        } else {
            rewardMultipliers.push(RewardMultiplier(_lockPeriod, _multiplier));
        }
    }

    /**
     * @dev Get pool count
     */
    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    /**
     * @dev Get user info for all pools
     */
    function getUserInfo(address _user) external view returns (UserInfo[] memory) {
        uint256 length = poolInfo.length;
        UserInfo[] memory userInfos = new UserInfo[](length);

        for (uint256 i = 0; i < length; i++) {
            userInfos[i] = userInfo[i][_user];
        }

        return userInfos;
    }

    /**
     * @dev Get pool APR (estimated)
     */
    function getPoolAPR(uint256 _pid) external view returns (uint256) {
        require(_pid < poolInfo.length, "Invalid pool ID");

        PoolInfo storage pool = poolInfo[_pid];

        if (pool.totalStaked == 0 || totalAllocPoint == 0) {
            return 0;
        }

        // Calculate yearly URN rewards for this pool
        uint256 yearlyUrn = urnPerBlock * 2102400 * pool.allocPoint / totalAllocPoint; // ~2.1M blocks per year

        // Get LP token price from Chainlink (if available)
        uint256 lpPrice = 1e18; // Default to 1 USD if no price feed
        if (address(pool.priceFeed) != address(0)) {
            try pool.priceFeed.latestRoundData() returns (
                uint80,
                int256 price,
                uint256,
                uint256,
                uint80
            ) {
                if (price > 0) {
                    lpPrice = uint256(price) * 1e10; // Convert to 18 decimals
                }
            } catch {
                // Use default price if Chainlink call fails
            }
        }

        // Calculate APR (basis points)
        uint256 totalValueLocked = pool.totalStaked * lpPrice / 1e18;
        if (totalValueLocked == 0) return 0;

        return (yearlyUrn * 1e18 / totalValueLocked) / 1e14; // Convert to basis points
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