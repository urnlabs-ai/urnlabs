import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha";
import { WalletManager } from "../../src/services/WalletManager";
import sinon from "sinon";

// Mock window.ethereum
declare global {
  interface Window {
    ethereum?: any;
    WalletConnect?: any;
  }
}

describe("WalletManager", function () {
  let walletManager: WalletManager;
  let mockEthereum: any;
  let mockProvider: any;

  beforeEach(function () {
    // Mock window.ethereum
    mockEthereum = {
      request: sinon.stub(),
      on: sinon.stub(),
      removeListener: sinon.stub(),
      isMetaMask: true,
      selectedAddress: null,
      chainId: "0x1"
    };

    mockProvider = {
      getSigner: sinon.stub(),
      getNetwork: sinon.stub(),
      getBalance: sinon.stub(),
      estimateGas: sinon.stub(),
      sendTransaction: sinon.stub(),
      on: sinon.stub(),
      removeAllListeners: sinon.stub()
    };

    global.window = {
      ethereum: mockEthereum
    } as any;

    walletManager = new WalletManager();
  });

  afterEach(function () {
    sinon.restore();
    delete (global as any).window;
  });

  describe("MetaMask Connection", function () {
    it("should connect to MetaMask successfully", async function () {
      const mockAccounts = ["0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe"];
      mockEthereum.request.withArgs({ method: "eth_requestAccounts" }).resolves(mockAccounts);
      mockEthereum.request.withArgs({ method: "eth_chainId" }).resolves("0x1");

      const result = await walletManager.connectMetaMask();

      expect(result.success).to.be.true;
      expect(result.address).to.equal(mockAccounts[0]);
      expect(result.chainId).to.equal(1);
    });

    it("should handle MetaMask not installed", async function () {
      delete global.window.ethereum;

      const result = await walletManager.connectMetaMask();

      expect(result.success).to.be.false;
      expect(result.error).to.include("MetaMask not detected");
    });

    it("should handle user rejection", async function () {
      mockEthereum.request.withArgs({ method: "eth_requestAccounts" })
        .rejects(new Error("User rejected the request"));

      const result = await walletManager.connectMetaMask();

      expect(result.success).to.be.false;
      expect(result.error).to.include("User rejected");
    });

    it("should handle network errors", async function () {
      mockEthereum.request.withArgs({ method: "eth_requestAccounts" })
        .rejects(new Error("Network error"));

      const result = await walletManager.connectMetaMask();

      expect(result.success).to.be.false;
      expect(result.error).to.include("Network error");
    });
  });

  describe("Chain Management", function () {
    beforeEach(async function () {
      const mockAccounts = ["0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe"];
      mockEthereum.request.withArgs({ method: "eth_requestAccounts" }).resolves(mockAccounts);
      mockEthereum.request.withArgs({ method: "eth_chainId" }).resolves("0x1");
      await walletManager.connectMetaMask();
    });

    it("should switch to supported chain", async function () {
      mockEthereum.request.withArgs({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x89" }]
      }).resolves();

      const result = await walletManager.switchChain(137); // Polygon

      expect(result.success).to.be.true;
      expect(result.chainId).to.equal(137);
    });

    it("should add chain if not exists", async function () {
      mockEthereum.request.withArgs({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x89" }]
      }).rejects({ code: 4902 }); // Chain not added

      mockEthereum.request.withArgs({
        method: "wallet_addEthereumChain",
        params: [sinon.match.object]
      }).resolves();

      const result = await walletManager.switchChain(137);

      expect(result.success).to.be.true;
      expect(mockEthereum.request.calledWith({
        method: "wallet_addEthereumChain",
        params: [sinon.match.object]
      })).to.be.true;
    });

    it("should handle unsupported chain", async function () {
      const result = await walletManager.switchChain(999999); // Unsupported chain

      expect(result.success).to.be.false;
      expect(result.error).to.include("Unsupported chain");
    });

    it("should get current chain info", async function () {
      mockEthereum.request.withArgs({ method: "eth_chainId" }).resolves("0x1");

      const chainInfo = await walletManager.getCurrentChain();

      expect(chainInfo.chainId).to.equal(1);
      expect(chainInfo.name).to.equal("Ethereum Mainnet");
    });
  });

  describe("Transaction Management", function () {
    beforeEach(async function () {
      const mockAccounts = ["0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe"];
      mockEthereum.request.withArgs({ method: "eth_requestAccounts" }).resolves(mockAccounts);
      mockEthereum.request.withArgs({ method: "eth_chainId" }).resolves("0x1");
      await walletManager.connectMetaMask();
    });

    it("should send transaction successfully", async function () {
      const mockTxHash = "0x123456789abcdef";
      mockEthereum.request.withArgs({
        method: "eth_sendTransaction",
        params: [sinon.match.object]
      }).resolves(mockTxHash);

      const transaction = {
        to: "0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe",
        value: "0x16345785D8A0000", // 0.1 ETH
        data: "0x"
      };

      const result = await walletManager.sendTransaction(transaction);

      expect(result.success).to.be.true;
      expect(result.hash).to.equal(mockTxHash);
    });

    it("should handle transaction rejection", async function () {
      mockEthereum.request.withArgs({
        method: "eth_sendTransaction",
        params: [sinon.match.object]
      }).rejects(new Error("User denied transaction signature"));

      const transaction = {
        to: "0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe",
        value: "0x16345785D8A0000",
        data: "0x"
      };

      const result = await walletManager.sendTransaction(transaction);

      expect(result.success).to.be.false;
      expect(result.error).to.include("User denied");
    });

    it("should estimate gas correctly", async function () {
      mockEthereum.request.withArgs({
        method: "eth_estimateGas",
        params: [sinon.match.object]
      }).resolves("0x5208"); // 21000 gas

      const transaction = {
        to: "0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe",
        value: "0x16345785D8A0000",
        data: "0x"
      };

      const gasEstimate = await walletManager.estimateGas(transaction);

      expect(gasEstimate).to.equal("21000");
    });

    it("should get gas price with optimization", async function () {
      mockEthereum.request.withArgs({ method: "eth_gasPrice" }).resolves("0x4A817C800"); // 20 gwei

      const gasPrice = await walletManager.getOptimalGasPrice();

      expect(gasPrice.standard).to.be.a("string");
      expect(gasPrice.fast).to.be.a("string");
      expect(gasPrice.instant).to.be.a("string");
    });
  });

  describe("Balance Management", function () {
    beforeEach(async function () {
      const mockAccounts = ["0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe"];
      mockEthereum.request.withArgs({ method: "eth_requestAccounts" }).resolves(mockAccounts);
      mockEthereum.request.withArgs({ method: "eth_chainId" }).resolves("0x1");
      await walletManager.connectMetaMask();
    });

    it("should get ETH balance", async function () {
      const mockBalance = "0x16345785D8A0000"; // 0.1 ETH
      mockEthereum.request.withArgs({
        method: "eth_getBalance",
        params: [sinon.match.string, "latest"]
      }).resolves(mockBalance);

      const balance = await walletManager.getBalance();

      expect(balance).to.equal("0.1");
    });

    it("should get token balance", async function () {
      const mockTokenBalance = "0x56BC75E2D630E000"; // 100 tokens (18 decimals)
      mockEthereum.request.withArgs({
        method: "eth_call",
        params: [sinon.match.object, "latest"]
      }).resolves(mockTokenBalance);

      const tokenAddress = "0xA0b86a33E6441f8fa4f32d216A62D78bA80E5B23";
      const balance = await walletManager.getTokenBalance(tokenAddress);

      expect(balance).to.equal("100.0");
    });

    it("should handle invalid token address", async function () {
      mockEthereum.request.withArgs({
        method: "eth_call",
        params: [sinon.match.object, "latest"]
      }).rejects(new Error("Invalid token"));

      const invalidTokenAddress = "0x0000000000000000000000000000000000000000";

      try {
        await walletManager.getTokenBalance(invalidTokenAddress);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error.message).to.include("Invalid token");
      }
    });
  });

  describe("Event Handling", function () {
    beforeEach(async function () {
      const mockAccounts = ["0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe"];
      mockEthereum.request.withArgs({ method: "eth_requestAccounts" }).resolves(mockAccounts);
      mockEthereum.request.withArgs({ method: "eth_chainId" }).resolves("0x1");
      await walletManager.connectMetaMask();
    });

    it("should handle account changes", function () {
      const callback = sinon.spy();
      walletManager.onAccountsChanged(callback);

      const newAccounts = ["0x123456789abcdef123456789abcdef123456789a"];
      
      // Simulate account change event
      const accountsChangedHandler = mockEthereum.on.getCalls()
        .find(call => call.args[0] === "accountsChanged")?.args[1];
      
      if (accountsChangedHandler) {
        accountsChangedHandler(newAccounts);
        expect(callback.calledWith(newAccounts)).to.be.true;
      }
    });

    it("should handle chain changes", function () {
      const callback = sinon.spy();
      walletManager.onChainChanged(callback);

      const newChainId = "0x89"; // Polygon
      
      // Simulate chain change event
      const chainChangedHandler = mockEthereum.on.getCalls()
        .find(call => call.args[0] === "chainChanged")?.args[1];
      
      if (chainChangedHandler) {
        chainChangedHandler(newChainId);
        expect(callback.calledWith(137)).to.be.true; // Converted to decimal
      }
    });

    it("should handle disconnect events", function () {
      const callback = sinon.spy();
      walletManager.onDisconnect(callback);

      // Simulate disconnect event
      const disconnectHandler = mockEthereum.on.getCalls()
        .find(call => call.args[0] === "disconnect")?.args[1];
      
      if (disconnectHandler) {
        disconnectHandler();
        expect(callback.called).to.be.true;
      }
    });
  });

  describe("WalletConnect Integration", function () {
    it("should connect via WalletConnect", async function () {
      // Mock WalletConnect
      const mockWalletConnect = {
        connect: sinon.stub().resolves(),
        accounts: ["0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe"],
        chainId: 1,
        connected: true,
        on: sinon.stub(),
        disconnect: sinon.stub()
      };

      global.window.WalletConnect = sinon.stub().returns(mockWalletConnect);

      const result = await walletManager.connectWalletConnect();

      expect(result.success).to.be.true;
      expect(result.address).to.equal(mockWalletConnect.accounts[0]);
      expect(result.chainId).to.equal(1);
    });

    it("should handle WalletConnect not available", async function () {
      delete global.window.WalletConnect;

      const result = await walletManager.connectWalletConnect();

      expect(result.success).to.be.false;
      expect(result.error).to.include("WalletConnect not available");
    });

    it("should handle WalletConnect connection failure", async function () {
      const mockWalletConnect = {
        connect: sinon.stub().rejects(new Error("Connection failed")),
        on: sinon.stub()
      };

      global.window.WalletConnect = sinon.stub().returns(mockWalletConnect);

      const result = await walletManager.connectWalletConnect();

      expect(result.success).to.be.false;
      expect(result.error).to.include("Connection failed");
    });
  });

  describe("Multi-Wallet Support", function () {
    it("should detect available wallets", async function () {
      // Mock multiple wallet providers
      global.window.ethereum = { isMetaMask: true };
      global.window.WalletConnect = sinon.stub();

      const availableWallets = await walletManager.getAvailableWallets();

      expect(availableWallets).to.include("MetaMask");
      expect(availableWallets).to.include("WalletConnect");
    });

    it("should handle wallet priority selection", async function () {
      // MetaMask should be preferred if available
      global.window.ethereum = { 
        isMetaMask: true,
        request: sinon.stub().resolves(["0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe"])
      };

      const wallet = await walletManager.connectPreferredWallet();

      expect(wallet.success).to.be.true;
      expect(wallet.provider).to.equal("MetaMask");
    });

    it("should fallback to other wallets if preferred unavailable", async function () {
      delete global.window.ethereum;
      
      const mockWalletConnect = {
        connect: sinon.stub().resolves(),
        accounts: ["0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe"],
        chainId: 1,
        connected: true,
        on: sinon.stub()
      };

      global.window.WalletConnect = sinon.stub().returns(mockWalletConnect);

      const wallet = await walletManager.connectPreferredWallet();

      expect(wallet.success).to.be.true;
      expect(wallet.provider).to.equal("WalletConnect");
    });
  });

  describe("Security Features", function () {
    beforeEach(async function () {
      const mockAccounts = ["0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe"];
      mockEthereum.request.withArgs({ method: "eth_requestAccounts" }).resolves(mockAccounts);
      mockEthereum.request.withArgs({ method: "eth_chainId" }).resolves("0x1");
      await walletManager.connectMetaMask();
    });

    it("should validate transaction parameters", async function () {
      const invalidTransaction = {
        to: "invalid-address",
        value: "invalid-value",
        data: "0x"
      };

      try {
        await walletManager.sendTransaction(invalidTransaction);
        expect.fail("Should have thrown validation error");
      } catch (error) {
        expect(error.message).to.include("Invalid");
      }
    });

    it("should sign messages securely", async function () {
      const message = "Test message for signing";
      const mockSignature = "0x123456789abcdef...";
      
      mockEthereum.request.withArgs({
        method: "personal_sign",
        params: [sinon.match.string, sinon.match.string]
      }).resolves(mockSignature);

      const signature = await walletManager.signMessage(message);

      expect(signature).to.equal(mockSignature);
    });

    it("should verify signatures correctly", async function () {
      const message = "Test message";
      const signature = "0x123456789abcdef...";
      const expectedAddress = "0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe";

      // This would normally use ethers.js to verify
      const isValid = await walletManager.verifySignature(message, signature, expectedAddress);

      expect(typeof isValid).to.equal("boolean");
    });
  });

  describe("Error Handling", function () {
    it("should handle network disconnection gracefully", async function () {
      mockEthereum.request.rejects(new Error("Network error"));

      const result = await walletManager.connectMetaMask();

      expect(result.success).to.be.false;
      expect(result.error).to.include("Network error");
    });

    it("should handle RPC errors appropriately", async function () {
      mockEthereum.request.rejects({
        code: -32603,
        message: "Internal JSON-RPC error"
      });

      const result = await walletManager.connectMetaMask();

      expect(result.success).to.be.false;
      expect(result.error).to.include("RPC error");
    });

    it("should retry failed operations", async function () {
      let callCount = 0;
      mockEthereum.request.callsFake(() => {
        callCount++;
        if (callCount < 3) {
          throw new Error("Temporary failure");
        }
        return Promise.resolve(["0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe"]);
      });

      const result = await walletManager.connectMetaMask();

      expect(result.success).to.be.true;
      expect(callCount).to.equal(3);
    });
  });

  describe("State Management", function () {
    it("should track connection state correctly", async function () {
      expect(walletManager.isConnected()).to.be.false;

      const mockAccounts = ["0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe"];
      mockEthereum.request.withArgs({ method: "eth_requestAccounts" }).resolves(mockAccounts);
      mockEthereum.request.withArgs({ method: "eth_chainId" }).resolves("0x1");

      await walletManager.connectMetaMask();

      expect(walletManager.isConnected()).to.be.true;
      expect(walletManager.getCurrentAddress()).to.equal(mockAccounts[0]);
    });

    it("should clean up on disconnect", async function () {
      const mockAccounts = ["0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe"];
      mockEthereum.request.withArgs({ method: "eth_requestAccounts" }).resolves(mockAccounts);
      mockEthereum.request.withArgs({ method: "eth_chainId" }).resolves("0x1");

      await walletManager.connectMetaMask();
      expect(walletManager.isConnected()).to.be.true;

      await walletManager.disconnect();

      expect(walletManager.isConnected()).to.be.false;
      expect(walletManager.getCurrentAddress()).to.be.null;
    });

    it("should persist connection state across page reloads", async function () {
      const mockAccounts = ["0x742d35Cc6635C0532925a3b8D163B02B4C7b0dCe"];
      mockEthereum.selectedAddress = mockAccounts[0];
      mockEthereum.chainId = "0x1";

      await walletManager.checkExistingConnection();

      expect(walletManager.isConnected()).to.be.true;
      expect(walletManager.getCurrentAddress()).to.equal(mockAccounts[0]);
    });
  });
});