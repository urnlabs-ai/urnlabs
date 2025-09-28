// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./UrnToken.sol";

/**
 * @title RewardDistributor
 * @dev Fair reward distribution across multiple pools and staking mechanisms
 * @author Urnlabs Team
 */
contract RewardDistributor is
    Initializable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;
    using Math for uint256;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    struct RewardPool {
        string name;
        address stakingContract;
        uint256 allocPoint;
        uint256 lastRewardTime;
        uint256 accRewardPerShare;
        uint256 totalStaked;
        bool isActive;
        uint256 maxCap; // Maximum rewards this pool can receive
        uint256 rewardsDistributed;
        uint256 minStakeAmount;
        uint256 lockPeriod; // Minimum lock period for rewards
    }

    struct UserReward {
        uint256 amount;
        uint256 rewardDebt;
        uint256 lockedUntil;
        uint256 multiplier; // Based on lock period and other factors
        uint256 lastClaimTime;
        uint256 totalClaimed;
        bool isVesting;
        uint256 vestingStart;
        uint256 vestingDuration;
    }

    struct VestingSchedule {
        uint256 totalAmount;
        uint256 releasedAmount;
        uint256 startTime;
        uint256 duration;
        uint256 cliffDuration;
        bool revoked;
    }

    struct RewardMetrics {
        uint256 totalRewardsDistributed;
        uint256 totalUsers;
        uint256 averageRewardPerUser;
        uint256 distributionEfficiency; // Percentage of allocated rewards actually claimed
    }

    // Core state
    UrnToken public rewardToken;
    uint256 public rewardPerSecond;
    uint256 public totalAllocPoint;
    uint256 public startTime;
    uint256 public endTime;

    // Pool management
    RewardPool[] public rewardPools;
    mapping(address => uint256) public poolIds; // stakingContract => poolId
    mapping(uint256 => mapping(address => UserReward)) public userRewards;

    // Vesting management
    mapping(address => VestingSchedule[]) public vestingSchedules;
    uint256 public totalVestingAmount;

    // Performance tracking
    RewardMetrics public metrics;
    mapping(address => uint256) public userTotalRewards;
    mapping(uint256 => uint256) public poolTotalRewards;

    // Economic parameters
    uint256 public inflationRate; // Annual inflation rate in basis points
    uint256 public maxSupply;
    uint256 public burnRate; // Percentage of fees to burn
    uint256 public treasuryRate; // Percentage to treasury

    // Governance and emergency
    address public treasury;
    uint256 public emergencyWithdrawDelay;
    mapping(address => uint256) public emergencyWithdrawRequests;

    // Anti-gaming mechanisms
    mapping(address => uint256) public lastActionTime;
    uint256 public minActionInterval;
    mapping(address => bool) public blacklistedUsers;

    // Events
    event PoolAdded(uint256 indexed pid, string name, address stakingContract, uint256 allocPoint);
    event PoolUpdated(uint256 indexed pid, uint256 allocPoint, bool isActive);
    event RewardsClaimed(address indexed user, uint256 indexed pid, uint256 amount);
    event VestingScheduleCreated(address indexed user, uint256 amount, uint256 duration);
    event EmergencyWithdrawRequested(address indexed user, uint256 amount);
    event RewardParametersUpdated(uint256 rewardPerSecond, uint256 inflationRate);

    modifier validPool(uint256 _pid) {
        require(_pid < rewardPools.length, "Invalid pool ID");
        _;
    }

    modifier notBlacklisted() {
        require(!blacklistedUsers[msg.sender], "User blacklisted");
        _;
    }

    modifier rateLimit() {
        require(
            block.timestamp >= lastActionTime[msg.sender] + minActionInterval,
            "Action too frequent"
        );
        lastActionTime[msg.sender] = block.timestamp;
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        UrnToken _rewardToken,
        uint256 _rewardPerSecond,
        uint256 _startTime,
        uint256 _endTime,
        address _admin,
        address _treasury
    ) public initializer {
        __ReentrancyGuard_init();
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        require(address(_rewardToken) != address(0), "Invalid reward token");
        require(_startTime >= block.timestamp, "Start time in past");
        require(_endTime > _startTime, "Invalid end time");
        require(_treasury != address(0), "Invalid treasury");

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _admin);
        _grantRole(UPGRADER_ROLE, _admin);

        rewardToken = _rewardToken;
        rewardPerSecond = _rewardPerSecond;
        startTime = _startTime;
        endTime = _endTime;
        treasury = _treasury;

        // Default parameters
        inflationRate = 500; // 5% annual inflation
        burnRate = 1000; // 10% burn rate
        treasuryRate = 2000; // 20% to treasury
        minActionInterval = 60; // 1 minute between actions
        emergencyWithdrawDelay = 7 days;
    }

    /**
     * @dev Add a new reward pool
     */
    function addPool(
        string calldata _name,
        address _stakingContract,
        uint256 _allocPoint,
        uint256 _maxCap,
        uint256 _minStakeAmount,
        uint256 _lockPeriod,
        bool _withUpdate
    ) external onlyRole(ADMIN_ROLE) {
        require(bytes(_name).length > 0, "Pool name required");
        require(_stakingContract != address(0), "Invalid staking contract");
        require(poolIds[_stakingContract] == 0, "Pool already exists");

        if (_withUpdate) {
            massUpdatePools();
        }

        totalAllocPoint += _allocPoint;
        uint256 pid = rewardPools.length;
        poolIds[_stakingContract] = pid + 1; // Store pid + 1 to differentiate from default 0

        rewardPools.push(RewardPool({
            name: _name,
            stakingContract: _stakingContract,
            allocPoint: _allocPoint,
            lastRewardTime: block.timestamp > startTime ? block.timestamp : startTime,
            accRewardPerShare: 0,
            totalStaked: 0,
            isActive: true,
            maxCap: _maxCap,
            rewardsDistributed: 0,
            minStakeAmount: _minStakeAmount,
            lockPeriod: _lockPeriod
        }));

        emit PoolAdded(pid, _name, _stakingContract, _allocPoint);
    }

    /**
     * @dev Update pool allocation and parameters
     */
    function updatePool(
        uint256 _pid,
        uint256 _allocPoint,
        uint256 _maxCap,
        uint256 _minStakeAmount,
        uint256 _lockPeriod,
        bool _isActive,
        bool _withUpdate
    ) external onlyRole(ADMIN_ROLE) validPool(_pid) {
        if (_withUpdate) {
            massUpdatePools();
        }

        RewardPool storage pool = rewardPools[_pid];
        totalAllocPoint = totalAllocPoint - pool.allocPoint + _allocPoint;

        pool.allocPoint = _allocPoint;
        pool.maxCap = _maxCap;
        pool.minStakeAmount = _minStakeAmount;
        pool.lockPeriod = _lockPeriod;
        pool.isActive = _isActive;

        emit PoolUpdated(_pid, _allocPoint, _isActive);
    }

    /**
     * @dev Update reward variables for all pools
     */
    function massUpdatePools() public {
        uint256 length = rewardPools.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePoolRewards(pid);
        }
    }

    /**
     * @dev Update reward variables of the given pool
     */
    function updatePoolRewards(uint256 _pid) public validPool(_pid) {
        RewardPool storage pool = rewardPools[_pid];

        if (block.timestamp <= pool.lastRewardTime || !pool.isActive) {
            return;
        }

        if (pool.totalStaked == 0) {
            pool.lastRewardTime = block.timestamp;
            return;
        }

        uint256 timeElapsed = block.timestamp - pool.lastRewardTime;
        uint256 reward = (timeElapsed * rewardPerSecond * pool.allocPoint) / totalAllocPoint;

        // Apply max cap if set
        if (pool.maxCap > 0 && pool.rewardsDistributed + reward > pool.maxCap) {
            reward = pool.maxCap - pool.rewardsDistributed;
        }

        if (reward > 0) {
            // Mint new tokens for rewards
            rewardToken.mint(address(this), reward);
            pool.accRewardPerShare += (reward * 1e12) / pool.totalStaked;
            pool.rewardsDistributed += reward;
        }

        pool.lastRewardTime = block.timestamp;
    }

    /**
     * @dev Register user stake in a pool (called by staking contracts)
     */
    function registerStake(
        uint256 _pid,
        address _user,
        uint256 _amount,
        uint256 _lockPeriod
    ) external validPool(_pid) notBlacklisted {
        RewardPool storage pool = rewardPools[_pid];
        require(msg.sender == pool.stakingContract, "Unauthorized caller");
        require(_amount >= pool.minStakeAmount, "Amount below minimum");
        require(_lockPeriod >= pool.lockPeriod, "Lock period too short");

        UserReward storage user = userRewards[_pid][_user];

        updatePoolRewards(_pid);

        // Calculate pending rewards if user already has stake
        if (user.amount > 0) {
            uint256 pending = (user.amount * pool.accRewardPerShare / 1e12) - user.rewardDebt;
            if (pending > 0) {
                _claimRewards(_pid, _user, pending);
            }
        }

        // Update user and pool state
        user.amount += _amount;
        user.lockedUntil = block.timestamp + _lockPeriod;
        user.multiplier = _calculateMultiplier(_lockPeriod, _amount);
        user.rewardDebt = user.amount * pool.accRewardPerShare / 1e12;

        pool.totalStaked += _amount;

        // Update metrics
        if (user.amount == _amount) { // New user
            metrics.totalUsers += 1;
        }
    }

    /**
     * @dev Unregister user stake from a pool (called by staking contracts)
     */
    function unregisterStake(
        uint256 _pid,
        address _user,
        uint256 _amount
    ) external validPool(_pid) {
        RewardPool storage pool = rewardPools[_pid];
        require(msg.sender == pool.stakingContract, "Unauthorized caller");

        UserReward storage user = userRewards[_pid][_user];
        require(user.amount >= _amount, "Insufficient stake");
        require(block.timestamp >= user.lockedUntil, "Stake still locked");

        updatePoolRewards(_pid);

        // Claim pending rewards
        uint256 pending = (user.amount * pool.accRewardPerShare / 1e12) - user.rewardDebt;
        if (pending > 0) {
            _claimRewards(_pid, _user, pending);
        }

        // Update user and pool state
        user.amount -= _amount;
        user.rewardDebt = user.amount * pool.accRewardPerShare / 1e12;

        pool.totalStaked -= _amount;

        // Update metrics
        if (user.amount == 0) { // User completely exited
            metrics.totalUsers -= 1;
        }
    }

    /**
     * @dev Claim rewards from a pool
     */
    function claimRewards(uint256 _pid) external nonReentrant validPool(_pid) notBlacklisted rateLimit {
        UserReward storage user = userRewards[_pid][msg.sender];
        require(user.amount > 0, "No stake found");

        updatePoolRewards(_pid);

        uint256 pending = (user.amount * rewardPools[_pid].accRewardPerShare / 1e12) - user.rewardDebt;
        require(pending > 0, "No rewards to claim");

        _claimRewards(_pid, msg.sender, pending);
        user.rewardDebt = user.amount * rewardPools[_pid].accRewardPerShare / 1e12;
    }

    /**
     * @dev Internal function to handle reward claiming
     */
    function _claimRewards(uint256 _pid, address _user, uint256 _amount) internal {
        UserReward storage user = userRewards[_pid][_user];

        // Apply multiplier
        uint256 finalAmount = (_amount * user.multiplier) / 10000;

        // Handle vesting if applicable
        if (user.isVesting) {
            _createVestingSchedule(_user, finalAmount, user.vestingDuration);
        } else {
            // Direct transfer
            rewardToken.safeTransfer(_user, finalAmount);
        }

        // Update tracking
        user.totalClaimed += finalAmount;
        user.lastClaimTime = block.timestamp;
        userTotalRewards[_user] += finalAmount;
        poolTotalRewards[_pid] += finalAmount;

        // Update global metrics
        metrics.totalRewardsDistributed += finalAmount;
        metrics.averageRewardPerUser = metrics.totalRewardsDistributed / Math.max(metrics.totalUsers, 1);

        emit RewardsClaimed(_user, _pid, finalAmount);
    }

    /**
     * @dev Create vesting schedule for rewards
     */
    function _createVestingSchedule(
        address _user,
        uint256 _amount,
        uint256 _duration
    ) internal {
        vestingSchedules[_user].push(VestingSchedule({
            totalAmount: _amount,
            releasedAmount: 0,
            startTime: block.timestamp,
            duration: _duration,
            cliffDuration: _duration / 4, // 25% cliff
            revoked: false
        }));

        totalVestingAmount += _amount;
        emit VestingScheduleCreated(_user, _amount, _duration);
    }

    /**
     * @dev Release vested rewards
     */
    function releaseVestedRewards(uint256 _scheduleIndex) external nonReentrant notBlacklisted {
        require(_scheduleIndex < vestingSchedules[msg.sender].length, "Invalid schedule");

        VestingSchedule storage schedule = vestingSchedules[msg.sender][_scheduleIndex];
        require(!schedule.revoked, "Schedule revoked");
        require(block.timestamp >= schedule.startTime + schedule.cliffDuration, "Cliff not reached");

        uint256 releasable = _calculateReleasableAmount(msg.sender, _scheduleIndex);
        require(releasable > 0, "No tokens to release");

        schedule.releasedAmount += releasable;
        totalVestingAmount -= releasable;

        rewardToken.safeTransfer(msg.sender, releasable);
    }

    /**
     * @dev Calculate releasable amount from vesting schedule
     */
    function _calculateReleasableAmount(address _user, uint256 _scheduleIndex) internal view returns (uint256) {
        VestingSchedule storage schedule = vestingSchedules[_user][_scheduleIndex];

        if (schedule.revoked || block.timestamp < schedule.startTime + schedule.cliffDuration) {
            return 0;
        }

        uint256 elapsedTime = block.timestamp - schedule.startTime;
        uint256 vestedAmount;

        if (elapsedTime >= schedule.duration) {
            vestedAmount = schedule.totalAmount;
        } else {
            vestedAmount = (schedule.totalAmount * elapsedTime) / schedule.duration;
        }

        return vestedAmount - schedule.releasedAmount;
    }

    /**
     * @dev Calculate multiplier based on lock period and amount
     */
    function _calculateMultiplier(uint256 _lockPeriod, uint256 _amount) internal pure returns (uint256) {
        uint256 multiplier = 10000; // Base 1x

        // Lock period bonus
        if (_lockPeriod >= 365 days) {
            multiplier += 5000; // +50% for 1 year
        } else if (_lockPeriod >= 180 days) {
            multiplier += 2500; // +25% for 6 months
        } else if (_lockPeriod >= 90 days) {
            multiplier += 1000; // +10% for 3 months
        }

        // Amount bonus (logarithmic)
        if (_amount >= 1000000 * 1e18) {
            multiplier += 2000; // +20% for whales
        } else if (_amount >= 100000 * 1e18) {
            multiplier += 1000; // +10% for large stakes
        } else if (_amount >= 10000 * 1e18) {
            multiplier += 500; // +5% for medium stakes
        }

        return Math.min(multiplier, 30000); // Cap at 3x
    }

    /**
     * @dev View function to see pending rewards for a user
     */
    function pendingRewards(uint256 _pid, address _user) external view validPool(_pid) returns (uint256) {
        RewardPool storage pool = rewardPools[_pid];
        UserReward storage user = userRewards[_pid][_user];

        uint256 accRewardPerShare = pool.accRewardPerShare;

        if (block.timestamp > pool.lastRewardTime && pool.totalStaked != 0 && pool.isActive) {
            uint256 timeElapsed = block.timestamp - pool.lastRewardTime;
            uint256 reward = (timeElapsed * rewardPerSecond * pool.allocPoint) / totalAllocPoint;

            // Apply max cap
            if (pool.maxCap > 0 && pool.rewardsDistributed + reward > pool.maxCap) {
                reward = pool.maxCap - pool.rewardsDistributed;
            }

            accRewardPerShare += (reward * 1e12) / pool.totalStaked;
        }

        uint256 pending = (user.amount * accRewardPerShare / 1e12) - user.rewardDebt;
        return (pending * user.multiplier) / 10000;
    }

    /**
     * @dev Update reward parameters
     */
    function updateRewardParameters(
        uint256 _rewardPerSecond,
        uint256 _inflationRate,
        uint256 _burnRate,
        uint256 _treasuryRate
    ) external onlyRole(ADMIN_ROLE) {
        require(_inflationRate <= 2000, "Inflation rate too high"); // Max 20%
        require(_burnRate + _treasuryRate <= 5000, "Rates too high"); // Max 50% combined

        massUpdatePools();

        rewardPerSecond = _rewardPerSecond;
        inflationRate = _inflationRate;
        burnRate = _burnRate;
        treasuryRate = _treasuryRate;

        emit RewardParametersUpdated(_rewardPerSecond, _inflationRate);
    }

    /**
     * @dev Emergency withdraw request
     */
    function requestEmergencyWithdraw() external notBlacklisted {
        emergencyWithdrawRequests[msg.sender] = block.timestamp;
        emit EmergencyWithdrawRequested(msg.sender, userTotalRewards[msg.sender]);
    }

    /**
     * @dev Execute emergency withdraw
     */
    function executeEmergencyWithdraw() external nonReentrant notBlacklisted {
        require(
            emergencyWithdrawRequests[msg.sender] != 0 &&
            block.timestamp >= emergencyWithdrawRequests[msg.sender] + emergencyWithdrawDelay,
            "Emergency withdraw not ready"
        );

        uint256 totalRewards = userTotalRewards[msg.sender];
        require(totalRewards > 0, "No rewards to withdraw");

        // Reset user data
        userTotalRewards[msg.sender] = 0;
        emergencyWithdrawRequests[msg.sender] = 0;

        // Apply penalty (50% in emergency)
        uint256 penalty = totalRewards / 2;
        uint256 withdrawAmount = totalRewards - penalty;

        // Burn penalty tokens or send to treasury
        rewardToken.safeTransfer(treasury, penalty);
        rewardToken.safeTransfer(msg.sender, withdrawAmount);
    }

    /**
     * @dev Blacklist/unblacklist user
     */
    function setUserBlacklist(address _user, bool _blacklisted) external onlyRole(ADMIN_ROLE) {
        blacklistedUsers[_user] = _blacklisted;
    }

    /**
     * @dev Get pool count
     */
    function poolLength() external view returns (uint256) {
        return rewardPools.length;
    }

    /**
     * @dev Get user info for a pool
     */
    function getUserInfo(uint256 _pid, address _user) external view validPool(_pid) returns (UserReward memory) {
        return userRewards[_pid][_user];
    }

    /**
     * @dev Get distribution metrics
     */
    function getMetrics() external view returns (RewardMetrics memory) {
        return metrics;
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