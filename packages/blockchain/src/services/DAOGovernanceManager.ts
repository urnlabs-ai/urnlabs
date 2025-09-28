import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import IPFSManager from './IPFSManager';

export interface ProposalData {
  title: string;
  description: string;
  targets: string[];
  values: bigint[];
  signatures: string[];
  calldatas: string[];
  ipfsHash?: string;
}

export interface ProposalInfo {
  id: string;
  proposer: string;
  title: string;
  description: string;
  ipfsHash: string;
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;
  startBlock: bigint;
  endBlock: bigint;
  eta: bigint;
  executed: boolean;
  canceled: boolean;
  state: ProposalState;
}

export interface VoteReceipt {
  hasVoted: boolean;
  support: VoteType;
  votes: bigint;
}

export interface GovernanceParameters {
  proposalThreshold: bigint;
  quorumVotes: bigint;
  votingDelay: bigint;
  votingPeriod: bigint;
  timelockDelay: bigint;
  gracePeriod: bigint;
  proposalMaxOperations: bigint;
}

export interface TreasuryTransaction {
  id: string;
  txType: TransactionType;
  proposer: string;
  recipient: string;
  token: string;
  amount: bigint;
  description: string;
  proposedAt: bigint;
  executeAfter: bigint;
  expiresAt: bigint;
  state: TransactionState;
  approvalsCount: bigint;
  rejectionsCount: bigint;
}

export interface VotingPowerInfo {
  address: string;
  currentVotes: bigint;
  delegatedTo: string;
  delegatedFrom: string[];
}

export enum ProposalState {
  Pending = 0,
  Active = 1,
  Canceled = 2,
  Defeated = 3,
  Succeeded = 4,
  Queued = 5,
  Expired = 6,
  Executed = 7
}

export enum VoteType {
  Against = 0,
  For = 1,
  Abstain = 2
}

export enum TransactionType {
  Transfer = 0,
  Investment = 1,
  Grant = 2,
  Emergency = 3,
  Governance = 4
}

export enum TransactionState {
  Pending = 0,
  Approved = 1,
  Executed = 2,
  Rejected = 3,
  Expired = 4
}

export class DAOGovernanceManager extends EventEmitter {
  private daoContract: ethers.Contract;
  private treasuryContract: ethers.Contract;
  private urnTokenContract: ethers.Contract;
  private provider: ethers.Provider;
  private signer?: ethers.Signer;
  private ipfsManager: IPFSManager;

  // DAO contract ABI (simplified)
  private readonly daoABI = [
    'function propose(address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, string title, string description, string ipfsHash) external returns (uint256)',
    'function queue(uint256 proposalId) external',
    'function execute(uint256 proposalId) external payable',
    'function cancel(uint256 proposalId) external',
    'function castVote(uint256 proposalId, uint8 support) external returns (uint256)',
    'function castVoteWithReason(uint256 proposalId, uint8 support, string reason) external returns (uint256)',
    'function castVoteBySig(uint256 proposalId, uint8 support, uint8 v, bytes32 r, bytes32 s) external returns (uint256)',
    'function delegate(address delegatee) external',
    'function delegateBySig(address delegatee, uint256 nonce, uint256 expiry, uint8 v, bytes32 r, bytes32 s) external',
    'function state(uint256 proposalId) external view returns (uint8)',
    'function getProposal(uint256 proposalId) external view returns (uint256 id, address proposer, string title, string description, string ipfsHash, uint256 forVotes, uint256 againstVotes, uint256 abstainVotes, uint256 startBlock, uint256 endBlock, uint256 eta, bool executed, bool canceled)',
    'function getProposalActions(uint256 proposalId) external view returns (address[] targets, uint256[] values, string[] signatures, bytes[] calldatas)',
    'function getReceipt(uint256 proposalId, address voter) external view returns (bool hasVoted, uint8 support, uint256 votes)',
    'function getVotes(address account, uint256 blockNumber) external view returns (uint256)',
    'function getCurrentVotes(address account) external view returns (uint256)',
    'function getGovernanceParams() external view returns (tuple(uint256 proposalThreshold, uint256 quorumVotes, uint256 votingDelay, uint256 votingPeriod, uint256 timelockDelay, uint256 gracePeriod, uint256 proposalMaxOperations))',
    'function proposalCount() external view returns (uint256)',
    'event ProposalCreated(uint256 indexed id, address indexed proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 startBlock, uint256 endBlock, string title, string description)',
    'event VoteCast(address indexed voter, uint256 indexed proposalId, uint8 support, uint256 votes, string reason)',
    'event ProposalCanceled(uint256 indexed id)',
    'event ProposalQueued(uint256 indexed id, uint256 eta)',
    'event ProposalExecuted(uint256 indexed id)'
  ];

  // Treasury contract ABI (simplified)
  private readonly treasuryABI = [
    'function proposeTransaction(uint8 txType, address recipient, address token, uint256 amount, bytes data, string description) external returns (uint256)',
    'function approveTransaction(uint256 txId) external',
    'function rejectTransaction(uint256 txId, string reason) external',
    'function executeTransaction(uint256 txId) external',
    'function getTransaction(uint256 txId) external view returns (uint8 txType, address proposer, address recipient, address token, uint256 amount, string description, uint256 proposedAt, uint256 executeAfter, uint256 expiresAt, uint8 state, uint256 approvalsCount, uint256 rejectionsCount)',
    'function getTreasuryBalance(address token) external view returns (uint256)',
    'function getSpendingLimits(address token) external view returns (uint256 dailyLimit, uint256 monthlyLimit, uint256 dailySpent, uint256 monthlySpent)',
    'function getBudgetAllocation(string category) external view returns (uint256 allocated, uint256 spent, uint256 remaining, bool active)',
    'function transactionCount() external view returns (uint256)',
    'event TransactionProposed(uint256 indexed id, uint8 indexed txType, address indexed proposer, address recipient, address token, uint256 amount, string description)',
    'event TransactionApproved(uint256 indexed id, address indexed approver, uint256 approvalsCount, uint256 requiredApprovals)',
    'event TransactionExecuted(uint256 indexed id, address indexed executor, bytes result)'
  ];

  constructor(
    daoContractAddress: string,
    treasuryContractAddress: string,
    urnTokenAddress: string,
    provider: ethers.Provider,
    ipfsManager: IPFSManager,
    signer?: ethers.Signer
  ) {
    super();
    this.provider = provider;
    this.signer = signer;
    this.ipfsManager = ipfsManager;

    this.daoContract = new ethers.Contract(daoContractAddress, this.daoABI, provider);
    this.treasuryContract = new ethers.Contract(treasuryContractAddress, this.treasuryABI, provider);
    this.urnTokenContract = new ethers.Contract(urnTokenAddress, [
      'function getStakedBalance(address account) external view returns (uint256)',
      'function balanceOf(address account) external view returns (uint256)',
      'function nonces(address owner) external view returns (uint256)'
    ], provider);

    this.initializeEventListeners();
  }

  private initializeEventListeners(): void {
    // DAO Events
    this.daoContract.on('ProposalCreated', (id, proposer, targets, values, signatures, calldatas, startBlock, endBlock, title, description) => {
      this.emit('proposalCreated', {
        id: id.toString(),
        proposer,
        title,
        description,
        startBlock: startBlock.toString(),
        endBlock: endBlock.toString()
      });
    });

    this.daoContract.on('VoteCast', (voter, proposalId, support, votes, reason) => {
      this.emit('voteCast', {
        voter,
        proposalId: proposalId.toString(),
        support: Number(support),
        votes: votes.toString(),
        reason
      });
    });

    this.daoContract.on('ProposalExecuted', (id) => {
      this.emit('proposalExecuted', { id: id.toString() });
    });

    // Treasury Events
    this.treasuryContract.on('TransactionProposed', (id, txType, proposer, recipient, token, amount, description) => {
      this.emit('treasuryTransactionProposed', {
        id: id.toString(),
        txType: Number(txType),
        proposer,
        recipient,
        token,
        amount: amount.toString(),
        description
      });
    });

    this.treasuryContract.on('TransactionExecuted', (id, executor, result) => {
      this.emit('treasuryTransactionExecuted', {
        id: id.toString(),
        executor,
        result
      });
    });
  }

  /**
   * Create a new governance proposal
   */
  async createProposal(
    proposalData: ProposalData,
    additionalMetadata?: Record<string, any>
  ): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer required to create proposals');
    }

    try {
      // Upload extended metadata to IPFS if provided
      let ipfsHash = proposalData.ipfsHash || '';
      if (additionalMetadata) {
        const fullMetadata = {
          title: proposalData.title,
          description: proposalData.description,
          ...additionalMetadata,
          timestamp: new Date().toISOString()
        };

        const upload = await this.ipfsManager.uploadFile(
          JSON.stringify(fullMetadata, null, 2),
          `proposal-metadata-${Date.now()}.json`,
          { mimeType: 'application/json' }
        );
        ipfsHash = upload.hash;
      }

      const contractWithSigner = this.daoContract.connect(this.signer);
      const tx = await contractWithSigner.propose(
        proposalData.targets,
        proposalData.values,
        proposalData.signatures,
        proposalData.calldatas,
        proposalData.title,
        proposalData.description,
        ipfsHash
      );

      const receipt = await tx.wait();
      const proposalId = await this.daoContract.proposalCount();

      this.emit('proposalSubmitted', {
        proposalId: proposalId.toString(),
        transactionHash: tx.hash,
        ipfsHash
      });

      return proposalId.toString();

    } catch (error) {
      this.emit('proposalError', error);
      throw error;
    }
  }

  /**
   * Vote on a proposal
   */
  async vote(
    proposalId: string,
    support: VoteType,
    reason?: string
  ): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer required to vote');
    }

    const contractWithSigner = this.daoContract.connect(this.signer);

    let tx;
    if (reason) {
      tx = await contractWithSigner.castVoteWithReason(proposalId, support, reason);
    } else {
      tx = await contractWithSigner.castVote(proposalId, support);
    }

    await tx.wait();
    return tx.hash;
  }

  /**
   * Vote by signature (for meta transactions)
   */
  async voteBySignature(
    proposalId: string,
    support: VoteType,
    signature: { v: number; r: string; s: string }
  ): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer required to submit vote');
    }

    const contractWithSigner = this.daoContract.connect(this.signer);
    const tx = await contractWithSigner.castVoteBySig(
      proposalId,
      support,
      signature.v,
      signature.r,
      signature.s
    );

    await tx.wait();
    return tx.hash;
  }

  /**
   * Queue a successful proposal for execution
   */
  async queueProposal(proposalId: string): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer required to queue proposals');
    }

    const contractWithSigner = this.daoContract.connect(this.signer);
    const tx = await contractWithSigner.queue(proposalId);
    await tx.wait();
    return tx.hash;
  }

  /**
   * Execute a queued proposal
   */
  async executeProposal(proposalId: string, value: bigint = 0n): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer required to execute proposals');
    }

    const contractWithSigner = this.daoContract.connect(this.signer);
    const tx = await contractWithSigner.execute(proposalId, { value });
    await tx.wait();
    return tx.hash;
  }

  /**
   * Cancel a proposal
   */
  async cancelProposal(proposalId: string): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer required to cancel proposals');
    }

    const contractWithSigner = this.daoContract.connect(this.signer);
    const tx = await contractWithSigner.cancel(proposalId);
    await tx.wait();
    return tx.hash;
  }

  /**
   * Delegate voting power
   */
  async delegateVotes(delegatee: string): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer required to delegate');
    }

    const contractWithSigner = this.daoContract.connect(this.signer);
    const tx = await contractWithSigner.delegate(delegatee);
    await tx.wait();
    return tx.hash;
  }

  /**
   * Get proposal information
   */
  async getProposal(proposalId: string): Promise<ProposalInfo> {
    const proposalData = await this.daoContract.getProposal(proposalId);
    const state = await this.daoContract.state(proposalId);

    return {
      id: proposalData.id.toString(),
      proposer: proposalData.proposer,
      title: proposalData.title,
      description: proposalData.description,
      ipfsHash: proposalData.ipfsHash,
      forVotes: proposalData.forVotes,
      againstVotes: proposalData.againstVotes,
      abstainVotes: proposalData.abstainVotes,
      startBlock: proposalData.startBlock,
      endBlock: proposalData.endBlock,
      eta: proposalData.eta,
      executed: proposalData.executed,
      canceled: proposalData.canceled,
      state: Number(state) as ProposalState
    };
  }

  /**
   * Get proposal actions (targets, values, etc.)
   */
  async getProposalActions(proposalId: string): Promise<{
    targets: string[];
    values: bigint[];
    signatures: string[];
    calldatas: string[];
  }> {
    const actions = await this.daoContract.getProposalActions(proposalId);
    return {
      targets: actions.targets,
      values: actions.values,
      signatures: actions.signatures,
      calldatas: actions.calldatas
    };
  }

  /**
   * Get vote receipt for a voter
   */
  async getVoteReceipt(proposalId: string, voter: string): Promise<VoteReceipt> {
    const receipt = await this.daoContract.getReceipt(proposalId, voter);
    return {
      hasVoted: receipt.hasVoted,
      support: Number(receipt.support) as VoteType,
      votes: receipt.votes
    };
  }

  /**
   * Get voting power for an address at a specific block
   */
  async getVotingPower(address: string, blockNumber?: number): Promise<bigint> {
    if (blockNumber) {
      return await this.daoContract.getVotes(address, blockNumber);
    } else {
      return await this.daoContract.getCurrentVotes(address);
    }
  }

  /**
   * Get governance parameters
   */
  async getGovernanceParameters(): Promise<GovernanceParameters> {
    const params = await this.daoContract.getGovernanceParams();
    return {
      proposalThreshold: params.proposalThreshold,
      quorumVotes: params.quorumVotes,
      votingDelay: params.votingDelay,
      votingPeriod: params.votingPeriod,
      timelockDelay: params.timelockDelay,
      gracePeriod: params.gracePeriod,
      proposalMaxOperations: params.proposalMaxOperations
    };
  }

  /**
   * Get all proposals (paginated)
   */
  async getAllProposals(limit: number = 50, offset: number = 0): Promise<ProposalInfo[]> {
    const proposalCount = await this.daoContract.proposalCount();
    const proposals: ProposalInfo[] = [];

    const start = Math.max(1, Number(proposalCount) - offset);
    const end = Math.max(1, start - limit + 1);

    for (let i = start; i >= end; i--) {
      try {
        const proposal = await this.getProposal(i.toString());
        proposals.push(proposal);
      } catch (error) {
        console.warn(`Failed to fetch proposal ${i}:`, error);
      }
    }

    return proposals;
  }

  /**
   * Propose treasury transaction
   */
  async proposeTreasuryTransaction(
    txType: TransactionType,
    recipient: string,
    token: string,
    amount: bigint,
    data: string = '0x',
    description: string
  ): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer required to propose treasury transactions');
    }

    const contractWithSigner = this.treasuryContract.connect(this.signer);
    const tx = await contractWithSigner.proposeTransaction(
      txType,
      recipient,
      token,
      amount,
      data,
      description
    );

    const receipt = await tx.wait();
    const txId = await this.treasuryContract.transactionCount();

    return txId.toString();
  }

  /**
   * Approve treasury transaction
   */
  async approveTreasuryTransaction(txId: string): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer required to approve treasury transactions');
    }

    const contractWithSigner = this.treasuryContract.connect(this.signer);
    const tx = await contractWithSigner.approveTransaction(txId);
    await tx.wait();
    return tx.hash;
  }

  /**
   * Execute treasury transaction
   */
  async executeTreasuryTransaction(txId: string): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer required to execute treasury transactions');
    }

    const contractWithSigner = this.treasuryContract.connect(this.signer);
    const tx = await contractWithSigner.executeTransaction(txId);
    await tx.wait();
    return tx.hash;
  }

  /**
   * Get treasury transaction
   */
  async getTreasuryTransaction(txId: string): Promise<TreasuryTransaction> {
    const tx = await this.treasuryContract.getTransaction(txId);
    return {
      id: txId,
      txType: Number(tx.txType) as TransactionType,
      proposer: tx.proposer,
      recipient: tx.recipient,
      token: tx.token,
      amount: tx.amount,
      description: tx.description,
      proposedAt: tx.proposedAt,
      executeAfter: tx.executeAfter,
      expiresAt: tx.expiresAt,
      state: Number(tx.state) as TransactionState,
      approvalsCount: tx.approvalsCount,
      rejectionsCount: tx.rejectionsCount
    };
  }

  /**
   * Get treasury balance
   */
  async getTreasuryBalance(token: string): Promise<bigint> {
    return await this.treasuryContract.getTreasuryBalance(token);
  }

  /**
   * Get treasury spending limits
   */
  async getSpendingLimits(token: string): Promise<{
    dailyLimit: bigint;
    monthlyLimit: bigint;
    dailySpent: bigint;
    monthlySpent: bigint;
  }> {
    const limits = await this.treasuryContract.getSpendingLimits(token);
    return {
      dailyLimit: limits.dailyLimit,
      monthlyLimit: limits.monthlyLimit,
      dailySpent: limits.dailySpent,
      monthlySpent: limits.monthlySpent
    };
  }

  /**
   * Create standard proposal templates
   */
  createTransferProposal(
    recipient: string,
    token: string,
    amount: bigint,
    title: string,
    description: string
  ): ProposalData {
    const treasuryAddress = this.treasuryContract.target;

    return {
      title,
      description,
      targets: [treasuryAddress],
      values: [0n],
      signatures: ['proposeTransaction(uint8,address,address,uint256,bytes,string)'],
      calldatas: [
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['uint8', 'address', 'address', 'uint256', 'bytes', 'string'],
          [TransactionType.Transfer, recipient, token, amount, '0x', 'DAO approved transfer']
        )
      ]
    };
  }

  /**
   * Create parameter update proposal
   */
  createParameterUpdateProposal(
    newParams: Partial<GovernanceParameters>,
    title: string,
    description: string
  ): ProposalData {
    const daoAddress = this.daoContract.target;

    return {
      title,
      description,
      targets: [daoAddress],
      values: [0n],
      signatures: ['updateGovernanceParams((uint256,uint256,uint256,uint256,uint256,uint256,uint256))'],
      calldatas: [
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['tuple(uint256,uint256,uint256,uint256,uint256,uint256,uint256)'],
          [Object.values(newParams)]
        )
      ]
    };
  }

  /**
   * Get DAO statistics
   */
  async getDAOStatistics(): Promise<{
    totalProposals: number;
    activeProposals: number;
    totalVoters: number;
    treasuryValue: bigint;
    participationRate: number;
  }> {
    const proposalCount = await this.daoContract.proposalCount();
    const treasuryBalance = await this.getTreasuryBalance(ethers.ZeroAddress); // ETH balance

    // Get active proposals
    const proposals = await this.getAllProposals(Number(proposalCount));
    const activeProposals = proposals.filter(p => p.state === ProposalState.Active).length;

    // Calculate participation rate (simplified)
    const totalVotes = proposals.reduce((sum, p) => sum + Number(p.forVotes + p.againstVotes + p.abstainVotes), 0);
    const participationRate = proposals.length > 0 ? totalVotes / (proposals.length * 1000000) : 0; // Simplified calculation

    return {
      totalProposals: Number(proposalCount),
      activeProposals,
      totalVoters: 0, // Would need to track this separately
      treasuryValue: treasuryBalance,
      participationRate
    };
  }

  /**
   * Set signer for transactions
   */
  setSigner(signer: ethers.Signer): void {
    this.signer = signer;
  }

  /**
   * Get contract instances
   */
  getContracts(): {
    dao: ethers.Contract;
    treasury: ethers.Contract;
    urnToken: ethers.Contract;
  } {
    return {
      dao: this.daoContract,
      treasury: this.treasuryContract,
      urnToken: this.urnTokenContract
    };
  }
}

export default DAOGovernanceManager;