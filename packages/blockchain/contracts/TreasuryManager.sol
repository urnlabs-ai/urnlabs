// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title TreasuryManager
 * @dev Multi-signature treasury management with spending limits and approval workflows
 */
contract TreasuryManager is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // Roles
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant TREASURER_ROLE = keccak256("TREASURER_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant DAO_ROLE = keccak256("DAO_ROLE");

    // Transaction types
    enum TransactionType {
        Transfer,
        Investment,
        Grant,
        Emergency,
        Governance
    }

    // Transaction states
    enum TransactionState {
        Pending,
        Approved,
        Executed,
        Rejected,
        Expired
    }

    // Transaction struct
    struct Transaction {
        uint256 id;
        TransactionType txType;
        address proposer;
        address recipient;
        address token;
        uint256 amount;
        bytes data;
        string description;
        uint256 proposedAt;
        uint256 executeAfter;
        uint256 expiresAt;
        TransactionState state;
        uint256 approvalsCount;
        uint256 rejectionsCount;
        mapping(address => bool) approvals;
        mapping(address => bool) rejections;
    }

    // Spending limit struct
    struct SpendingLimit {
        uint256 dailyLimit;
        uint256 monthlyLimit;
        uint256 dailySpent;
        uint256 monthlySpent;
        uint256 lastDayReset;
        uint256 lastMonthReset;
    }

    // Budget allocation struct
    struct BudgetAllocation {
        string category;
        uint256 allocated;
        uint256 spent;
        uint256 remaining;
        bool active;
        uint256 resetPeriod; // seconds
        uint256 lastReset;
    }

    // Multi-sig configuration
    struct MultiSigConfig {
        uint256 requiredApprovals;
        uint256 treasurerCount;
        uint256 approvalTimelock;
        uint256 executionWindow;
        bool emergencyMode;
    }

    // State variables
    uint256 public transactionCount;
    mapping(uint256 => Transaction) public transactions;
    mapping(address => bool) public treasurers;
    mapping(address => SpendingLimit) public spendingLimits;
    mapping(string => BudgetAllocation) public budgetAllocations;

    MultiSigConfig public multiSigConfig;
    address[] public treasurersList;

    // Emergency controls
    bool public emergencyFreeze;
    mapping(address => bool) public emergencyTreasurers;
    uint256 public emergencyApprovalThreshold;

    // Revenue tracking
    mapping(address => uint256) public totalRevenue;
    mapping(address => uint256) public totalExpenses;
    mapping(string => uint256) public categoryExpenses;

    // Investment tracking
    mapping(address => uint256) public investmentAllocations;
    mapping(address => bool) public approvedInvestments;

    // Events
    event TransactionProposed(
        uint256 indexed id,
        TransactionType indexed txType,
        address indexed proposer,
        address recipient,
        address token,
        uint256 amount,
        string description
    );

    event TransactionApproved(
        uint256 indexed id,
        address indexed approver,
        uint256 approvalsCount,
        uint256 requiredApprovals
    );

    event TransactionRejected(
        uint256 indexed id,
        address indexed rejector,
        string reason
    );

    event TransactionExecuted(
        uint256 indexed id,
        address indexed executor,
        bytes result
    );

    event TreasurerAdded(address indexed treasurer);
    event TreasurerRemoved(address indexed treasurer);

    event SpendingLimitUpdated(
        address indexed token,
        uint256 dailyLimit,
        uint256 monthlyLimit
    );

    event BudgetAllocationCreated(
        string indexed category,
        uint256 allocated,
        uint256 resetPeriod
    );

    event EmergencyFreeze(bool enabled);
    event RevenueReceived(address indexed token, uint256 amount, string source);

    /**
     * @dev Initialize the treasury manager
     */
    function initialize(
        address[] memory _treasurers,
        uint256 _requiredApprovals,
        uint256 _approvalTimelock,
        uint256 _executionWindow
    ) public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);

        require(_treasurers.length >= _requiredApprovals, "Invalid treasurer count");
        require(_requiredApprovals > 0, "Invalid required approvals");

        multiSigConfig = MultiSigConfig({
            requiredApprovals: _requiredApprovals,
            treasurerCount: _treasurers.length,
            approvalTimelock: _approvalTimelock,
            executionWindow: _executionWindow,
            emergencyMode: false
        });

        for (uint256 i = 0; i < _treasurers.length; i++) {
            treasurers[_treasurers[i]] = true;
            treasurersList.push(_treasurers[i]);
            _grantRole(TREASURER_ROLE, _treasurers[i]);
            emergencyTreasurers[_treasurers[i]] = true;
        }

        emergencyApprovalThreshold = (_treasurers.length * 60) / 100; // 60% threshold
    }

    /**
     * @dev Propose a new transaction
     */
    function proposeTransaction(
        TransactionType txType,
        address recipient,
        address token,
        uint256 amount,
        bytes memory data,
        string memory description
    ) external onlyRole(TREASURER_ROLE) whenNotPaused returns (uint256) {
        require(!emergencyFreeze, "Treasury is frozen");
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Invalid amount");

        // Check spending limits for non-emergency transactions
        if (txType != TransactionType.Emergency) {
            _checkSpendingLimits(token, amount);
        }

        // Check budget allocation if applicable
        if (txType == TransactionType.Grant) {
            _checkBudgetAllocation("grants", amount);
        }

        transactionCount++;
        uint256 txId = transactionCount;

        Transaction storage newTx = transactions[txId];
        newTx.id = txId;
        newTx.txType = txType;
        newTx.proposer = msg.sender;
        newTx.recipient = recipient;
        newTx.token = token;
        newTx.amount = amount;
        newTx.data = data;
        newTx.description = description;
        newTx.proposedAt = block.timestamp;
        newTx.executeAfter = block.timestamp + multiSigConfig.approvalTimelock;
        newTx.expiresAt = block.timestamp + multiSigConfig.approvalTimelock + multiSigConfig.executionWindow;
        newTx.state = TransactionState.Pending;

        // Auto-approve for emergency mode if enabled
        if (multiSigConfig.emergencyMode && txType == TransactionType.Emergency) {
            newTx.approvals[msg.sender] = true;
            newTx.approvalsCount = 1;
        }

        emit TransactionProposed(
            txId,
            txType,
            msg.sender,
            recipient,
            token,
            amount,
            description
        );

        return txId;
    }

    /**
     * @dev Approve a pending transaction
     */
    function approveTransaction(uint256 txId) external onlyRole(TREASURER_ROLE) {
        Transaction storage tx = transactions[txId];
        require(tx.id != 0, "Transaction does not exist");
        require(tx.state == TransactionState.Pending, "Transaction not pending");
        require(!tx.approvals[msg.sender], "Already approved");
        require(block.timestamp < tx.expiresAt, "Transaction expired");

        tx.approvals[msg.sender] = true;
        tx.approvalsCount++;

        emit TransactionApproved(
            txId,
            msg.sender,
            tx.approvalsCount,
            multiSigConfig.requiredApprovals
        );

        // Auto-execute if threshold reached and timelock passed
        if (tx.approvalsCount >= multiSigConfig.requiredApprovals &&
            block.timestamp >= tx.executeAfter) {
            _executeTransaction(txId);
        }
    }

    /**
     * @dev Reject a pending transaction
     */
    function rejectTransaction(uint256 txId, string memory reason) external onlyRole(TREASURER_ROLE) {
        Transaction storage tx = transactions[txId];
        require(tx.id != 0, "Transaction does not exist");
        require(tx.state == TransactionState.Pending, "Transaction not pending");
        require(!tx.rejections[msg.sender], "Already rejected");

        tx.rejections[msg.sender] = true;
        tx.rejectionsCount++;

        emit TransactionRejected(txId, msg.sender, reason);

        // If majority rejects, mark as rejected
        if (tx.rejectionsCount > multiSigConfig.treasurerCount / 2) {
            tx.state = TransactionState.Rejected;
        }
    }

    /**
     * @dev Execute an approved transaction
     */
    function executeTransaction(uint256 txId) external onlyRole(TREASURER_ROLE) nonReentrant {
        _executeTransaction(txId);
    }

    /**
     * @dev Internal transaction execution
     */
    function _executeTransaction(uint256 txId) internal {
        Transaction storage tx = transactions[txId];
        require(tx.id != 0, "Transaction does not exist");
        require(tx.state == TransactionState.Pending, "Transaction not pending");
        require(tx.approvalsCount >= multiSigConfig.requiredApprovals, "Insufficient approvals");
        require(block.timestamp >= tx.executeAfter, "Timelock not passed");
        require(block.timestamp < tx.expiresAt, "Transaction expired");

        tx.state = TransactionState.Executed;

        // Update spending limits and budget
        _updateSpendingLimits(tx.token, tx.amount);
        _updateBudgetAllocation(tx.txType, tx.amount);

        // Track expenses
        totalExpenses[tx.token] += tx.amount;
        categoryExpenses[_getTransactionCategory(tx.txType)] += tx.amount;

        bytes memory result;

        if (tx.token == address(0)) {
            // ETH transfer
            require(address(this).balance >= tx.amount, "Insufficient ETH balance");
            (bool success, bytes memory returnData) = tx.recipient.call{value: tx.amount}(tx.data);
            require(success, "ETH transfer failed");
            result = returnData;
        } else {
            // ERC20 transfer
            IERC20 tokenContract = IERC20(tx.token);
            require(tokenContract.balanceOf(address(this)) >= tx.amount, "Insufficient token balance");

            if (tx.data.length > 0) {
                // Custom call with token transfer
                tokenContract.safeTransfer(tx.recipient, tx.amount);
                (bool success, bytes memory returnData) = tx.recipient.call(tx.data);
                require(success, "Custom call failed");
                result = returnData;
            } else {
                // Simple token transfer
                tokenContract.safeTransfer(tx.recipient, tx.amount);
            }
        }

        emit TransactionExecuted(txId, msg.sender, result);
    }

    /**
     * @dev Check spending limits
     */
    function _checkSpendingLimits(address token, uint256 amount) internal view {
        SpendingLimit storage limit = spendingLimits[token];

        if (limit.dailyLimit > 0) {
            uint256 dailySpent = _getCurrentDailySpent(token);
            require(dailySpent + amount <= limit.dailyLimit, "Daily spending limit exceeded");
        }

        if (limit.monthlyLimit > 0) {
            uint256 monthlySpent = _getCurrentMonthlySpent(token);
            require(monthlySpent + amount <= limit.monthlyLimit, "Monthly spending limit exceeded");
        }
    }

    /**
     * @dev Update spending limits after execution
     */
    function _updateSpendingLimits(address token, uint256 amount) internal {
        SpendingLimit storage limit = spendingLimits[token];

        // Reset daily if needed
        if (block.timestamp >= limit.lastDayReset + 1 days) {
            limit.dailySpent = 0;
            limit.lastDayReset = block.timestamp;
        }

        // Reset monthly if needed
        if (block.timestamp >= limit.lastMonthReset + 30 days) {
            limit.monthlySpent = 0;
            limit.lastMonthReset = block.timestamp;
        }

        limit.dailySpent += amount;
        limit.monthlySpent += amount;
    }

    /**
     * @dev Check budget allocation
     */
    function _checkBudgetAllocation(string memory category, uint256 amount) internal view {
        BudgetAllocation storage budget = budgetAllocations[category];
        if (budget.active) {
            require(budget.remaining >= amount, "Budget allocation exceeded");
        }
    }

    /**
     * @dev Update budget allocation
     */
    function _updateBudgetAllocation(TransactionType txType, uint256 amount) internal {
        string memory category = _getTransactionCategory(txType);
        BudgetAllocation storage budget = budgetAllocations[category];

        if (budget.active) {
            budget.spent += amount;
            budget.remaining = budget.remaining > amount ? budget.remaining - amount : 0;
        }
    }

    /**
     * @dev Get transaction category string
     */
    function _getTransactionCategory(TransactionType txType) internal pure returns (string memory) {
        if (txType == TransactionType.Transfer) return "transfers";
        if (txType == TransactionType.Investment) return "investments";
        if (txType == TransactionType.Grant) return "grants";
        if (txType == TransactionType.Emergency) return "emergency";
        if (txType == TransactionType.Governance) return "governance";
        return "other";
    }

    /**
     * @dev Get current daily spent amount
     */
    function _getCurrentDailySpent(address token) internal view returns (uint256) {
        SpendingLimit storage limit = spendingLimits[token];
        if (block.timestamp >= limit.lastDayReset + 1 days) {
            return 0;
        }
        return limit.dailySpent;
    }

    /**
     * @dev Get current monthly spent amount
     */
    function _getCurrentMonthlySpent(address token) internal view returns (uint256) {
        SpendingLimit storage limit = spendingLimits[token];
        if (block.timestamp >= limit.lastMonthReset + 30 days) {
            return 0;
        }
        return limit.monthlySpent;
    }

    /**
     * @dev Set spending limits for a token
     */
    function setSpendingLimits(
        address token,
        uint256 dailyLimit,
        uint256 monthlyLimit
    ) external onlyRole(ADMIN_ROLE) {
        SpendingLimit storage limit = spendingLimits[token];
        limit.dailyLimit = dailyLimit;
        limit.monthlyLimit = monthlyLimit;

        if (limit.lastDayReset == 0) {
            limit.lastDayReset = block.timestamp;
        }
        if (limit.lastMonthReset == 0) {
            limit.lastMonthReset = block.timestamp;
        }

        emit SpendingLimitUpdated(token, dailyLimit, monthlyLimit);
    }

    /**
     * @dev Create budget allocation
     */
    function createBudgetAllocation(
        string memory category,
        uint256 allocated,
        uint256 resetPeriod
    ) external onlyRole(ADMIN_ROLE) {
        BudgetAllocation storage budget = budgetAllocations[category];
        budget.category = category;
        budget.allocated = allocated;
        budget.remaining = allocated;
        budget.active = true;
        budget.resetPeriod = resetPeriod;
        budget.lastReset = block.timestamp;

        emit BudgetAllocationCreated(category, allocated, resetPeriod);
    }

    /**
     * @dev Add treasurer
     */
    function addTreasurer(address treasurer) external onlyRole(ADMIN_ROLE) {
        require(!treasurers[treasurer], "Already a treasurer");

        treasurers[treasurer] = true;
        treasurersList.push(treasurer);
        _grantRole(TREASURER_ROLE, treasurer);
        emergencyTreasurers[treasurer] = true;

        multiSigConfig.treasurerCount++;

        emit TreasurerAdded(treasurer);
    }

    /**
     * @dev Remove treasurer
     */
    function removeTreasurer(address treasurer) external onlyRole(ADMIN_ROLE) {
        require(treasurers[treasurer], "Not a treasurer");
        require(multiSigConfig.treasurerCount > multiSigConfig.requiredApprovals, "Cannot remove required treasurer");

        treasurers[treasurer] = false;
        _revokeRole(TREASURER_ROLE, treasurer);
        emergencyTreasurers[treasurer] = false;

        // Remove from list
        for (uint256 i = 0; i < treasurersList.length; i++) {
            if (treasurersList[i] == treasurer) {
                treasurersList[i] = treasurersList[treasurersList.length - 1];
                treasurersList.pop();
                break;
            }
        }

        multiSigConfig.treasurerCount--;

        emit TreasurerRemoved(treasurer);
    }

    /**
     * @dev Record revenue
     */
    function recordRevenue(
        address token,
        uint256 amount,
        string memory source
    ) external onlyRole(DAO_ROLE) {
        totalRevenue[token] += amount;
        emit RevenueReceived(token, amount, source);
    }

    /**
     * @dev Emergency freeze
     */
    function emergencyFreeze(bool enabled) external onlyRole(GUARDIAN_ROLE) {
        emergencyFreeze = enabled;
        emit EmergencyFreeze(enabled);
    }

    /**
     * @dev Get transaction details
     */
    function getTransaction(uint256 txId) external view returns (
        TransactionType txType,
        address proposer,
        address recipient,
        address token,
        uint256 amount,
        string memory description,
        uint256 proposedAt,
        uint256 executeAfter,
        uint256 expiresAt,
        TransactionState state,
        uint256 approvalsCount,
        uint256 rejectionsCount
    ) {
        Transaction storage tx = transactions[txId];
        return (
            tx.txType,
            tx.proposer,
            tx.recipient,
            tx.token,
            tx.amount,
            tx.description,
            tx.proposedAt,
            tx.executeAfter,
            tx.expiresAt,
            tx.state,
            tx.approvalsCount,
            tx.rejectionsCount
        );
    }

    /**
     * @dev Get treasury balance
     */
    function getTreasuryBalance(address token) external view returns (uint256) {
        if (token == address(0)) {
            return address(this).balance;
        }
        return IERC20(token).balanceOf(address(this));
    }

    /**
     * @dev Get spending limits
     */
    function getSpendingLimits(address token) external view returns (
        uint256 dailyLimit,
        uint256 monthlyLimit,
        uint256 dailySpent,
        uint256 monthlySpent
    ) {
        SpendingLimit storage limit = spendingLimits[token];
        return (
            limit.dailyLimit,
            limit.monthlyLimit,
            _getCurrentDailySpent(token),
            _getCurrentMonthlySpent(token)
        );
    }

    /**
     * @dev Get budget allocation
     */
    function getBudgetAllocation(string memory category) external view returns (
        uint256 allocated,
        uint256 spent,
        uint256 remaining,
        bool active
    ) {
        BudgetAllocation storage budget = budgetAllocations[category];
        return (budget.allocated, budget.spent, budget.remaining, budget.active);
    }

    /**
     * @dev Get treasurers list
     */
    function getTreasurers() external view returns (address[] memory) {
        return treasurersList;
    }

    /**
     * @dev Receive ETH
     */
    receive() external payable {
        totalRevenue[address(0)] += msg.value;
        emit RevenueReceived(address(0), msg.value, "Direct transfer");
    }
}