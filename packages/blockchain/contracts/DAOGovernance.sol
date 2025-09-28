// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./UrnToken.sol";

/**
 * @title DAOGovernance
 * @dev Comprehensive DAO governance system with proposal management, voting, and treasury integration
 */
contract DAOGovernance is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    using SafeERC20 for IERC20;

    // Roles
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    // Proposal states
    enum ProposalState {
        Pending,
        Active,
        Canceled,
        Defeated,
        Succeeded,
        Queued,
        Expired,
        Executed
    }

    // Vote types
    enum VoteType {
        Against,
        For,
        Abstain
    }

    // Proposal struct
    struct Proposal {
        uint256 id;
        address proposer;
        string title;
        string description;
        string ipfsHash; // Additional metadata stored on IPFS
        address[] targets;
        uint256[] values;
        bytes[] calldatas;
        string[] signatures;
        uint256 startBlock;
        uint256 endBlock;
        uint256 eta; // Execution time after timelock
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        bool canceled;
        bool executed;
        mapping(address => Receipt) receipts;
    }

    // Vote receipt
    struct Receipt {
        bool hasVoted;
        uint8 support; // VoteType
        uint256 votes;
    }

    // Governance parameters
    struct GovernanceParams {
        uint256 proposalThreshold; // Minimum tokens to create proposal
        uint256 quorumVotes; // Minimum votes for quorum
        uint256 votingDelay; // Blocks before voting starts
        uint256 votingPeriod; // Blocks for voting duration
        uint256 timelockDelay; // Timelock delay for execution
        uint256 gracePeriod; // Grace period after timelock
        uint256 proposalMaxOperations; // Max operations per proposal
    }

    // State variables
    UrnToken public urnToken;
    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(address => uint256) public latestProposalIds;
    GovernanceParams public params;

    // Timelock functionality
    mapping(bytes32 => bool) public queuedTransactions;
    mapping(bytes32 => uint256) public timelockedTransactions;

    // Treasury integration
    address public treasury;
    mapping(address => bool) public treasuryTokens;

    // Delegation tracking
    mapping(address => address) public delegates;
    mapping(address => mapping(uint256 => uint256)) public checkpoints;
    mapping(address => uint256) public numCheckpoints;

    // Events
    event ProposalCreated(
        uint256 indexed id,
        address indexed proposer,
        address[] targets,
        uint256[] values,
        string[] signatures,
        bytes[] calldatas,
        uint256 startBlock,
        uint256 endBlock,
        string title,
        string description
    );

    event VoteCast(
        address indexed voter,
        uint256 indexed proposalId,
        uint8 support,
        uint256 votes,
        string reason
    );

    event ProposalCanceled(uint256 indexed id);
    event ProposalQueued(uint256 indexed id, uint256 eta);
    event ProposalExecuted(uint256 indexed id);

    event DelegateChanged(
        address indexed delegator,
        address indexed fromDelegate,
        address indexed toDelegate
    );

    event DelegateVotesChanged(
        address indexed delegate,
        uint256 previousBalance,
        uint256 newBalance
    );

    event TransactionQueued(bytes32 indexed txHash, uint256 eta);
    event TransactionExecuted(bytes32 indexed txHash);
    event TransactionCanceled(bytes32 indexed txHash);

    event TreasuryTokenAdded(address indexed token);
    event TreasuryTokenRemoved(address indexed token);

    /**
     * @dev Initialize the governance contract
     */
    function initialize(
        address _urnToken,
        address _treasury,
        GovernanceParams memory _params
    ) public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(PROPOSER_ROLE, msg.sender);
        _grantRole(EXECUTOR_ROLE, msg.sender);
        _grantRole(GUARDIAN_ROLE, msg.sender);

        urnToken = UrnToken(_urnToken);
        treasury = _treasury;
        params = _params;

        // Validate parameters
        require(_params.proposalThreshold > 0, "Invalid proposal threshold");
        require(_params.quorumVotes > 0, "Invalid quorum");
        require(_params.votingDelay > 0, "Invalid voting delay");
        require(_params.votingPeriod > 0, "Invalid voting period");
        require(_params.timelockDelay >= 172800, "Timelock too short"); // Minimum 2 days
        require(_params.proposalMaxOperations <= 10, "Too many operations");
    }

    /**
     * @dev Create a new proposal
     */
    function propose(
        address[] memory targets,
        uint256[] memory values,
        string[] memory signatures,
        bytes[] memory calldatas,
        string memory title,
        string memory description,
        string memory ipfsHash
    ) external whenNotPaused returns (uint256) {
        require(
            getVotes(msg.sender, block.number - 1) >= params.proposalThreshold,
            "Proposer votes below threshold"
        );
        require(
            targets.length == values.length &&
            targets.length == signatures.length &&
            targets.length == calldatas.length,
            "Proposal function information mismatch"
        );
        require(targets.length != 0, "Must provide actions");
        require(targets.length <= params.proposalMaxOperations, "Too many actions");

        uint256 latestProposalId = latestProposalIds[msg.sender];
        if (latestProposalId != 0) {
            ProposalState proposersLatestProposalState = state(latestProposalId);
            require(
                proposersLatestProposalState != ProposalState.Active,
                "One live proposal per proposer"
            );
            require(
                proposersLatestProposalState != ProposalState.Pending,
                "One live proposal per proposer"
            );
        }

        uint256 startBlock = block.number + params.votingDelay;
        uint256 endBlock = startBlock + params.votingPeriod;

        proposalCount++;
        uint256 newProposalId = proposalCount;

        Proposal storage newProposal = proposals[newProposalId];
        newProposal.id = newProposalId;
        newProposal.proposer = msg.sender;
        newProposal.title = title;
        newProposal.description = description;
        newProposal.ipfsHash = ipfsHash;
        newProposal.targets = targets;
        newProposal.values = values;
        newProposal.calldatas = calldatas;
        newProposal.signatures = signatures;
        newProposal.startBlock = startBlock;
        newProposal.endBlock = endBlock;

        latestProposalIds[msg.sender] = newProposalId;

        emit ProposalCreated(
            newProposalId,
            msg.sender,
            targets,
            values,
            signatures,
            calldatas,
            startBlock,
            endBlock,
            title,
            description
        );

        return newProposalId;
    }

    /**
     * @dev Queue proposal for execution after voting succeeds
     */
    function queue(uint256 proposalId) external {
        require(
            state(proposalId) == ProposalState.Succeeded,
            "Proposal can only be queued if it is succeeded"
        );

        Proposal storage proposal = proposals[proposalId];
        uint256 eta = block.timestamp + params.timelockDelay;
        proposal.eta = eta;

        for (uint256 i = 0; i < proposal.targets.length; i++) {
            bytes32 txHash = keccak256(
                abi.encode(
                    proposal.targets[i],
                    proposal.values[i],
                    proposal.signatures[i],
                    proposal.calldatas[i],
                    eta
                )
            );
            queuedTransactions[txHash] = true;
            timelockedTransactions[txHash] = eta;

            emit TransactionQueued(txHash, eta);
        }

        emit ProposalQueued(proposalId, eta);
    }

    /**
     * @dev Execute a queued proposal
     */
    function execute(uint256 proposalId) external payable nonReentrant {
        require(
            state(proposalId) == ProposalState.Queued,
            "Proposal can only be executed if it is queued"
        );

        Proposal storage proposal = proposals[proposalId];
        proposal.executed = true;

        for (uint256 i = 0; i < proposal.targets.length; i++) {
            bytes32 txHash = keccak256(
                abi.encode(
                    proposal.targets[i],
                    proposal.values[i],
                    proposal.signatures[i],
                    proposal.calldatas[i],
                    proposal.eta
                )
            );

            require(queuedTransactions[txHash], "Transaction not queued");
            require(
                block.timestamp >= timelockedTransactions[txHash],
                "Transaction hasn't surpassed time lock"
            );
            require(
                block.timestamp <= timelockedTransactions[txHash] + params.gracePeriod,
                "Transaction is stale"
            );

            queuedTransactions[txHash] = false;
            delete timelockedTransactions[txHash];

            bytes memory callData;
            if (bytes(proposal.signatures[i]).length == 0) {
                callData = proposal.calldatas[i];
            } else {
                callData = abi.encodePacked(
                    bytes4(keccak256(bytes(proposal.signatures[i]))),
                    proposal.calldatas[i]
                );
            }

            (bool success, ) = proposal.targets[i].call{value: proposal.values[i]}(callData);
            require(success, "Transaction execution reverted");

            emit TransactionExecuted(txHash);
        }

        emit ProposalExecuted(proposalId);
    }

    /**
     * @dev Cancel a proposal
     */
    function cancel(uint256 proposalId) external {
        require(state(proposalId) != ProposalState.Executed, "Cannot cancel executed proposal");

        Proposal storage proposal = proposals[proposalId];

        require(
            msg.sender == proposal.proposer ||
            hasRole(GUARDIAN_ROLE, msg.sender) ||
            getVotes(proposal.proposer, block.number - 1) < params.proposalThreshold,
            "Proposer above threshold"
        );

        proposal.canceled = true;

        // Cancel queued transactions
        if (proposal.eta != 0) {
            for (uint256 i = 0; i < proposal.targets.length; i++) {
                bytes32 txHash = keccak256(
                    abi.encode(
                        proposal.targets[i],
                        proposal.values[i],
                        proposal.signatures[i],
                        proposal.calldatas[i],
                        proposal.eta
                    )
                );
                queuedTransactions[txHash] = false;
                delete timelockedTransactions[txHash];

                emit TransactionCanceled(txHash);
            }
        }

        emit ProposalCanceled(proposalId);
    }

    /**
     * @dev Cast a vote on a proposal
     */
    function castVote(uint256 proposalId, uint8 support) external returns (uint256) {
        return _castVote(msg.sender, proposalId, support, "");
    }

    /**
     * @dev Cast a vote with reason
     */
    function castVoteWithReason(
        uint256 proposalId,
        uint8 support,
        string calldata reason
    ) external returns (uint256) {
        return _castVote(msg.sender, proposalId, support, reason);
    }

    /**
     * @dev Cast vote by signature
     */
    function castVoteBySig(
        uint256 proposalId,
        uint8 support,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("URN DAO")),
                block.chainid,
                address(this)
            )
        );

        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Ballot(uint256 proposalId,uint8 support)"),
                proposalId,
                support
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        address signatory = ecrecover(digest, v, r, s);
        require(signatory != address(0), "Invalid signature");

        return _castVote(signatory, proposalId, support, "");
    }

    /**
     * @dev Internal vote casting logic
     */
    function _castVote(
        address voter,
        uint256 proposalId,
        uint8 support,
        string memory reason
    ) internal returns (uint256) {
        require(state(proposalId) == ProposalState.Active, "Voting is closed");
        require(support <= 2, "Invalid vote type");

        Proposal storage proposal = proposals[proposalId];
        Receipt storage receipt = proposal.receipts[voter];
        require(!receipt.hasVoted, "Voter already voted");

        uint256 votes = getVotes(voter, proposal.startBlock);

        if (support == 0) {
            proposal.againstVotes += votes;
        } else if (support == 1) {
            proposal.forVotes += votes;
        } else {
            proposal.abstainVotes += votes;
        }

        receipt.hasVoted = true;
        receipt.support = support;
        receipt.votes = votes;

        emit VoteCast(voter, proposalId, support, votes, reason);

        return votes;
    }

    /**
     * @dev Get the current state of a proposal
     */
    function state(uint256 proposalId) public view returns (ProposalState) {
        require(proposalCount >= proposalId && proposalId > 0, "Invalid proposal id");

        Proposal storage proposal = proposals[proposalId];

        if (proposal.canceled) {
            return ProposalState.Canceled;
        } else if (block.number <= proposal.startBlock) {
            return ProposalState.Pending;
        } else if (block.number <= proposal.endBlock) {
            return ProposalState.Active;
        } else if (proposal.forVotes <= proposal.againstVotes || proposal.forVotes < params.quorumVotes) {
            return ProposalState.Defeated;
        } else if (proposal.eta == 0) {
            return ProposalState.Succeeded;
        } else if (proposal.executed) {
            return ProposalState.Executed;
        } else if (block.timestamp >= proposal.eta + params.gracePeriod) {
            return ProposalState.Expired;
        } else {
            return ProposalState.Queued;
        }
    }

    /**
     * @dev Delegate voting power to another address
     */
    function delegate(address delegatee) external {
        _delegate(msg.sender, delegatee);
    }

    /**
     * @dev Delegate by signature
     */
    function delegateBySig(
        address delegatee,
        uint256 nonce,
        uint256 expiry,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("URN DAO")),
                block.chainid,
                address(this)
            )
        );

        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Delegation(address delegatee,uint256 nonce,uint256 expiry)"),
                delegatee,
                nonce,
                expiry
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        address signatory = ecrecover(digest, v, r, s);
        require(signatory != address(0), "Invalid signature");
        require(nonce == urnToken.nonces(signatory), "Invalid nonce");
        require(block.timestamp <= expiry, "Signature expired");

        _delegate(signatory, delegatee);
    }

    /**
     * @dev Internal delegation logic
     */
    function _delegate(address delegator, address delegatee) internal {
        address currentDelegate = delegates[delegator];
        uint256 delegatorBalance = urnToken.getStakedBalance(delegator);

        delegates[delegator] = delegatee;

        emit DelegateChanged(delegator, currentDelegate, delegatee);

        _moveDelegates(currentDelegate, delegatee, delegatorBalance);
    }

    /**
     * @dev Move delegate votes
     */
    function _moveDelegates(
        address srcRep,
        address dstRep,
        uint256 amount
    ) internal {
        if (srcRep != dstRep && amount > 0) {
            if (srcRep != address(0)) {
                uint256 srcRepNum = numCheckpoints[srcRep];
                uint256 srcRepOld = srcRepNum > 0 ? checkpoints[srcRep][srcRepNum - 1] : 0;
                uint256 srcRepNew = srcRepOld - amount;
                _writeCheckpoint(srcRep, srcRepNum, srcRepOld, srcRepNew);
            }

            if (dstRep != address(0)) {
                uint256 dstRepNum = numCheckpoints[dstRep];
                uint256 dstRepOld = dstRepNum > 0 ? checkpoints[dstRep][dstRepNum - 1] : 0;
                uint256 dstRepNew = dstRepOld + amount;
                _writeCheckpoint(dstRep, dstRepNum, dstRepOld, dstRepNew);
            }
        }
    }

    /**
     * @dev Write checkpoint for vote tracking
     */
    function _writeCheckpoint(
        address delegatee,
        uint256 nCheckpoints,
        uint256 oldVotes,
        uint256 newVotes
    ) internal {
        uint256 blockNumber = block.number;

        if (nCheckpoints > 0 && checkpoints[delegatee][nCheckpoints - 1] == blockNumber) {
            checkpoints[delegatee][nCheckpoints - 1] = newVotes;
        } else {
            checkpoints[delegatee][nCheckpoints] = newVotes;
            numCheckpoints[delegatee] = nCheckpoints + 1;
        }

        emit DelegateVotesChanged(delegatee, oldVotes, newVotes);
    }

    /**
     * @dev Get votes for an address at a specific block
     */
    function getVotes(address account, uint256 blockNumber) public view returns (uint256) {
        require(blockNumber < block.number, "Not yet determined");

        uint256 nCheckpoints = numCheckpoints[account];
        if (nCheckpoints == 0) {
            return 0;
        }

        // Check most recent balance
        if (checkpoints[account][nCheckpoints - 1] <= blockNumber) {
            return checkpoints[account][nCheckpoints - 1];
        }

        // Check implicit zero balance
        if (checkpoints[account][0] > blockNumber) {
            return 0;
        }

        uint256 lower = 0;
        uint256 upper = nCheckpoints - 1;
        while (upper > lower) {
            uint256 center = upper - (upper - lower) / 2; // Ceil, avoiding overflow
            if (checkpoints[account][center] == blockNumber) {
                return checkpoints[account][center];
            } else if (checkpoints[account][center] < blockNumber) {
                lower = center;
            } else {
                upper = center - 1;
            }
        }
        return checkpoints[account][lower];
    }

    /**
     * @dev Get current votes for an address
     */
    function getCurrentVotes(address account) external view returns (uint256) {
        uint256 nCheckpoints = numCheckpoints[account];
        return nCheckpoints > 0 ? checkpoints[account][nCheckpoints - 1] : 0;
    }

    /**
     * @dev Get proposal details
     */
    function getProposal(uint256 proposalId) external view returns (
        uint256 id,
        address proposer,
        string memory title,
        string memory description,
        string memory ipfsHash,
        uint256 forVotes,
        uint256 againstVotes,
        uint256 abstainVotes,
        uint256 startBlock,
        uint256 endBlock,
        uint256 eta,
        bool executed,
        bool canceled
    ) {
        Proposal storage proposal = proposals[proposalId];
        return (
            proposal.id,
            proposal.proposer,
            proposal.title,
            proposal.description,
            proposal.ipfsHash,
            proposal.forVotes,
            proposal.againstVotes,
            proposal.abstainVotes,
            proposal.startBlock,
            proposal.endBlock,
            proposal.eta,
            proposal.executed,
            proposal.canceled
        );
    }

    /**
     * @dev Get proposal actions
     */
    function getProposalActions(uint256 proposalId) external view returns (
        address[] memory targets,
        uint256[] memory values,
        string[] memory signatures,
        bytes[] memory calldatas
    ) {
        Proposal storage proposal = proposals[proposalId];
        return (proposal.targets, proposal.values, proposal.signatures, proposal.calldatas);
    }

    /**
     * @dev Get receipt for a voter on a proposal
     */
    function getReceipt(uint256 proposalId, address voter) external view returns (
        bool hasVoted,
        uint8 support,
        uint256 votes
    ) {
        Receipt storage receipt = proposals[proposalId].receipts[voter];
        return (receipt.hasVoted, receipt.support, receipt.votes);
    }

    /**
     * @dev Update governance parameters (admin only)
     */
    function updateGovernanceParams(GovernanceParams memory newParams) external onlyRole(ADMIN_ROLE) {
        require(newParams.proposalThreshold > 0, "Invalid proposal threshold");
        require(newParams.quorumVotes > 0, "Invalid quorum");
        require(newParams.votingDelay > 0, "Invalid voting delay");
        require(newParams.votingPeriod > 0, "Invalid voting period");
        require(newParams.timelockDelay >= 172800, "Timelock too short");
        require(newParams.proposalMaxOperations <= 10, "Too many operations");

        params = newParams;
    }

    /**
     * @dev Add treasury token (admin only)
     */
    function addTreasuryToken(address token) external onlyRole(ADMIN_ROLE) {
        treasuryTokens[token] = true;
        emit TreasuryTokenAdded(token);
    }

    /**
     * @dev Remove treasury token (admin only)
     */
    function removeTreasuryToken(address token) external onlyRole(ADMIN_ROLE) {
        treasuryTokens[token] = false;
        emit TreasuryTokenRemoved(token);
    }

    /**
     * @dev Emergency pause (guardian only)
     */
    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause (admin only)
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @dev Get governance parameters
     */
    function getGovernanceParams() external view returns (GovernanceParams memory) {
        return params;
    }

    /**
     * @dev Check if token is treasury token
     */
    function isTreasuryToken(address token) external view returns (bool) {
        return treasuryTokens[token];
    }
}