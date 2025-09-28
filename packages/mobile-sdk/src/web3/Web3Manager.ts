import { EventEmitter } from 'events';
import { Platform } from 'react-native';

export interface Web3Config {
  defaultChainId: number;
  supportedChains: ChainConfig[];
  walletConnectProjectId?: string;
  infuraProjectId?: string;
  alchemyApiKey?: string;
  enableTestnets: boolean;
}

export interface ChainConfig {
  chainId: number;
  name: string;
  symbol: string;
  decimals: number;
  rpcUrl: string;
  blockExplorerUrl: string;
  isTestnet: boolean;
}

export interface WalletInfo {
  address: string;
  chainId: number;
  balance: string;
  connected: boolean;
  walletType: 'metamask' | 'walletconnect' | 'coinbase' | 'trust' | 'rainbow';
}

export interface TransactionRequest {
  to: string;
  value?: string;
  data?: string;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface TransactionResult {
  hash: string;
  status: 'pending' | 'confirmed' | 'failed';
  blockNumber?: number;
  gasUsed?: string;
  effectiveGasPrice?: string;
}

export interface ContractCallOptions {
  contractAddress: string;
  abi: any[];
  methodName: string;
  parameters: any[];
  value?: string;
}

export interface SignMessageOptions {
  message: string;
  messageType: 'personal' | 'typed' | 'eth_sign';
  typedData?: any;
}

export class Web3Manager extends EventEmitter {
  private config: Web3Config;
  private wallet: WalletInfo | null = null;
  private providers: Map<number, any> = new Map();
  private contracts: Map<string, any> = new Map();
  private transactionHistory: Map<string, TransactionResult> = new Map();

  constructor(config: Web3Config) {
    super();
    this.config = config;
    this.initializeProviders();
  }

  private initializeProviders(): void {
    for (const chain of this.config.supportedChains) {
      // Initialize provider for each supported chain
      const provider = this.createProvider(chain);
      this.providers.set(chain.chainId, provider);
    }
  }

  private createProvider(chain: ChainConfig): any {
    // In a real implementation, this would create ethers.js or web3.js providers
    // For mobile, we might use different libraries or native bridge implementations
    return {
      chainId: chain.chainId,
      rpcUrl: chain.rpcUrl,
      // Mock provider interface
      getBalance: async (address: string) => '0',
      sendTransaction: async (tx: TransactionRequest) => ({ hash: '0x...' }),
      call: async (tx: any) => '0x',
      getTransactionReceipt: async (hash: string) => null
    };
  }

  /**
   * Connect to a wallet
   */
  async connectWallet(walletType: WalletInfo['walletType']): Promise<WalletInfo> {
    try {
      let walletInfo: WalletInfo;

      switch (walletType) {
        case 'metamask':
          walletInfo = await this.connectMetaMask();
          break;
        case 'walletconnect':
          walletInfo = await this.connectWalletConnect();
          break;
        case 'coinbase':
          walletInfo = await this.connectCoinbaseWallet();
          break;
        case 'trust':
          walletInfo = await this.connectTrustWallet();
          break;
        case 'rainbow':
          walletInfo = await this.connectRainbowWallet();
          break;
        default:
          throw new Error(`Unsupported wallet type: ${walletType}`);
      }

      this.wallet = walletInfo;
      this.emit('walletConnected', walletInfo);
      return walletInfo;

    } catch (error) {
      this.emit('walletConnectionError', error);
      throw error;
    }
  }

  private async connectMetaMask(): Promise<WalletInfo> {
    if (Platform.OS === 'ios') {
      // Use MetaMask iOS SDK or deep linking
      return this.connectMetaMaskMobile();
    } else if (Platform.OS === 'android') {
      // Use MetaMask Android SDK or deep linking
      return this.connectMetaMaskMobile();
    } else {
      // Web implementation
      return this.connectMetaMaskWeb();
    }
  }

  private async connectMetaMaskMobile(): Promise<WalletInfo> {
    // Implementation for MetaMask mobile connection
    // This would use deep linking or the MetaMask mobile SDK

    // Mock implementation
    return {
      address: '0x1234567890123456789012345678901234567890',
      chainId: this.config.defaultChainId,
      balance: '1.5',
      connected: true,
      walletType: 'metamask'
    };
  }

  private async connectMetaMaskWeb(): Promise<WalletInfo> {
    // Implementation for MetaMask browser extension
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      const ethereum = (window as any).ethereum;

      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      const chainId = await ethereum.request({ method: 'eth_chainId' });
      const balance = await ethereum.request({
        method: 'eth_getBalance',
        params: [accounts[0], 'latest']
      });

      return {
        address: accounts[0],
        chainId: parseInt(chainId, 16),
        balance: this.weiToEther(balance),
        connected: true,
        walletType: 'metamask'
      };
    }

    throw new Error('MetaMask not found');
  }

  private async connectWalletConnect(): Promise<WalletInfo> {
    // Implementation for WalletConnect
    // This would use the WalletConnect v2 SDK

    // Mock implementation
    return {
      address: '0x1234567890123456789012345678901234567890',
      chainId: this.config.defaultChainId,
      balance: '2.5',
      connected: true,
      walletType: 'walletconnect'
    };
  }

  private async connectCoinbaseWallet(): Promise<WalletInfo> {
    // Implementation for Coinbase Wallet
    // Mock implementation
    return {
      address: '0x1234567890123456789012345678901234567890',
      chainId: this.config.defaultChainId,
      balance: '3.5',
      connected: true,
      walletType: 'coinbase'
    };
  }

  private async connectTrustWallet(): Promise<WalletInfo> {
    // Implementation for Trust Wallet
    // Mock implementation
    return {
      address: '0x1234567890123456789012345678901234567890',
      chainId: this.config.defaultChainId,
      balance: '4.5',
      connected: true,
      walletType: 'trust'
    };
  }

  private async connectRainbowWallet(): Promise<WalletInfo> {
    // Implementation for Rainbow Wallet
    // Mock implementation
    return {
      address: '0x1234567890123456789012345678901234567890',
      chainId: this.config.defaultChainId,
      balance: '5.5',
      connected: true,
      walletType: 'rainbow'
    };
  }

  /**
   * Disconnect wallet
   */
  async disconnectWallet(): Promise<void> {
    if (this.wallet) {
      const walletType = this.wallet.walletType;
      this.wallet = null;
      this.emit('walletDisconnected', { walletType });
    }
  }

  /**
   * Switch to a different chain
   */
  async switchChain(chainId: number): Promise<void> {
    if (!this.wallet) {
      throw new Error('No wallet connected');
    }

    const chain = this.config.supportedChains.find(c => c.chainId === chainId);
    if (!chain) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    try {
      // Implementation depends on wallet type
      switch (this.wallet.walletType) {
        case 'metamask':
          await this.switchChainMetaMask(chainId);
          break;
        case 'walletconnect':
          await this.switchChainWalletConnect(chainId);
          break;
        default:
          throw new Error(`Chain switching not supported for ${this.wallet.walletType}`);
      }

      this.wallet.chainId = chainId;
      this.emit('chainChanged', { chainId, chain });

    } catch (error) {
      this.emit('chainSwitchError', error);
      throw error;
    }
  }

  private async switchChainMetaMask(chainId: number): Promise<void> {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      const ethereum = (window as any).ethereum;

      try {
        await ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${chainId.toString(16)}` }]
        });
      } catch (error: any) {
        // If chain doesn't exist, add it
        if (error.code === 4902) {
          await this.addChainMetaMask(chainId);
        } else {
          throw error;
        }
      }
    }
  }

  private async addChainMetaMask(chainId: number): Promise<void> {
    const chain = this.config.supportedChains.find(c => c.chainId === chainId);
    if (!chain) return;

    if (typeof window !== 'undefined' && (window as any).ethereum) {
      const ethereum = (window as any).ethereum;

      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: `0x${chainId.toString(16)}`,
          chainName: chain.name,
          nativeCurrency: {
            name: chain.name,
            symbol: chain.symbol,
            decimals: chain.decimals
          },
          rpcUrls: [chain.rpcUrl],
          blockExplorerUrls: [chain.blockExplorerUrl]
        }]
      });
    }
  }

  private async switchChainWalletConnect(chainId: number): Promise<void> {
    // Implementation for WalletConnect chain switching
    // This would use the WalletConnect SDK
  }

  /**
   * Send a transaction
   */
  async sendTransaction(transaction: TransactionRequest): Promise<TransactionResult> {
    if (!this.wallet) {
      throw new Error('No wallet connected');
    }

    try {
      const provider = this.providers.get(this.wallet.chainId);
      if (!provider) {
        throw new Error(`No provider for chain ${this.wallet.chainId}`);
      }

      // Send transaction through the appropriate method based on wallet type
      let txHash: string;

      switch (this.wallet.walletType) {
        case 'metamask':
          txHash = await this.sendTransactionMetaMask(transaction);
          break;
        case 'walletconnect':
          txHash = await this.sendTransactionWalletConnect(transaction);
          break;
        default:
          txHash = await this.sendTransactionGeneric(transaction);
      }

      const result: TransactionResult = {
        hash: txHash,
        status: 'pending'
      };

      this.transactionHistory.set(txHash, result);
      this.emit('transactionSent', result);

      // Monitor transaction status
      this.monitorTransaction(txHash);

      return result;

    } catch (error) {
      this.emit('transactionError', error);
      throw error;
    }
  }

  private async sendTransactionMetaMask(transaction: TransactionRequest): Promise<string> {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      const ethereum = (window as any).ethereum;

      const txHash = await ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: this.wallet!.address,
          to: transaction.to,
          value: transaction.value ? `0x${parseInt(transaction.value).toString(16)}` : '0x0',
          data: transaction.data || '0x',
          gas: transaction.gasLimit ? `0x${parseInt(transaction.gasLimit).toString(16)}` : undefined,
          gasPrice: transaction.gasPrice ? `0x${parseInt(transaction.gasPrice).toString(16)}` : undefined
        }]
      });

      return txHash;
    }

    throw new Error('MetaMask not available');
  }

  private async sendTransactionWalletConnect(transaction: TransactionRequest): Promise<string> {
    // Implementation for WalletConnect transaction sending
    // Mock for now
    return '0x' + Math.random().toString(16).slice(2);
  }

  private async sendTransactionGeneric(transaction: TransactionRequest): Promise<string> {
    // Generic transaction sending implementation
    // Mock for now
    return '0x' + Math.random().toString(16).slice(2);
  }

  /**
   * Monitor transaction status
   */
  private async monitorTransaction(txHash: string): Promise<void> {
    const checkTransaction = async () => {
      try {
        const provider = this.providers.get(this.wallet!.chainId);
        const receipt = await provider.getTransactionReceipt(txHash);

        if (receipt) {
          const result = this.transactionHistory.get(txHash);
          if (result) {
            result.status = receipt.status === 1 ? 'confirmed' : 'failed';
            result.blockNumber = receipt.blockNumber;
            result.gasUsed = receipt.gasUsed?.toString();
            result.effectiveGasPrice = receipt.effectiveGasPrice?.toString();

            this.emit('transactionUpdated', result);
          }
        } else {
          // Still pending, check again
          setTimeout(checkTransaction, 3000);
        }
      } catch (error) {
        console.warn('Error monitoring transaction:', error);
        setTimeout(checkTransaction, 5000);
      }
    };

    setTimeout(checkTransaction, 1000);
  }

  /**
   * Call a smart contract method
   */
  async callContract(options: ContractCallOptions): Promise<any> {
    if (!this.wallet) {
      throw new Error('No wallet connected');
    }

    const provider = this.providers.get(this.wallet.chainId);
    if (!provider) {
      throw new Error(`No provider for chain ${this.wallet.chainId}`);
    }

    try {
      // Create contract instance
      const contract = this.getOrCreateContract(
        options.contractAddress,
        options.abi,
        this.wallet.chainId
      );

      // Call the method
      if (options.value || this.isPayableMethod(options.abi, options.methodName)) {
        // This is a transaction
        return await this.sendTransaction({
          to: options.contractAddress,
          data: this.encodeMethodCall(options.abi, options.methodName, options.parameters),
          value: options.value || '0'
        });
      } else {
        // This is a view/pure call
        const result = await provider.call({
          to: options.contractAddress,
          data: this.encodeMethodCall(options.abi, options.methodName, options.parameters)
        });

        return this.decodeMethodResult(options.abi, options.methodName, result);
      }

    } catch (error) {
      this.emit('contractCallError', error);
      throw error;
    }
  }

  private getOrCreateContract(address: string, abi: any[], chainId: number): any {
    const key = `${address}-${chainId}`;

    if (!this.contracts.has(key)) {
      // Create contract instance
      const contract = {
        address,
        abi,
        chainId
      };
      this.contracts.set(key, contract);
    }

    return this.contracts.get(key);
  }

  private isPayableMethod(abi: any[], methodName: string): boolean {
    const method = abi.find(item => item.name === methodName && item.type === 'function');
    return method?.stateMutability === 'payable';
  }

  private encodeMethodCall(abi: any[], methodName: string, parameters: any[]): string {
    // Implementation would use ethers.js or web3.js ABI encoding
    // Mock for now
    return '0x' + Math.random().toString(16).slice(2);
  }

  private decodeMethodResult(abi: any[], methodName: string, result: string): any {
    // Implementation would use ethers.js or web3.js ABI decoding
    // Mock for now
    return result;
  }

  /**
   * Sign a message
   */
  async signMessage(options: SignMessageOptions): Promise<string> {
    if (!this.wallet) {
      throw new Error('No wallet connected');
    }

    try {
      let signature: string;

      switch (options.messageType) {
        case 'personal':
          signature = await this.signPersonalMessage(options.message);
          break;
        case 'typed':
          signature = await this.signTypedData(options.typedData);
          break;
        case 'eth_sign':
          signature = await this.signEthMessage(options.message);
          break;
        default:
          throw new Error(`Unsupported message type: ${options.messageType}`);
      }

      this.emit('messageSigned', { signature, message: options.message });
      return signature;

    } catch (error) {
      this.emit('messageSignError', error);
      throw error;
    }
  }

  private async signPersonalMessage(message: string): Promise<string> {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      const ethereum = (window as any).ethereum;

      return await ethereum.request({
        method: 'personal_sign',
        params: [message, this.wallet!.address]
      });
    }

    throw new Error('Wallet not available for signing');
  }

  private async signTypedData(typedData: any): Promise<string> {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      const ethereum = (window as any).ethereum;

      return await ethereum.request({
        method: 'eth_signTypedData_v4',
        params: [this.wallet!.address, JSON.stringify(typedData)]
      });
    }

    throw new Error('Wallet not available for signing');
  }

  private async signEthMessage(message: string): Promise<string> {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      const ethereum = (window as any).ethereum;

      return await ethereum.request({
        method: 'eth_sign',
        params: [this.wallet!.address, message]
      });
    }

    throw new Error('Wallet not available for signing');
  }

  /**
   * Get current wallet info
   */
  getWallet(): WalletInfo | null {
    return this.wallet;
  }

  /**
   * Get supported chains
   */
  getSupportedChains(): ChainConfig[] {
    return this.config.supportedChains;
  }

  /**
   * Get transaction history
   */
  getTransactionHistory(): TransactionResult[] {
    return Array.from(this.transactionHistory.values());
  }

  /**
   * Get transaction by hash
   */
  getTransaction(hash: string): TransactionResult | undefined {
    return this.transactionHistory.get(hash);
  }

  /**
   * Utility: Convert Wei to Ether
   */
  private weiToEther(wei: string): string {
    // Implementation would use proper BigNumber library
    const weiNum = BigInt(wei);
    const etherNum = Number(weiNum) / Math.pow(10, 18);
    return etherNum.toFixed(6);
  }

  /**
   * Utility: Convert Ether to Wei
   */
  etherToWei(ether: string): string {
    const etherNum = parseFloat(ether);
    const weiNum = BigInt(Math.floor(etherNum * Math.pow(10, 18)));
    return weiNum.toString();
  }

  /**
   * Check if wallet is connected
   */
  isConnected(): boolean {
    return this.wallet !== null && this.wallet.connected;
  }

  /**
   * Get balance for current wallet
   */
  async refreshBalance(): Promise<string> {
    if (!this.wallet) {
      throw new Error('No wallet connected');
    }

    const provider = this.providers.get(this.wallet.chainId);
    const balance = await provider.getBalance(this.wallet.address);
    this.wallet.balance = this.weiToEther(balance);

    this.emit('balanceUpdated', { address: this.wallet.address, balance: this.wallet.balance });
    return this.wallet.balance;
  }
}

export default Web3Manager;