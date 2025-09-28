// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";

/**
 * @title AgentNFT
 * @dev NFT contract for AI agents with metadata and royalty support
 * @author Urnlabs Team
 */
contract AgentNFT is
    Initializable,
    ERC721Upgradeable,
    ERC721EnumerableUpgradeable,
    ERC721URIStorageUpgradeable,
    PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    IERC2981
{
    using Counters for Counters.Counter;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    struct AgentMetadata {
        string name;
        string description;
        string category;
        string[] capabilities;
        string creatorName;
        address creator;
        uint256 createdAt;
        uint256 version;
        bool isVerified;
        string ipfsHash;
    }

    struct RoyaltyInfo {
        address recipient;
        uint96 royaltyFraction; // Basis points (10000 = 100%)
    }

    Counters.Counter private _tokenIdCounter;
    
    mapping(uint256 => AgentMetadata) public agentMetadata;
    mapping(uint256 => RoyaltyInfo) private _tokenRoyaltyInfo;
    mapping(address => bool) public verifiedCreators;
    mapping(string => bool) public usedHashes;
    
    uint256 public maxSupply;
    uint256 public mintPrice;
    address payable public treasury;
    RoyaltyInfo private _defaultRoyaltyInfo;
    
    event AgentMinted(
        uint256 indexed tokenId,
        address indexed creator,
        address indexed to,
        string ipfsHash
    );
    
    event AgentMetadataUpdated(
        uint256 indexed tokenId,
        string ipfsHash
    );
    
    event CreatorVerified(address indexed creator);
    event CreatorUnverified(address indexed creator);
    
    event RoyaltySet(
        uint256 indexed tokenId,
        address recipient,
        uint96 royaltyFraction
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory name,
        string memory symbol,
        address admin,
        uint256 _maxSupply,
        uint256 _mintPrice,
        address payable _treasury
    ) public initializer {
        __ERC721_init(name, symbol);
        __ERC721Enumerable_init();
        __ERC721URIStorage_init();
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);

        maxSupply = _maxSupply;
        mintPrice = _mintPrice;
        treasury = _treasury;
        
        _tokenIdCounter.increment(); // Start from 1
        
        // Set default royalty to 5%
        _setDefaultRoyalty(_treasury, 500);
    }

    /**
     * @dev Mint a new agent NFT
     */
    function mintAgent(
        address to,
        AgentMetadata memory metadata,
        string memory tokenURI
    ) public payable whenNotPaused returns (uint256) {
        require(msg.value >= mintPrice, "Insufficient payment");
        require(totalSupply() < maxSupply, "Max supply reached");
        require(!usedHashes[metadata.ipfsHash], "IPFS hash already used");
        require(bytes(metadata.name).length > 0, "Name required");
        require(bytes(metadata.ipfsHash).length > 0, "IPFS hash required");

        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();

        // Mark IPFS hash as used
        usedHashes[metadata.ipfsHash] = true;

        // Set metadata
        metadata.creator = msg.sender;
        metadata.createdAt = block.timestamp;
        metadata.version = 1;
        metadata.isVerified = verifiedCreators[msg.sender];
        
        agentMetadata[tokenId] = metadata;

        // Mint the NFT
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI);

        // Set creator royalty if not set
        if (_tokenRoyaltyInfo[tokenId].recipient == address(0)) {
            _setTokenRoyalty(tokenId, msg.sender, 1000); // 10% to creator
        }

        // Transfer payment to treasury
        if (msg.value > 0) {
            treasury.transfer(msg.value);
        }

        emit AgentMinted(tokenId, msg.sender, to, metadata.ipfsHash);
        
        return tokenId;
    }

    /**
     * @dev Batch mint agents (admin only)
     */
    function batchMintAgent(
        address[] memory recipients,
        AgentMetadata[] memory metadataArray,
        string[] memory tokenURIs
    ) external onlyRole(MINTER_ROLE) whenNotPaused {
        require(recipients.length == metadataArray.length, "Arrays length mismatch");
        require(recipients.length == tokenURIs.length, "Arrays length mismatch");
        require(totalSupply() + recipients.length <= maxSupply, "Exceeds max supply");

        for (uint256 i = 0; i < recipients.length; i++) {
            uint256 tokenId = _tokenIdCounter.current();
            _tokenIdCounter.increment();

            require(!usedHashes[metadataArray[i].ipfsHash], "IPFS hash already used");
            usedHashes[metadataArray[i].ipfsHash] = true;

            metadataArray[i].creator = msg.sender;
            metadataArray[i].createdAt = block.timestamp;
            metadataArray[i].version = 1;
            metadataArray[i].isVerified = verifiedCreators[msg.sender];
            
            agentMetadata[tokenId] = metadataArray[i];

            _safeMint(recipients[i], tokenId);
            _setTokenURI(tokenId, tokenURIs[i]);

            emit AgentMinted(tokenId, msg.sender, recipients[i], metadataArray[i].ipfsHash);
        }
    }

    /**
     * @dev Update agent metadata (creator or admin only)
     */
    function updateAgentMetadata(
        uint256 tokenId,
        AgentMetadata memory newMetadata,
        string memory newTokenURI
    ) external {
        require(_exists(tokenId), "Token does not exist");
        AgentMetadata storage metadata = agentMetadata[tokenId];
        
        require(
            metadata.creator == msg.sender || hasRole(ADMIN_ROLE, msg.sender),
            "Not authorized to update"
        );

        // Update metadata
        if (bytes(newMetadata.name).length > 0) {
            metadata.name = newMetadata.name;
        }
        if (bytes(newMetadata.description).length > 0) {
            metadata.description = newMetadata.description;
        }
        if (bytes(newMetadata.category).length > 0) {
            metadata.category = newMetadata.category;
        }
        if (newMetadata.capabilities.length > 0) {
            metadata.capabilities = newMetadata.capabilities;
        }
        
        metadata.version += 1;
        
        // Update IPFS hash if provided and unique
        if (bytes(newMetadata.ipfsHash).length > 0) {
            require(!usedHashes[newMetadata.ipfsHash], "IPFS hash already used");
            usedHashes[metadata.ipfsHash] = false; // Release old hash
            usedHashes[newMetadata.ipfsHash] = true; // Mark new hash as used
            metadata.ipfsHash = newMetadata.ipfsHash;
        }

        // Update token URI if provided
        if (bytes(newTokenURI).length > 0) {
            _setTokenURI(tokenId, newTokenURI);
        }

        emit AgentMetadataUpdated(tokenId, metadata.ipfsHash);
    }

    /**
     * @dev Verify a creator
     */
    function verifyCreator(address creator) external onlyRole(ADMIN_ROLE) {
        verifiedCreators[creator] = true;
        emit CreatorVerified(creator);
    }

    /**
     * @dev Unverify a creator
     */
    function unverifyCreator(address creator) external onlyRole(ADMIN_ROLE) {
        verifiedCreators[creator] = false;
        emit CreatorUnverified(creator);
    }

    /**
     * @dev Set royalty for a specific token
     */
    function setTokenRoyalty(
        uint256 tokenId,
        address recipient,
        uint96 feeNumerator
    ) external {
        require(_exists(tokenId), "Token does not exist");
        AgentMetadata storage metadata = agentMetadata[tokenId];
        
        require(
            metadata.creator == msg.sender || hasRole(ADMIN_ROLE, msg.sender),
            "Not authorized"
        );
        
        _setTokenRoyalty(tokenId, recipient, feeNumerator);
    }

    /**
     * @dev Set default royalty
     */
    function setDefaultRoyalty(
        address recipient,
        uint96 feeNumerator
    ) external onlyRole(ADMIN_ROLE) {
        _setDefaultRoyalty(recipient, feeNumerator);
    }

    /**
     * @dev Get agent metadata
     */
    function getAgentMetadata(uint256 tokenId) external view returns (AgentMetadata memory) {
        require(_exists(tokenId), "Token does not exist");
        return agentMetadata[tokenId];
    }

    /**
     * @dev Get tokens owned by an address
     */
    function getTokensByOwner(address owner) external view returns (uint256[] memory) {
        uint256 balance = balanceOf(owner);
        uint256[] memory tokens = new uint256[](balance);
        
        for (uint256 i = 0; i < balance; i++) {
            tokens[i] = tokenOfOwnerByIndex(owner, i);
        }
        
        return tokens;
    }

    /**
     * @dev Get all agent metadata for tokens owned by an address
     */
    function getAgentsByOwner(address owner) external view returns (AgentMetadata[] memory) {
        uint256 balance = balanceOf(owner);
        AgentMetadata[] memory agents = new AgentMetadata[](balance);
        
        for (uint256 i = 0; i < balance; i++) {
            uint256 tokenId = tokenOfOwnerByIndex(owner, i);
            agents[i] = agentMetadata[tokenId];
        }
        
        return agents;
    }

    /**
     * @dev Set mint price
     */
    function setMintPrice(uint256 _mintPrice) external onlyRole(ADMIN_ROLE) {
        mintPrice = _mintPrice;
    }

    /**
     * @dev Set treasury address
     */
    function setTreasury(address payable _treasury) external onlyRole(ADMIN_ROLE) {
        require(_treasury != address(0), "Invalid treasury address");
        treasury = _treasury;
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
     * @dev Withdraw contract balance
     */
    function withdraw() external onlyRole(ADMIN_ROLE) {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        treasury.transfer(balance);
    }

    /**
     * @dev ERC2981 royalty info
     */
    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        external
        view
        override
        returns (address, uint256)
    {
        RoyaltyInfo memory royalty = _tokenRoyaltyInfo[tokenId];

        if (royalty.recipient == address(0)) {
            royalty = _defaultRoyaltyInfo;
        }

        uint256 royaltyAmount = (salePrice * royalty.royaltyFraction) / _feeDenominator();

        return (royalty.recipient, royaltyAmount);
    }

    /**
     * @dev Set token royalty internal
     */
    function _setTokenRoyalty(
        uint256 tokenId,
        address recipient,
        uint96 feeNumerator
    ) internal {
        require(feeNumerator <= _feeDenominator(), "ERC2981: royalty fee will exceed salePrice");
        require(recipient != address(0), "ERC2981: Invalid parameters");

        _tokenRoyaltyInfo[tokenId] = RoyaltyInfo(recipient, feeNumerator);
        
        emit RoyaltySet(tokenId, recipient, feeNumerator);
    }

    /**
     * @dev Set default royalty internal
     */
    function _setDefaultRoyalty(address recipient, uint96 feeNumerator) internal {
        require(feeNumerator <= _feeDenominator(), "ERC2981: royalty fee will exceed salePrice");
        require(recipient != address(0), "ERC2981: invalid receiver");

        _defaultRoyaltyInfo = RoyaltyInfo(recipient, feeNumerator);
    }

    /**
     * @dev Fee denominator for royalty calculations
     */
    function _feeDenominator() internal pure virtual returns (uint96) {
        return 10000;
    }

    /**
     * @dev Required override functions
     */
    function _beforeTokenTransfer(address from, address to, uint256 tokenId, uint256 batchSize)
        internal
        whenNotPaused
        override(ERC721Upgradeable, ERC721EnumerableUpgradeable)
    {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    function _burn(uint256 tokenId)
        internal
        override(ERC721Upgradeable, ERC721URIStorageUpgradeable)
    {
        super._burn(tokenId);
        
        // Clear royalty info
        delete _tokenRoyaltyInfo[tokenId];
        
        // Clear metadata and free IPFS hash
        string memory ipfsHash = agentMetadata[tokenId].ipfsHash;
        if (bytes(ipfsHash).length > 0) {
            usedHashes[ipfsHash] = false;
        }
        delete agentMetadata[tokenId];
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721Upgradeable, ERC721URIStorageUpgradeable)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Upgradeable, ERC721EnumerableUpgradeable, AccessControlUpgradeable, IERC165)
        returns (bool)
    {
        return interfaceId == type(IERC2981).interfaceId || super.supportsInterface(interfaceId);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        onlyRole(UPGRADER_ROLE)
        override
    {}
}