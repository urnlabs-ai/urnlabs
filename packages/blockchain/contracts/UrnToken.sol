// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

/**
 * @title UrnToken
 * @dev ERC20 token for Urnlabs platform with governance and utility features
 * @author Urnlabs Team
 */
contract UrnToken is
    Initializable,
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    ERC20PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    struct StakingInfo {
        uint256 amount;
        uint256 stakedAt;
        uint256 lockPeriod;
        uint256 rewardRate;
        bool isActive;
    }

    struct VestingSchedule {
        uint256 totalAmount;
        uint256 releasedAmount;
        uint256 startTime;
        uint256 duration;
        uint256 cliffDuration;
        bool revoked;
    }

    // Token economics parameters
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18; // 1 billion tokens
    uint256 public constant INITIAL_SUPPLY = 100_000_000 * 10**18; // 100 million initial
    
    // Staking parameters
    mapping(address => StakingInfo[]) public stakingInfo;
    mapping(address => uint256) public totalStaked;
    mapping(address => uint256) public stakingRewards;
    uint256 public totalStakedAmount;
    uint256 public baseStakingReward; // Annual percentage rate in basis points
    
    // Vesting parameters
    mapping(address => VestingSchedule[]) public vestingSchedules;
    uint256 public totalVestedAmount;
    
    // Governance parameters
    mapping(address => uint256) public votingPower;
    mapping(address => mapping(uint256 => bool)) public hasVoted;
    uint256 public proposalCount;
    
    // Fee and reward pools
    uint256 public rewardPool;
    uint256 public developmentFund;
    uint256 public treasuryFund;
    
    // Events
    event Staked(address indexed user, uint256 amount, uint256 lockPeriod);
    event Unstaked(address indexed user, uint256 amount, uint256 reward);
    event RewardsClaimed(address indexed user, uint256 amount);
    event VestingScheduleCreated(address indexed beneficiary, uint256 amount, uint256 duration);
    event TokensReleased(address indexed beneficiary, uint256 amount);
    event VestingRevoked(address indexed beneficiary, uint256 index);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory name,
        string memory symbol,
        address admin,
        uint256 _baseStakingReward
    ) public initializer {
        __ERC20_init(name, symbol);
        __ERC20Burnable_init();
        __ERC20Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(BURNER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);

        baseStakingReward = _baseStakingReward; // e.g., 1000 = 10% APR
        
        // Mint initial supply to admin
        _mint(admin, INITIAL_SUPPLY);
        
        // Initialize fund allocations (30% each for reward pool, development, treasury)
        uint256 fundAllocation = INITIAL_SUPPLY * 30 / 100;
        rewardPool = fundAllocation;
        developmentFund = fundAllocation;
        treasuryFund = fundAllocation;
    }

    /**
     * @dev Stake tokens for rewards
     */
    function stake(uint256 amount, uint256 lockPeriod) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount must be greater than 0");
        require(lockPeriod >= 30 days, "Lock period too short");
        require(lockPeriod <= 1095 days, "Lock period too long"); // Max 3 years
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");

        // Calculate reward rate based on lock period
        uint256 rewardRate = _calculateRewardRate(lockPeriod);
        
        // Transfer tokens to contract
        _transfer(msg.sender, address(this), amount);
        
        // Create staking record
        stakingInfo[msg.sender].push(StakingInfo({
            amount: amount,
            stakedAt: block.timestamp,
            lockPeriod: lockPeriod,
            rewardRate: rewardRate,
            isActive: true
        }));
        
        totalStaked[msg.sender] += amount;
        totalStakedAmount += amount;
        
        // Update voting power
        _updateVotingPower(msg.sender);
        
        emit Staked(msg.sender, amount, lockPeriod);
    }

    /**
     * @dev Unstake tokens and claim rewards
     */
    function unstake(uint256 stakingIndex) external nonReentrant {
        require(stakingIndex < stakingInfo[msg.sender].length, "Invalid staking index");
        
        StakingInfo storage staking = stakingInfo[msg.sender][stakingIndex];
        require(staking.isActive, "Staking not active");
        require(block.timestamp >= staking.stakedAt + staking.lockPeriod, "Lock period not finished");
        
        uint256 stakedAmount = staking.amount;
        uint256 reward = _calculateReward(msg.sender, stakingIndex);
        
        // Mark as inactive
        staking.isActive = false;
        
        // Update totals
        totalStaked[msg.sender] -= stakedAmount;
        totalStakedAmount -= stakedAmount;
        
        // Update voting power
        _updateVotingPower(msg.sender);
        
        // Transfer staked amount back to user
        _transfer(address(this), msg.sender, stakedAmount);
        
        // Transfer reward from reward pool
        if (reward > 0 && rewardPool >= reward) {
            rewardPool -= reward;
            _transfer(address(this), msg.sender, reward);
        }
        
        emit Unstaked(msg.sender, stakedAmount, reward);
    }

    /**
     * @dev Claim accumulated staking rewards without unstaking
     */
    function claimRewards() external nonReentrant {
        uint256 totalReward = 0;
        
        for (uint256 i = 0; i < stakingInfo[msg.sender].length; i++) {
            if (stakingInfo[msg.sender][i].isActive) {
                totalReward += _calculateReward(msg.sender, i);
                stakingInfo[msg.sender][i].stakedAt = block.timestamp; // Reset reward calculation
            }
        }
        
        require(totalReward > 0, "No rewards to claim");
        require(rewardPool >= totalReward, "Insufficient reward pool");
        
        rewardPool -= totalReward;
        stakingRewards[msg.sender] += totalReward;
        
        _transfer(address(this), msg.sender, totalReward);
        
        emit RewardsClaimed(msg.sender, totalReward);
    }

    /**
     * @dev Create vesting schedule for team/investors
     */
    function createVestingSchedule(
        address beneficiary,
        uint256 amount,
        uint256 startTime,
        uint256 duration,
        uint256 cliffDuration
    ) external onlyRole(ADMIN_ROLE) {
        require(beneficiary != address(0), "Invalid beneficiary");
        require(amount > 0, "Amount must be greater than 0");
        require(duration > 0, "Duration must be greater than 0");
        require(cliffDuration <= duration, "Cliff duration exceeds total duration");
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");

        vestingSchedules[beneficiary].push(VestingSchedule({
            totalAmount: amount,
            releasedAmount: 0,
            startTime: startTime,
            duration: duration,
            cliffDuration: cliffDuration,
            revoked: false
        }));

        totalVestedAmount += amount;
        
        // Mint tokens to contract for vesting
        _mint(address(this), amount);
        
        emit VestingScheduleCreated(beneficiary, amount, duration);
    }

    /**
     * @dev Release vested tokens
     */
    function releaseVestedTokens(uint256 scheduleIndex) external nonReentrant {
        require(scheduleIndex < vestingSchedules[msg.sender].length, "Invalid schedule index");
        
        VestingSchedule storage schedule = vestingSchedules[msg.sender][scheduleIndex];
        require(!schedule.revoked, "Vesting schedule revoked");
        require(block.timestamp >= schedule.startTime + schedule.cliffDuration, "Cliff period not finished");
        
        uint256 releasableAmount = _calculateReleasableAmount(msg.sender, scheduleIndex);
        require(releasableAmount > 0, "No tokens available for release");
        
        schedule.releasedAmount += releasableAmount;
        
        _transfer(address(this), msg.sender, releasableAmount);
        
        emit TokensReleased(msg.sender, releasableAmount);
    }

    /**
     * @dev Revoke vesting schedule (admin only)
     */
    function revokeVesting(address beneficiary, uint256 scheduleIndex) external onlyRole(ADMIN_ROLE) {
        require(scheduleIndex < vestingSchedules[beneficiary].length, "Invalid schedule index");
        
        VestingSchedule storage schedule = vestingSchedules[beneficiary][scheduleIndex];
        require(!schedule.revoked, "Already revoked");
        
        uint256 releasableAmount = _calculateReleasableAmount(beneficiary, scheduleIndex);
        
        if (releasableAmount > 0) {
            schedule.releasedAmount += releasableAmount;
            _transfer(address(this), beneficiary, releasableAmount);
        }
        
        schedule.revoked = true;
        
        // Return unvested tokens to treasury
        uint256 unvestedAmount = schedule.totalAmount - schedule.releasedAmount;
        if (unvestedAmount > 0) {
            treasuryFund += unvestedAmount;
        }
        
        emit VestingRevoked(beneficiary, scheduleIndex);
    }

    /**
     * @dev Mint new tokens (only for rewards, max supply enforced)
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        _mint(to, amount);
    }

    /**
     * @dev Burn tokens from reward pool to control inflation
     */
    function burnFromRewardPool(uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(rewardPool >= amount, "Insufficient reward pool");
        rewardPool -= amount;
        _burn(address(this), amount);
    }

    /**
     * @dev Update base staking reward rate
     */
    function setBaseStakingReward(uint256 _baseStakingReward) external onlyRole(ADMIN_ROLE) {
        require(_baseStakingReward <= 5000, "Reward rate too high"); // Max 50%
        baseStakingReward = _baseStakingReward;
    }

    /**
     * @dev Add tokens to reward pool
     */
    function addToRewardPool(uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(balanceOf(address(this)) >= amount, "Insufficient contract balance");
        rewardPool += amount;
    }

    /**
     * @dev Calculate reward rate based on lock period
     */
    function _calculateRewardRate(uint256 lockPeriod) internal view returns (uint256) {
        if (lockPeriod >= 1095 days) { // 3 years
            return baseStakingReward * 3; // 3x multiplier
        } else if (lockPeriod >= 730 days) { // 2 years
            return baseStakingReward * 2; // 2x multiplier
        } else if (lockPeriod >= 365 days) { // 1 year
            return (baseStakingReward * 15) / 10; // 1.5x multiplier
        } else {
            return baseStakingReward; // Base rate
        }
    }

    /**
     * @dev Calculate staking reward for a specific stake
     */
    function _calculateReward(address user, uint256 stakingIndex) internal view returns (uint256) {
        StakingInfo storage staking = stakingInfo[user][stakingIndex];
        
        if (!staking.isActive) {
            return 0;
        }
        
        uint256 stakingDuration = block.timestamp - staking.stakedAt;
        uint256 annualReward = (staking.amount * staking.rewardRate) / 10000;
        
        return (annualReward * stakingDuration) / 365 days;
    }

    /**
     * @dev Calculate releasable amount for vesting schedule
     */
    function _calculateReleasableAmount(address beneficiary, uint256 scheduleIndex) internal view returns (uint256) {
        VestingSchedule storage schedule = vestingSchedules[beneficiary][scheduleIndex];
        
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
     * @dev Update voting power based on staked amount
     */
    function _updateVotingPower(address user) internal {
        votingPower[user] = totalStaked[user] + balanceOf(user);
    }

    /**
     * @dev Get user's total staking reward
     */
    function getUserStakingReward(address user) external view returns (uint256) {
        uint256 totalReward = 0;
        
        for (uint256 i = 0; i < stakingInfo[user].length; i++) {
            if (stakingInfo[user][i].isActive) {
                totalReward += _calculateReward(user, i);
            }
        }
        
        return totalReward;
    }

    /**
     * @dev Get user's active staking count
     */
    function getUserActiveStakes(address user) external view returns (uint256) {
        uint256 activeCount = 0;
        
        for (uint256 i = 0; i < stakingInfo[user].length; i++) {
            if (stakingInfo[user][i].isActive) {
                activeCount++;
            }
        }
        
        return activeCount;
    }

    /**
     * @dev Get user's vesting schedules count
     */
    function getUserVestingSchedulesCount(address user) external view returns (uint256) {
        return vestingSchedules[user].length;
    }

    /**
     * @dev Get releasable vested amount
     */
    function getReleasableAmount(address beneficiary, uint256 scheduleIndex) external view returns (uint256) {
        return _calculateReleasableAmount(beneficiary, scheduleIndex);
    }

    /**
     * @dev Override transfer to update voting power
     */
    function _beforeTokenTransfer(address from, address to, uint256 amount)
        internal
        whenNotPaused
        override(ERC20Upgradeable, ERC20PausableUpgradeable)
    {
        super._beforeTokenTransfer(from, to, amount);
        
        if (from != address(0)) {
            _updateVotingPower(from);
        }
        if (to != address(0)) {
            _updateVotingPower(to);
        }
    }

    /**
     * @dev Pause token transfers
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause token transfers
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @dev Required by UUPSUpgradeable
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}