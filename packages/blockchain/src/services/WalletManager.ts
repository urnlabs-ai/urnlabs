import { MetaMaskSDK } from '@metamask/sdk';
import { WalletConnectProvider } from '@walletconnect/web3-provider';
import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import axios from 'axios';

export interface WalletConfig {
  chainId: number;
  chainName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls: string[];
}

export interface ConnectedWallet {
  address: string;
  chainId: number;
  provider: ethers.Provider;
  signer: ethers.Signer;
  walletType: 'metamask' | 'walletconnect' | 'mobile';
}

export interface TransactionOptions {
  gasLimit?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  value?: bigint;
}

export interface MultiSigWallet {
  address: string;
  owners: string[];
  threshold: number;
  chainId: number;
}

export class WalletManager extends EventEmitter {
  private metaMask?: MetaMaskSDK;
  private walletConnect?: WalletConnectProvider;
  private connectedWallet?: ConnectedWallet;
  private supportedChains: Map<number, WalletConfig> = new Map();
  private gasOptimizationEnabled = true;
  private multiSigWallets: Map<string, MultiSigWallet> = new Map();

  constructor() {
    super();
    this.initializeSupportedChains();
  }

  private initializeSupportedChains() {
    // Ethereum Mainnet
    this.supportedChains.set(1, {
      chainId: 1,
      chainName: 'Ethereum Mainnet',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: ['https://mainnet.infura.io/v3/', 'https://eth-mainnet.alchemyapi.io/v2/'],
      blockExplorerUrls: ['https://etherscan.io']
    });

    // Polygon Mainnet
    this.supportedChains.set(137, {
      chainId: 137,
      chainName: 'Polygon Mainnet',
      nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
      rpcUrls: ['https://polygon-rpc.com/', 'https://rpc-mainnet.matic.network'],
      blockExplorerUrls: ['https://polygonscan.com']
    });

    // BSC Mainnet
    this.supportedChains.set(56, {
      chainId: 56,
      chainName: 'BNB Smart Chain',
      nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
      rpcUrls: ['https://bsc-dataseed.binance.org/', 'https://bsc-dataseed1.defibit.io/'],
      blockExplorerUrls: ['https://bscscan.com']
    });

    // Sepolia Testnet
    this.supportedChains.set(11155111, {
      chainId: 11155111,
      chainName: 'Sepolia Testnet',
      nativeCurrency: { name: 'Sepolia ETH', symbol: 'SEP', decimals: 18 },
      rpcUrls: ['https://sepolia.infura.io/v3/'],
      blockExplorerUrls: ['https://sepolia.etherscan.io']
    });
  }

  /**
   * Initialize MetaMask SDK
   */
  private async initializeMetaMask(): Promise<void> {
    if (this.metaMask) return;

    this.metaMask = new MetaMaskSDK({
      dappMetadata: {
        name: 'Urnlabs AI Agent Platform',
        url: 'https://urnlabs.ai',
        iconUrl: 'https://urnlabs.ai/favicon.ico'
      },
      infuraAPIKey: process.env.INFURA_API_KEY,
      preferDesktop: false,
      enableAnalytics: false
    });

    this.metaMask.on('connect', () => {
      this.emit('walletConnected', { type: 'metamask' });
    });

    this.metaMask.on('disconnect', () => {
      this.emit('walletDisconnected', { type: 'metamask' });
      this.connectedWallet = undefined;
    });

    this.metaMask.on('chainChanged', (chainId: string) => {
      this.emit('chainChanged', parseInt(chainId, 16));
    });

    this.metaMask.on('accountsChanged', (accounts: string[]) => {
      this.emit('accountsChanged', accounts);
    });
  }

  /**
   * Initialize WalletConnect provider
   */
  private async initializeWalletConnect(): Promise<void> {
    if (this.walletConnect) return;

    this.walletConnect = new WalletConnectProvider({
      rpc: Object.fromEntries(
        Array.from(this.supportedChains.entries()).map(([chainId, config]) => [
          chainId,
          config.rpcUrls[0]
        ])
      ),
      chainId: 1,
      qrcode: true,
      qrcodeModalOptions: {
        mobileLinks: ['metamask', 'trust', 'rainbow', 'argent']
      }
    });

    this.walletConnect.on('connect', () => {
      this.emit('walletConnected', { type: 'walletconnect' });
    });

    this.walletConnect.on('disconnect', () => {
      this.emit('walletDisconnected', { type: 'walletconnect' });
      this.connectedWallet = undefined;
    });

    this.walletConnect.on('chainChanged', (chainId: number) => {
      this.emit('chainChanged', chainId);
    });

    this.walletConnect.on('accountsChanged', (accounts: string[]) => {
      this.emit('accountsChanged', accounts);
    });
  }

  /**
   * Connect to MetaMask wallet
   */
  async connectMetaMask(): Promise<ConnectedWallet> {
    await this.initializeMetaMask();

    if (!this.metaMask) {
      throw new Error('MetaMask SDK not initialized');
    }

    const ethereum = this.metaMask.getProvider();
    if (!ethereum) {
      throw new Error('MetaMask provider not available');
    }

    const accounts = await ethereum.request({ method: 'eth_requestAccounts' }) as string[];
    if (!accounts.length) {
      throw new Error('No accounts available');
    }

    const chainId = await ethereum.request({ method: 'eth_chainId' }) as string;
    const provider = new ethers.BrowserProvider(ethereum);
    const signer = await provider.getSigner();

    this.connectedWallet = {
      address: accounts[0],
      chainId: parseInt(chainId, 16),
      provider,
      signer,
      walletType: 'metamask'
    };

    return this.connectedWallet;
  }

  /**
   * Connect to WalletConnect
   */
  async connectWalletConnect(): Promise<ConnectedWallet> {
    await this.initializeWalletConnect();

    if (!this.walletConnect) {
      throw new Error('WalletConnect not initialized');
    }

    await this.walletConnect.enable();
    const provider = new ethers.JsonRpcProvider(this.walletConnect);
    const signer = provider.getSigner();

    const accounts = this.walletConnect.accounts;
    if (!accounts.length) {
      throw new Error('No accounts available');
    }

    this.connectedWallet = {
      address: accounts[0],
      chainId: this.walletConnect.chainId,
      provider,
      signer,
      walletType: 'walletconnect'
    };

    return this.connectedWallet;
  }

  /**
   * Connect to mobile wallet (React Native implementation)
   */
  async connectMobileWallet(walletType: string): Promise<ConnectedWallet> {
    // This would be implemented in the mobile SDK
    throw new Error('Mobile wallet connection should be implemented in mobile SDK');
  }

  /**
   * Disconnect current wallet
   */
  async disconnect(): Promise<void> {
    if (!this.connectedWallet) return;

    switch (this.connectedWallet.walletType) {
      case 'metamask':
        if (this.metaMask) {
          await this.metaMask.terminate();
        }
        break;
      case 'walletconnect':
        if (this.walletConnect) {
          await this.walletConnect.disconnect();
        }
        break;
    }

    this.connectedWallet = undefined;
    this.emit('walletDisconnected');
  }

  /**
   * Switch to a different chain
   */
  async switchChain(chainId: number): Promise<void> {
    if (!this.connectedWallet) {
      throw new Error('No wallet connected');
    }

    const chainConfig = this.supportedChains.get(chainId);
    if (!chainConfig) {
      throw new Error(`Chain ${chainId} not supported`);
    }

    const hexChainId = `0x${chainId.toString(16)}`;

    try {
      switch (this.connectedWallet.walletType) {
        case 'metamask':
          if (this.metaMask) {
            const ethereum = this.metaMask.getProvider();
            await ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: hexChainId }]
            });
          }
          break;
        case 'walletconnect':
          if (this.walletConnect) {
            await this.walletConnect.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: hexChainId }]
            });
          }
          break;
      }

      this.connectedWallet.chainId = chainId;
    } catch (error: any) {
      // If chain doesn't exist, add it
      if (error.code === 4902) {
        await this.addChain(chainId);
      } else {
        throw error;
      }
    }
  }

  /**
   * Add a new chain to the wallet
   */
  async addChain(chainId: number): Promise<void> {
    const chainConfig = this.supportedChains.get(chainId);
    if (!chainConfig) {
      throw new Error(`Chain ${chainId} not supported`);
    }

    const params = {
      chainId: `0x${chainId.toString(16)}`,
      chainName: chainConfig.chainName,
      nativeCurrency: chainConfig.nativeCurrency,
      rpcUrls: chainConfig.rpcUrls,
      blockExplorerUrls: chainConfig.blockExplorerUrls
    };

    switch (this.connectedWallet?.walletType) {
      case 'metamask':
        if (this.metaMask) {
          const ethereum = this.metaMask.getProvider();
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [params]
          });
        }
        break;
      case 'walletconnect':
        if (this.walletConnect) {
          await this.walletConnect.request({
            method: 'wallet_addEthereumChain',
            params: [params]
          });
        }
        break;
    }
  }

  /**
   * Get optimized gas price for transactions
   */
  async getOptimizedGasPrice(chainId: number): Promise<{
    gasPrice?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
  }> {
    if (!this.gasOptimizationEnabled) {
      return {};
    }

    try {
      // Use different gas APIs based on chain
      switch (chainId) {
        case 1: // Ethereum
          return await this.getEthereumGasPrice();
        case 137: // Polygon
          return await this.getPolygonGasPrice();
        case 56: // BSC
          return await this.getBSCGasPrice();
        default:
          return {};
      }
    } catch (error) {
      console.warn('Gas optimization failed, using default:', error);
      return {};
    }
  }

  private async getEthereumGasPrice() {
    const response = await axios.get('https://api.etherscan.io/api', {
      params: {
        module: 'gastracker',
        action: 'gasoracle',
        apikey: process.env.ETHERSCAN_API_KEY
      }
    });

    if (response.data.status === '1') {
      const result = response.data.result;
      return {
        maxFeePerGas: ethers.parseUnits(result.FastGasPrice, 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei')
      };
    }

    return {};
  }

  private async getPolygonGasPrice() {
    const response = await axios.get('https://gasstation-mainnet.matic.network/v2');
    const result = response.data;

    return {
      maxFeePerGas: ethers.parseUnits(result.fast.maxFee.toString(), 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits(result.fast.maxPriorityFee.toString(), 'gwei')
    };
  }

  private async getBSCGasPrice() {
    // BSC uses legacy gas pricing
    const response = await axios.get('https://api.bscscan.com/api', {
      params: {
        module: 'gastracker',
        action: 'gasoracle',
        apikey: process.env.BSCSCAN_API_KEY
      }
    });

    if (response.data.status === '1') {
      return {
        gasPrice: ethers.parseUnits(response.data.result.FastGasPrice, 'gwei')
      };
    }

    return {};
  }

  /**
   * Send transaction with gas optimization
   */
  async sendTransaction(
    to: string,
    data: string,
    options: TransactionOptions = {}
  ): Promise<ethers.TransactionResponse> {
    if (!this.connectedWallet) {
      throw new Error('No wallet connected');
    }

    const optimizedGas = await this.getOptimizedGasPrice(this.connectedWallet.chainId);

    const txOptions = {
      to,
      data,
      ...optimizedGas,
      ...options // User options override optimized values
    };

    return await this.connectedWallet.signer.sendTransaction(txOptions);
  }

  /**
   * Register a multi-signature wallet
   */
  registerMultiSigWallet(wallet: MultiSigWallet): void {
    this.multiSigWallets.set(wallet.address, wallet);
  }

  /**
   * Get multi-signature wallet info
   */
  getMultiSigWallet(address: string): MultiSigWallet | undefined {
    return this.multiSigWallets.get(address);
  }

  /**
   * Check if address is a registered multi-sig wallet
   */
  isMultiSigWallet(address: string): boolean {
    return this.multiSigWallets.has(address);
  }

  /**
   * Get current connected wallet
   */
  getConnectedWallet(): ConnectedWallet | undefined {
    return this.connectedWallet;
  }

  /**
   * Get supported chains
   */
  getSupportedChains(): WalletConfig[] {
    return Array.from(this.supportedChains.values());
  }

  /**
   * Check if chain is supported
   */
  isChainSupported(chainId: number): boolean {
    return this.supportedChains.has(chainId);
  }

  /**
   * Enable/disable gas optimization
   */
  setGasOptimization(enabled: boolean): void {
    this.gasOptimizationEnabled = enabled;
  }

  /**
   * Get wallet balance
   */
  async getBalance(address?: string): Promise<bigint> {
    if (!this.connectedWallet) {
      throw new Error('No wallet connected');
    }

    const targetAddress = address || this.connectedWallet.address;
    return await this.connectedWallet.provider.getBalance(targetAddress);
  }

  /**
   * Sign message
   */
  async signMessage(message: string): Promise<string> {
    if (!this.connectedWallet) {
      throw new Error('No wallet connected');
    }

    return await this.connectedWallet.signer.signMessage(message);
  }

  /**
   * Verify signed message
   */
  verifyMessage(message: string, signature: string, expectedAddress: string): boolean {
    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);
      return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
    } catch {
      return false;
    }
  }
}

export default WalletManager;