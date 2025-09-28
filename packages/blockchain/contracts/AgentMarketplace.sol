// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title AgentMarketplace
 * @dev Marketplace for trading AI agents as NFTs with advanced features
 * @author Urnlabs Team
 */
contract AgentMarketplace is 
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

    struct Agent {
        uint256 tokenId;
        address owner;
        address nftContract;
        uint256 price;
        address paymentToken; // Address(0) for ETH
        bool isListed;
        uint256 listedAt;
        string ipfsHash;
        AgentCapabilities capabilities;
        uint256 reputation;
        uint256 totalEarnings;
    }

    struct AgentCapabilities {
        string[] skills;
        uint256 performanceScore;
        uint256 complexityLevel;
        bool isVerified;
        string category;
    }

    struct Listing {
        uint256 agentId;
        address seller;
        uint256 price;
        address paymentToken;
        uint256 listedAt;
        uint256 expiresAt;
        bool isAuction;
        uint256 highestBid;
        address highestBidder;
    }

    struct Royalty {
        address recipient;
        uint256 percentage; // Basis points (100 = 1%)
    }

    // State variables
    mapping(uint256 => Agent) public agents;
    mapping(uint256 => Listing) public listings;
    mapping(address => mapping(uint256 => uint256)) public userBids;
    mapping(uint256 => Royalty) public royalties;
    mapping(address => bool) public supportedPaymentTokens;
    mapping(address => uint256) public userReputation;
    
    uint256 public nextAgentId;
    uint256 public marketplaceFee; // Basis points
    address public feeRecipient;
    uint256 public minListingDuration;
    uint256 public maxListingDuration;
    
    // Events
    event AgentListed(
        uint256 indexed agentId,
        address indexed seller,
        uint256 price,
        address paymentToken,
        bool isAuction
    );
    
    event AgentSold(
        uint256 indexed agentId,
        address indexed seller,
        address indexed buyer,
        uint256 price,
        address paymentToken
    );
    
    event AgentDelisted(uint256 indexed agentId, address indexed seller);
    
    event BidPlaced(
        uint256 indexed agentId,
        address indexed bidder,
        uint256 amount
    );
    
    event AgentRegistered(
        uint256 indexed agentId,
        address indexed owner,
        string ipfsHash
    );

    event ReputationUpdated(
        address indexed user,
        uint256 oldReputation,
        uint256 newReputation
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _admin,
        uint256 _marketplaceFee,
        address _feeRecipient
    ) public initializer {
        __ReentrancyGuard_init();
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(UPGRADER_ROLE, _admin);

        marketplaceFee = _marketplaceFee;
        feeRecipient = _feeRecipient;
        minListingDuration = 1 hours;
        maxListingDuration = 30 days;
        nextAgentId = 1;
    }

    /**
     * @dev Register a new agent in the marketplace
     */
    function registerAgent(
        address _nftContract,
        uint256 _tokenId,
        string calldata _ipfsHash,
        AgentCapabilities calldata _capabilities
    ) external nonReentrant whenNotPaused {
        require(IERC721(_nftContract).ownerOf(_tokenId) == msg.sender, "Not token owner");
        
        uint256 agentId = nextAgentId++;
        
        agents[agentId] = Agent({
            tokenId: _tokenId,
            owner: msg.sender,
            nftContract: _nftContract,
            price: 0,
            paymentToken: address(0),
            isListed: false,
            listedAt: 0,
            ipfsHash: _ipfsHash,
            capabilities: _capabilities,
            reputation: 100, // Starting reputation
            totalEarnings: 0
        });

        emit AgentRegistered(agentId, msg.sender, _ipfsHash);
    }

    /**
     * @dev List an agent for sale
     */
    function listAgent(
        uint256 _agentId,
        uint256 _price,
        address _paymentToken,
        uint256 _duration,
        bool _isAuction
    ) external nonReentrant whenNotPaused {
        Agent storage agent = agents[_agentId];
        require(agent.owner == msg.sender, "Not agent owner");
        require(!agent.isListed, "Already listed");
        require(_price > 0, "Price must be greater than 0");
        require(_duration >= minListingDuration && _duration <= maxListingDuration, "Invalid duration");
        
        if (_paymentToken != address(0)) {
            require(supportedPaymentTokens[_paymentToken], "Payment token not supported");
        }

        agent.isListed = true;
        agent.price = _price;
        agent.paymentToken = _paymentToken;
        agent.listedAt = block.timestamp;

        listings[_agentId] = Listing({
            agentId: _agentId,
            seller: msg.sender,
            price: _price,
            paymentToken: _paymentToken,
            listedAt: block.timestamp,
            expiresAt: block.timestamp + _duration,
            isAuction: _isAuction,
            highestBid: _isAuction ? 0 : _price,
            highestBidder: address(0)
        });

        emit AgentListed(_agentId, msg.sender, _price, _paymentToken, _isAuction);
    }

    /**
     * @dev Buy an agent directly (non-auction)
     */
    function buyAgent(uint256 _agentId) external payable nonReentrant whenNotPaused {
        Listing storage listing = listings[_agentId];
        Agent storage agent = agents[_agentId];
        
        require(agent.isListed, "Agent not listed");
        require(!listing.isAuction, "Agent is in auction");
        require(block.timestamp <= listing.expiresAt, "Listing expired");
        require(listing.seller != msg.sender, "Cannot buy own agent");

        uint256 totalPrice = listing.price;
        address paymentToken = listing.paymentToken;

        // Handle payment
        if (paymentToken == address(0)) {
            require(msg.value >= totalPrice, "Insufficient payment");
        } else {
            require(msg.value == 0, "ETH not accepted for token payment");
            IERC20(paymentToken).safeTransferFrom(msg.sender, address(this), totalPrice);
        }

        // Calculate fees and royalties
        uint256 marketplaceFeeAmount = (totalPrice * marketplaceFee) / 10000;
        uint256 royaltyAmount = 0;
        
        if (royalties[_agentId].recipient != address(0)) {
            royaltyAmount = (totalPrice * royalties[_agentId].percentage) / 10000;
        }

        uint256 sellerAmount = totalPrice - marketplaceFeeAmount - royaltyAmount;

        // Transfer payments
        if (paymentToken == address(0)) {
            payable(feeRecipient).transfer(marketplaceFeeAmount);
            if (royaltyAmount > 0) {
                payable(royalties[_agentId].recipient).transfer(royaltyAmount);
            }
            payable(listing.seller).transfer(sellerAmount);
            
            // Refund excess
            if (msg.value > totalPrice) {
                payable(msg.sender).transfer(msg.value - totalPrice);
            }
        } else {
            IERC20(paymentToken).safeTransfer(feeRecipient, marketplaceFeeAmount);
            if (royaltyAmount > 0) {
                IERC20(paymentToken).safeTransfer(royalties[_agentId].recipient, royaltyAmount);
            }
            IERC20(paymentToken).safeTransfer(listing.seller, sellerAmount);
        }

        // Transfer NFT ownership
        IERC721(agent.nftContract).safeTransferFrom(listing.seller, msg.sender, agent.tokenId);

        // Update agent state
        agent.owner = msg.sender;
        agent.isListed = false;
        agent.totalEarnings += sellerAmount;

        // Update reputation
        _updateReputation(listing.seller, 10); // Seller gains reputation
        _updateReputation(msg.sender, 5); // Buyer gains reputation

        // Clean up listing
        delete listings[_agentId];

        emit AgentSold(_agentId, listing.seller, msg.sender, totalPrice, paymentToken);
    }

    /**
     * @dev Place a bid on an auction
     */
    function placeBid(uint256 _agentId, uint256 _bidAmount) external payable nonReentrant whenNotPaused {
        Listing storage listing = listings[_agentId];
        Agent storage agent = agents[_agentId];
        
        require(agent.isListed, "Agent not listed");
        require(listing.isAuction, "Not an auction");
        require(block.timestamp <= listing.expiresAt, "Auction expired");
        require(listing.seller != msg.sender, "Cannot bid on own agent");

        uint256 bidAmount;
        address paymentToken = listing.paymentToken;

        if (paymentToken == address(0)) {
            bidAmount = msg.value;
            require(bidAmount > listing.highestBid, "Bid too low");
        } else {
            require(msg.value == 0, "ETH not accepted for token payment");
            bidAmount = _bidAmount;
            require(bidAmount > listing.highestBid, "Bid too low");
            IERC20(paymentToken).safeTransferFrom(msg.sender, address(this), bidAmount);
        }

        // Refund previous highest bidder
        if (listing.highestBidder != address(0)) {
            if (paymentToken == address(0)) {
                payable(listing.highestBidder).transfer(listing.highestBid);
            } else {
                IERC20(paymentToken).safeTransfer(listing.highestBidder, listing.highestBid);
            }
        }

        listing.highestBid = bidAmount;
        listing.highestBidder = msg.sender;
        userBids[msg.sender][_agentId] = bidAmount;

        emit BidPlaced(_agentId, msg.sender, bidAmount);
    }

    /**
     * @dev Finalize auction (can be called by anyone after expiry)
     */
    function finalizeAuction(uint256 _agentId) external nonReentrant whenNotPaused {
        Listing storage listing = listings[_agentId];
        Agent storage agent = agents[_agentId];
        
        require(agent.isListed, "Agent not listed");
        require(listing.isAuction, "Not an auction");
        require(block.timestamp > listing.expiresAt, "Auction not ended");
        require(listing.highestBidder != address(0), "No bids placed");

        uint256 totalPrice = listing.highestBid;
        address winner = listing.highestBidder;
        address paymentToken = listing.paymentToken;

        // Calculate fees and royalties
        uint256 marketplaceFeeAmount = (totalPrice * marketplaceFee) / 10000;
        uint256 royaltyAmount = 0;
        
        if (royalties[_agentId].recipient != address(0)) {
            royaltyAmount = (totalPrice * royalties[_agentId].percentage) / 10000;
        }

        uint256 sellerAmount = totalPrice - marketplaceFeeAmount - royaltyAmount;

        // Transfer payments
        if (paymentToken == address(0)) {
            payable(feeRecipient).transfer(marketplaceFeeAmount);
            if (royaltyAmount > 0) {
                payable(royalties[_agentId].recipient).transfer(royaltyAmount);
            }
            payable(listing.seller).transfer(sellerAmount);
        } else {
            IERC20(paymentToken).safeTransfer(feeRecipient, marketplaceFeeAmount);
            if (royaltyAmount > 0) {
                IERC20(paymentToken).safeTransfer(royalties[_agentId].recipient, royaltyAmount);
            }
            IERC20(paymentToken).safeTransfer(listing.seller, sellerAmount);
        }

        // Transfer NFT ownership
        IERC721(agent.nftContract).safeTransferFrom(listing.seller, winner, agent.tokenId);

        // Update agent state
        agent.owner = winner;
        agent.isListed = false;
        agent.totalEarnings += sellerAmount;

        // Update reputation
        _updateReputation(listing.seller, 15); // Seller gains more reputation for auction
        _updateReputation(winner, 10); // Winner gains reputation

        // Clean up
        delete listings[_agentId];
        delete userBids[winner][_agentId];

        emit AgentSold(_agentId, listing.seller, winner, totalPrice, paymentToken);
    }

    /**
     * @dev Delist an agent
     */
    function delistAgent(uint256 _agentId) external nonReentrant {
        Agent storage agent = agents[_agentId];
        Listing storage listing = listings[_agentId];
        
        require(agent.owner == msg.sender || hasRole(ADMIN_ROLE, msg.sender), "Not authorized");
        require(agent.isListed, "Agent not listed");

        // Refund highest bidder if auction
        if (listing.isAuction && listing.highestBidder != address(0)) {
            if (listing.paymentToken == address(0)) {
                payable(listing.highestBidder).transfer(listing.highestBid);
            } else {
                IERC20(listing.paymentToken).safeTransfer(listing.highestBidder, listing.highestBid);
            }
            delete userBids[listing.highestBidder][_agentId];
        }

        agent.isListed = false;
        delete listings[_agentId];

        emit AgentDelisted(_agentId, msg.sender);
    }

    /**
     * @dev Set royalty for an agent
     */
    function setRoyalty(
        uint256 _agentId,
        address _recipient,
        uint256 _percentage
    ) external {
        Agent storage agent = agents[_agentId];
        require(agent.owner == msg.sender, "Not agent owner");
        require(_percentage <= 1000, "Royalty too high"); // Max 10%

        royalties[_agentId] = Royalty({
            recipient: _recipient,
            percentage: _percentage
        });
    }

    /**
     * @dev Update agent capabilities
     */
    function updateAgentCapabilities(
        uint256 _agentId,
        AgentCapabilities calldata _capabilities
    ) external {
        Agent storage agent = agents[_agentId];
        require(agent.owner == msg.sender || hasRole(OPERATOR_ROLE, msg.sender), "Not authorized");
        
        agent.capabilities = _capabilities;
    }

    /**
     * @dev Internal function to update user reputation
     */
    function _updateReputation(address _user, uint256 _points) internal {
        uint256 oldReputation = userReputation[_user];
        userReputation[_user] += _points;
        
        emit ReputationUpdated(_user, oldReputation, userReputation[_user]);
    }

    /**
     * @dev Add supported payment token
     */
    function addPaymentToken(address _token) external onlyRole(ADMIN_ROLE) {
        supportedPaymentTokens[_token] = true;
    }

    /**
     * @dev Remove supported payment token
     */
    function removePaymentToken(address _token) external onlyRole(ADMIN_ROLE) {
        supportedPaymentTokens[_token] = false;
    }

    /**
     * @dev Set marketplace fee
     */
    function setMarketplaceFee(uint256 _fee) external onlyRole(ADMIN_ROLE) {
        require(_fee <= 1000, "Fee too high"); // Max 10%
        marketplaceFee = _fee;
    }

    /**
     * @dev Set fee recipient
     */
    function setFeeRecipient(address _recipient) external onlyRole(ADMIN_ROLE) {
        require(_recipient != address(0), "Invalid recipient");
        feeRecipient = _recipient;
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
     * @dev Emergency withdraw function
     */
    function emergencyWithdraw(address _token, uint256 _amount) external onlyRole(ADMIN_ROLE) {
        if (_token == address(0)) {
            payable(msg.sender).transfer(_amount);
        } else {
            IERC20(_token).safeTransfer(msg.sender, _amount);
        }
    }

    /**
     * @dev Get agent details
     */
    function getAgent(uint256 _agentId) external view returns (Agent memory) {
        return agents[_agentId];
    }

    /**
     * @dev Get listing details
     */
    function getListing(uint256 _agentId) external view returns (Listing memory) {
        return listings[_agentId];
    }

    /**
     * @dev Check if agent is listed
     */
    function isAgentListed(uint256 _agentId) external view returns (bool) {
        return agents[_agentId].isListed;
    }

    /**
     * @dev Get user's active bids
     */
    function getUserBid(address _user, uint256 _agentId) external view returns (uint256) {
        return userBids[_user][_agentId];
    }

    /**
     * @dev Required by UUPSUpgradeable
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    /**
     * @dev Handle direct ETH transfers
     */
    receive() external payable {
        revert("Direct transfers not allowed");
    }
}