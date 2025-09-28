// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title CrossChainBridge
 * @dev Secure cross-chain bridge for asset transfers between supported networks
 */
contract CrossChainBridge is
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // Roles
    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");

    // Chain information
    struct ChainInfo {
        uint256 chainId;
        bool isActive;
        uint256 minTransferAmount;
        uint256 maxTransferAmount;
        uint256 dailyLimit;
        uint256 dailyTransferred;
        uint256 lastResetTime;
        uint256 baseFee;
        uint256 feePercentage; // in basis points (100 = 1%)
    }

    // Bridge transaction
    struct BridgeTransaction {
        address sender;
        address recipient;
        address token;
        uint256 amount;
        uint256 sourceChainId;
        uint256 targetChainId;
        uint256 nonce;
        uint256 timestamp;
        bool completed;
        bytes32 txHash;
    }

    // Validator signature
    struct ValidatorSignature {
        address validator;
        bytes signature;
    }

    // State variables
    mapping(uint256 => ChainInfo) public supportedChains;
    mapping(address => mapping(uint256 => bool)) public supportedTokens; // token => chainId => supported
    mapping(bytes32 => BridgeTransaction) public bridgeTransactions;
    mapping(bytes32 => bool) public processedTransactions;
    mapping(address => uint256) public nonces;

    // Validator management
    address[] public validators;
    mapping(address => bool) public isValidator;
    uint256 public requiredValidators;
    uint256 public minValidatorSignatures;

    // Emergency controls
    bool public emergencyMode;
    uint256 public emergencyWithdrawDelay;
    mapping(address => uint256) public emergencyWithdrawRequests;

    // Liquidity management
    mapping(address => uint256) public tokenLiquidity;
    mapping(uint256 => mapping(address => uint256)) public chainTokenLiquidity;

    // Events
    event ChainAdded(uint256 indexed chainId, bool isActive);
    event ChainUpdated(uint256 indexed chainId, bool isActive);
    event TokenSupported(address indexed token, uint256 indexed chainId, bool supported);
    event BridgeInitiated(
        bytes32 indexed transactionId,
        address indexed sender,
        address indexed recipient,
        address token,
        uint256 amount,
        uint256 sourceChainId,
        uint256 targetChainId,
        uint256 nonce
    );
    event BridgeCompleted(bytes32 indexed transactionId, bytes32 indexed targetTxHash);
    event ValidatorAdded(address indexed validator);
    event ValidatorRemoved(address indexed validator);
    event EmergencyModeToggled(bool enabled);
    event LiquidityAdded(address indexed token, uint256 amount);
    event LiquidityRemoved(address indexed token, uint256 amount);

    // Modifiers
    modifier onlyValidator() {
        require(isValidator[msg.sender], "CrossChainBridge: Not a validator");
        _;
    }

    modifier onlyActiveChain(uint256 chainId) {
        require(supportedChains[chainId].isActive, "CrossChainBridge: Chain not active");
        _;
    }

    modifier notInEmergencyMode() {
        require(!emergencyMode, "CrossChainBridge: Emergency mode active");
        _;
    }

    /**
     * @dev Initialize the bridge contract
     */
    function initialize(
        address[] memory _validators,
        uint256 _requiredValidators,
        uint256 _minValidatorSignatures
    ) public initializer {
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);
        _grantRole(EMERGENCY_ROLE, msg.sender);

        require(_validators.length >= _requiredValidators, "CrossChainBridge: Insufficient validators");
        require(_minValidatorSignatures <= _requiredValidators, "CrossChainBridge: Invalid signature requirement");

        for (uint256 i = 0; i < _validators.length; i++) {
            validators.push(_validators[i]);
            isValidator[_validators[i]] = true;
            _grantRole(VALIDATOR_ROLE, _validators[i]);
            emit ValidatorAdded(_validators[i]);
        }

        requiredValidators = _requiredValidators;
        minValidatorSignatures = _minValidatorSignatures;
        emergencyWithdrawDelay = 7 days;
    }

    /**
     * @dev Add support for a new chain
     */
    function addChain(
        uint256 chainId,
        uint256 minTransferAmount,
        uint256 maxTransferAmount,
        uint256 dailyLimit,
        uint256 baseFee,
        uint256 feePercentage
    ) external onlyRole(OPERATOR_ROLE) {
        require(chainId != block.chainid, "CrossChainBridge: Cannot add current chain");
        require(!supportedChains[chainId].isActive, "CrossChainBridge: Chain already exists");

        supportedChains[chainId] = ChainInfo({
            chainId: chainId,
            isActive: true,
            minTransferAmount: minTransferAmount,
            maxTransferAmount: maxTransferAmount,
            dailyLimit: dailyLimit,
            dailyTransferred: 0,
            lastResetTime: block.timestamp,
            baseFee: baseFee,
            feePercentage: feePercentage
        });

        emit ChainAdded(chainId, true);
    }

    /**
     * @dev Update chain configuration
     */
    function updateChain(
        uint256 chainId,
        bool isActive,
        uint256 minTransferAmount,
        uint256 maxTransferAmount,
        uint256 dailyLimit,
        uint256 baseFee,
        uint256 feePercentage
    ) external onlyRole(OPERATOR_ROLE) {
        require(supportedChains[chainId].chainId != 0, "CrossChainBridge: Chain not found");

        ChainInfo storage chain = supportedChains[chainId];
        chain.isActive = isActive;
        chain.minTransferAmount = minTransferAmount;
        chain.maxTransferAmount = maxTransferAmount;
        chain.dailyLimit = dailyLimit;
        chain.baseFee = baseFee;
        chain.feePercentage = feePercentage;

        emit ChainUpdated(chainId, isActive);
    }

    /**
     * @dev Add token support for specific chain
     */
    function setSupportedToken(
        address token,
        uint256 chainId,
        bool supported
    ) external onlyRole(OPERATOR_ROLE) {
        require(supportedChains[chainId].isActive, "CrossChainBridge: Chain not active");
        supportedTokens[token][chainId] = supported;
        emit TokenSupported(token, chainId, supported);
    }

    /**
     * @dev Initiate bridge transfer
     */
    function initiateBridge(
        address token,
        uint256 amount,
        uint256 targetChainId,
        address recipient
    ) external payable nonReentrant whenNotPaused notInEmergencyMode onlyActiveChain(targetChainId) {
        require(supportedTokens[token][targetChainId], "CrossChainBridge: Token not supported on target chain");
        require(recipient != address(0), "CrossChainBridge: Invalid recipient");

        ChainInfo storage targetChain = supportedChains[targetChainId];
        require(amount >= targetChain.minTransferAmount, "CrossChainBridge: Amount below minimum");
        require(amount <= targetChain.maxTransferAmount, "CrossChainBridge: Amount above maximum");

        // Check daily limit
        if (block.timestamp >= targetChain.lastResetTime + 1 days) {
            targetChain.dailyTransferred = 0;
            targetChain.lastResetTime = block.timestamp;
        }
        require(
            targetChain.dailyTransferred + amount <= targetChain.dailyLimit,
            "CrossChainBridge: Daily limit exceeded"
        );

        // Calculate fees
        uint256 fee = targetChain.baseFee + (amount * targetChain.feePercentage) / 10000;
        require(msg.value >= fee, "CrossChainBridge: Insufficient fee");

        // Transfer tokens to bridge
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Update liquidity
        tokenLiquidity[token] += amount;
        chainTokenLiquidity[block.chainid][token] += amount;

        // Update daily transfer limit
        targetChain.dailyTransferred += amount;

        // Create transaction record
        uint256 nonce = nonces[msg.sender]++;
        bytes32 transactionId = keccak256(abi.encodePacked(
            msg.sender,
            recipient,
            token,
            amount,
            block.chainid,
            targetChainId,
            nonce,
            block.timestamp
        ));

        bridgeTransactions[transactionId] = BridgeTransaction({
            sender: msg.sender,
            recipient: recipient,
            token: token,
            amount: amount,
            sourceChainId: block.chainid,
            targetChainId: targetChainId,
            nonce: nonce,
            timestamp: block.timestamp,
            completed: false,
            txHash: bytes32(0)
        });

        emit BridgeInitiated(
            transactionId,
            msg.sender,
            recipient,
            token,
            amount,
            block.chainid,
            targetChainId,
            nonce
        );

        // Refund excess fee
        if (msg.value > fee) {
            payable(msg.sender).transfer(msg.value - fee);
        }
    }

    /**
     * @dev Complete bridge transfer with validator signatures
     */
    function completeBridge(
        bytes32 transactionId,
        bytes32 sourceTransactionHash,
        ValidatorSignature[] memory signatures
    ) external nonReentrant whenNotPaused notInEmergencyMode {
        require(!processedTransactions[transactionId], "CrossChainBridge: Transaction already processed");
        require(signatures.length >= minValidatorSignatures, "CrossChainBridge: Insufficient signatures");

        // Verify signatures
        bytes32 messageHash = keccak256(abi.encodePacked(transactionId, sourceTransactionHash))
            .toEthSignedMessageHash();

        address[] memory signers = new address[](signatures.length);
        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = messageHash.recover(signatures[i].signature);
            require(isValidator[signer], "CrossChainBridge: Invalid validator signature");

            // Check for duplicate signers
            for (uint256 j = 0; j < i; j++) {
                require(signers[j] != signer, "CrossChainBridge: Duplicate signature");
            }
            signers[i] = signer;
        }

        // Get transaction details (would be from source chain in real implementation)
        BridgeTransaction memory bridgeTx = getBridgeTransactionFromSource(transactionId, sourceTransactionHash);

        require(bridgeTx.targetChainId == block.chainid, "CrossChainBridge: Wrong target chain");
        require(supportedTokens[bridgeTx.token][block.chainid], "CrossChainBridge: Token not supported");

        // Check liquidity
        require(
            tokenLiquidity[bridgeTx.token] >= bridgeTx.amount,
            "CrossChainBridge: Insufficient liquidity"
        );

        // Transfer tokens to recipient
        IERC20(bridgeTx.token).safeTransfer(bridgeTx.recipient, bridgeTx.amount);

        // Update liquidity
        tokenLiquidity[bridgeTx.token] -= bridgeTx.amount;
        chainTokenLiquidity[block.chainid][bridgeTx.token] -= bridgeTx.amount;

        // Mark as processed
        processedTransactions[transactionId] = true;

        emit BridgeCompleted(transactionId, sourceTransactionHash);
    }

    /**
     * @dev Get bridge transaction from source chain (placeholder for oracle/relayer implementation)
     */
    function getBridgeTransactionFromSource(
        bytes32 transactionId,
        bytes32 sourceTransactionHash
    ) internal pure returns (BridgeTransaction memory) {
        // This would be implemented with oracle or relayer service
        // For now, return empty transaction - would be filled by off-chain service
        return BridgeTransaction({
            sender: address(0),
            recipient: address(0),
            token: address(0),
            amount: 0,
            sourceChainId: 0,
            targetChainId: 0,
            nonce: 0,
            timestamp: 0,
            completed: false,
            txHash: sourceTransactionHash
        });
    }

    /**
     * @dev Add liquidity for bridge operations
     */
    function addLiquidity(address token, uint256 amount) external onlyRole(OPERATOR_ROLE) {
        require(amount > 0, "CrossChainBridge: Invalid amount");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        tokenLiquidity[token] += amount;
        chainTokenLiquidity[block.chainid][token] += amount;

        emit LiquidityAdded(token, amount);
    }

    /**
     * @dev Remove liquidity (emergency function)
     */
    function removeLiquidity(
        address token,
        uint256 amount,
        address recipient
    ) external onlyRole(EMERGENCY_ROLE) {
        require(tokenLiquidity[token] >= amount, "CrossChainBridge: Insufficient liquidity");

        tokenLiquidity[token] -= amount;
        chainTokenLiquidity[block.chainid][token] -= amount;
        IERC20(token).safeTransfer(recipient, amount);

        emit LiquidityRemoved(token, amount);
    }

    /**
     * @dev Add validator
     */
    function addValidator(address validator) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!isValidator[validator], "CrossChainBridge: Already validator");

        validators.push(validator);
        isValidator[validator] = true;
        _grantRole(VALIDATOR_ROLE, validator);

        emit ValidatorAdded(validator);
    }

    /**
     * @dev Remove validator
     */
    function removeValidator(address validator) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(isValidator[validator], "CrossChainBridge: Not a validator");
        require(validators.length > requiredValidators, "CrossChainBridge: Cannot remove required validator");

        isValidator[validator] = false;
        _revokeRole(VALIDATOR_ROLE, validator);

        // Remove from validators array
        for (uint256 i = 0; i < validators.length; i++) {
            if (validators[i] == validator) {
                validators[i] = validators[validators.length - 1];
                validators.pop();
                break;
            }
        }

        emit ValidatorRemoved(validator);
    }

    /**
     * @dev Toggle emergency mode
     */
    function toggleEmergencyMode() external onlyRole(EMERGENCY_ROLE) {
        emergencyMode = !emergencyMode;
        emit EmergencyModeToggled(emergencyMode);
    }

    /**
     * @dev Emergency withdraw request
     */
    function requestEmergencyWithdraw() external onlyRole(EMERGENCY_ROLE) {
        emergencyWithdrawRequests[msg.sender] = block.timestamp;
    }

    /**
     * @dev Execute emergency withdraw after delay
     */
    function executeEmergencyWithdraw(
        address token,
        address recipient
    ) external onlyRole(EMERGENCY_ROLE) {
        require(
            emergencyWithdrawRequests[msg.sender] != 0 &&
            block.timestamp >= emergencyWithdrawRequests[msg.sender] + emergencyWithdrawDelay,
            "CrossChainBridge: Emergency withdraw not ready"
        );

        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            IERC20(token).safeTransfer(recipient, balance);
        }

        emergencyWithdrawRequests[msg.sender] = 0;
    }

    /**
     * @dev Pause contract
     */
    function pause() external onlyRole(EMERGENCY_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause contract
     */
    function unpause() external onlyRole(EMERGENCY_ROLE) {
        _unpause();
    }

    // View functions
    function getValidators() external view returns (address[] memory) {
        return validators;
    }

    function getChainInfo(uint256 chainId) external view returns (ChainInfo memory) {
        return supportedChains[chainId];
    }

    function isTokenSupported(address token, uint256 chainId) external view returns (bool) {
        return supportedTokens[token][chainId];
    }

    function getTokenLiquidity(address token) external view returns (uint256) {
        return tokenLiquidity[token];
    }

    function getChainTokenLiquidity(uint256 chainId, address token) external view returns (uint256) {
        return chainTokenLiquidity[chainId][token];
    }

    function getBridgeTransaction(bytes32 transactionId) external view returns (BridgeTransaction memory) {
        return bridgeTransactions[transactionId];
    }

    function isTransactionProcessed(bytes32 transactionId) external view returns (bool) {
        return processedTransactions[transactionId];
    }
}