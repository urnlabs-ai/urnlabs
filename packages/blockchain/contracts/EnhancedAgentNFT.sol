// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./AgentNFT.sol";

/**
 * @title EnhancedAgentNFT
 * @dev Enhanced AI Agent NFT with dynamic metadata based on performance metrics
 */
contract EnhancedAgentNFT is AgentNFT {

    // Performance metrics for dynamic metadata
    struct PerformanceMetrics {
        uint256 tasksCompleted;
        uint256 successRate; // Basis points (10000 = 100%)
        uint256 averageResponseTime; // In milliseconds
        uint256 reputation; // Basis points (10000 = 100%)
        uint256 experiencePoints;
        uint256 efficiency; // Basis points (10000 = 100%)
        uint256 reliability; // Basis points (10000 = 100%)
        uint256 uptime; // Basis points (10000 = 100%)
        uint256 lastUpdated;
    }

    // Dynamic metadata configuration
    struct DynamicMetadataConfig {
        bool enabled;
        uint256 updateThreshold; // Minimum change in metrics to trigger update
        uint256 updateCooldown; // Minimum time between updates
        address updateOracle; // Address authorized to update metrics
    }

    // Metadata versioning
    struct MetadataVersion {
        string ipfsHash;
        uint256 version;
        uint256 timestamp;
        string changeLog;
        bool isRollback;
    }

    // Performance tiers based on overall performance
    enum PerformanceTier {
        Common,     // 0-60%
        Uncommon,   // 60-70%
        Rare,       // 70-80%
        Epic,       // 80-90%
        Legendary   // 90-100%
    }

    // Role for performance metric updates
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant METADATA_MANAGER_ROLE = keccak256("METADATA_MANAGER_ROLE");

    // Storage
    mapping(uint256 => PerformanceMetrics) public performanceMetrics;
    mapping(uint256 => DynamicMetadataConfig) public dynamicConfig;
    mapping(uint256 => MetadataVersion[]) public metadataVersionHistory;
    mapping(uint256 => string[]) public agentSpecializations;
    mapping(uint256 => string[]) public agentAchievements;

    // Global configuration
    uint256 public globalUpdateCooldown = 1 hours;
    bool public dynamicMetadataEnabled = true;

    // Events
    event PerformanceMetricsUpdated(
        uint256 indexed tokenId,
        uint256 tasksCompleted,
        uint256 successRate,
        uint256 reputation,
        PerformanceTier tier
    );

    event MetadataVersionCreated(
        uint256 indexed tokenId,
        uint256 version,
        string ipfsHash,
        string changeLog
    );

    event MetadataRolledBack(
        uint256 indexed tokenId,
        uint256 fromVersion,
        uint256 toVersion,
        string reason
    );

    event DynamicMetadataToggled(uint256 indexed tokenId, bool enabled);

    event SpecializationAdded(uint256 indexed tokenId, string specialization);
    event AchievementUnlocked(uint256 indexed tokenId, string achievement);

    /**
     * @dev Initialize enhanced features
     */
    function initializeEnhanced() external onlyRole(ADMIN_ROLE) {
        // Grant oracle role to admin initially
        _grantRole(ORACLE_ROLE, msg.sender);
        _grantRole(METADATA_MANAGER_ROLE, msg.sender);
    }

    /**
     * @dev Update performance metrics for an agent
     */
    function updatePerformanceMetrics(
        uint256 tokenId,
        PerformanceMetrics memory metrics
    ) external onlyRole(ORACLE_ROLE) {
        require(_exists(tokenId), "Token does not exist");
        require(
            block.timestamp >= performanceMetrics[tokenId].lastUpdated + globalUpdateCooldown,
            "Update cooldown not met"
        );

        PerformanceMetrics storage currentMetrics = performanceMetrics[tokenId];

        // Validate metrics (all should be in basis points or appropriate ranges)
        require(metrics.successRate <= 10000, "Invalid success rate");
        require(metrics.reputation <= 10000, "Invalid reputation");
        require(metrics.efficiency <= 10000, "Invalid efficiency");
        require(metrics.reliability <= 10000, "Invalid reliability");
        require(metrics.uptime <= 10000, "Invalid uptime");

        // Update metrics
        currentMetrics.tasksCompleted = metrics.tasksCompleted;
        currentMetrics.successRate = metrics.successRate;
        currentMetrics.averageResponseTime = metrics.averageResponseTime;
        currentMetrics.reputation = metrics.reputation;
        currentMetrics.experiencePoints = metrics.experiencePoints;
        currentMetrics.efficiency = metrics.efficiency;
        currentMetrics.reliability = metrics.reliability;
        currentMetrics.uptime = metrics.uptime;
        currentMetrics.lastUpdated = block.timestamp;

        // Calculate performance tier
        PerformanceTier tier = calculatePerformanceTier(tokenId);

        emit PerformanceMetricsUpdated(
            tokenId,
            metrics.tasksCompleted,
            metrics.successRate,
            metrics.reputation,
            tier
        );

        // Trigger metadata update if dynamic metadata is enabled
        if (dynamicConfig[tokenId].enabled && dynamicMetadataEnabled) {
            _triggerDynamicMetadataUpdate(tokenId);
        }
    }

    /**
     * @dev Calculate performance tier based on overall metrics
     */
    function calculatePerformanceTier(uint256 tokenId) public view returns (PerformanceTier) {
        PerformanceMetrics memory metrics = performanceMetrics[tokenId];

        // Calculate weighted score (basis points)
        uint256 overallScore = (
            metrics.successRate * 30 +         // 30% weight
            metrics.reputation * 25 +          // 25% weight
            metrics.efficiency * 20 +          // 20% weight
            metrics.reliability * 15 +         // 15% weight
            metrics.uptime * 10                // 10% weight
        ) / 100;

        if (overallScore >= 9000) return PerformanceTier.Legendary;  // 90%+
        if (overallScore >= 8000) return PerformanceTier.Epic;       // 80-90%
        if (overallScore >= 7000) return PerformanceTier.Rare;       // 70-80%
        if (overallScore >= 6000) return PerformanceTier.Uncommon;   // 60-70%
        return PerformanceTier.Common;                               // 0-60%
    }

    /**
     * @dev Create new metadata version
     */
    function createMetadataVersion(
        uint256 tokenId,
        string memory newIpfsHash,
        string memory changeLog
    ) external onlyRole(METADATA_MANAGER_ROLE) {
        require(_exists(tokenId), "Token does not exist");
        require(bytes(newIpfsHash).length > 0, "IPFS hash required");
        require(!usedHashes[newIpfsHash], "IPFS hash already used");

        MetadataVersion[] storage versions = metadataVersionHistory[tokenId];
        uint256 newVersion = versions.length + 1;

        // Create new version
        versions.push(MetadataVersion({
            ipfsHash: newIpfsHash,
            version: newVersion,
            timestamp: block.timestamp,
            changeLog: changeLog,
            isRollback: false
        }));

        // Update agent metadata
        AgentMetadata storage metadata = agentMetadata[tokenId];

        // Release old hash and mark new one as used
        if (bytes(metadata.ipfsHash).length > 0) {
            usedHashes[metadata.ipfsHash] = false;
        }
        usedHashes[newIpfsHash] = true;

        metadata.ipfsHash = newIpfsHash;
        metadata.version = newVersion;

        // Update token URI
        _setTokenURI(tokenId, string(abi.encodePacked("ipfs://", newIpfsHash)));

        emit MetadataVersionCreated(tokenId, newVersion, newIpfsHash, changeLog);
        emit AgentMetadataUpdated(tokenId, newIpfsHash);
    }

    /**
     * @dev Rollback to previous metadata version
     */
    function rollbackMetadata(
        uint256 tokenId,
        uint256 targetVersion,
        string memory reason
    ) external onlyRole(METADATA_MANAGER_ROLE) {
        require(_exists(tokenId), "Token does not exist");

        MetadataVersion[] storage versions = metadataVersionHistory[tokenId];
        require(targetVersion > 0 && targetVersion <= versions.length, "Invalid version");
        require(targetVersion < versions.length, "Cannot rollback to current version");

        MetadataVersion memory targetVersionData = versions[targetVersion - 1];
        uint256 newVersion = versions.length + 1;

        // Create rollback version
        versions.push(MetadataVersion({
            ipfsHash: targetVersionData.ipfsHash,
            version: newVersion,
            timestamp: block.timestamp,
            changeLog: string(abi.encodePacked("Rollback to v", _uint2str(targetVersion), ": ", reason)),
            isRollback: true
        }));

        // Update agent metadata
        AgentMetadata storage metadata = agentMetadata[tokenId];

        // Release current hash and mark target hash as used
        if (bytes(metadata.ipfsHash).length > 0) {
            usedHashes[metadata.ipfsHash] = false;
        }
        usedHashes[targetVersionData.ipfsHash] = true;

        metadata.ipfsHash = targetVersionData.ipfsHash;
        metadata.version = newVersion;

        // Update token URI
        _setTokenURI(tokenId, string(abi.encodePacked("ipfs://", targetVersionData.ipfsHash)));

        emit MetadataRolledBack(tokenId, versions.length - 1, targetVersion, reason);
        emit MetadataVersionCreated(tokenId, newVersion, targetVersionData.ipfsHash,
                                  string(abi.encodePacked("Rollback: ", reason)));
    }

    /**
     * @dev Add specialization to agent
     */
    function addSpecialization(
        uint256 tokenId,
        string memory specialization
    ) external onlyRole(ORACLE_ROLE) {
        require(_exists(tokenId), "Token does not exist");
        require(bytes(specialization).length > 0, "Specialization required");

        // Check if specialization already exists
        string[] storage specializations = agentSpecializations[tokenId];
        for (uint256 i = 0; i < specializations.length; i++) {
            if (keccak256(bytes(specializations[i])) == keccak256(bytes(specialization))) {
                revert("Specialization already exists");
            }
        }

        specializations.push(specialization);
        emit SpecializationAdded(tokenId, specialization);
    }

    /**
     * @dev Unlock achievement for agent
     */
    function unlockAchievement(
        uint256 tokenId,
        string memory achievement
    ) external onlyRole(ORACLE_ROLE) {
        require(_exists(tokenId), "Token does not exist");
        require(bytes(achievement).length > 0, "Achievement required");

        // Check if achievement already exists
        string[] storage achievements = agentAchievements[tokenId];
        for (uint256 i = 0; i < achievements.length; i++) {
            if (keccak256(bytes(achievements[i])) == keccak256(bytes(achievement))) {
                revert("Achievement already unlocked");
            }
        }

        achievements.push(achievement);
        emit AchievementUnlocked(tokenId, achievement);
    }

    /**
     * @dev Configure dynamic metadata for token
     */
    function configureDynamicMetadata(
        uint256 tokenId,
        bool enabled,
        uint256 updateThreshold,
        address updateOracle
    ) external {
        require(_exists(tokenId), "Token does not exist");
        AgentMetadata storage metadata = agentMetadata[tokenId];

        require(
            metadata.creator == msg.sender || hasRole(ADMIN_ROLE, msg.sender),
            "Not authorized"
        );

        dynamicConfig[tokenId] = DynamicMetadataConfig({
            enabled: enabled,
            updateThreshold: updateThreshold,
            updateCooldown: globalUpdateCooldown,
            updateOracle: updateOracle
        });

        emit DynamicMetadataToggled(tokenId, enabled);
    }

    /**
     * @dev Trigger dynamic metadata update (internal)
     */
    function _triggerDynamicMetadataUpdate(uint256 tokenId) internal {
        // This would trigger off-chain service to generate new metadata
        // based on current performance metrics and update IPFS
        // For now, just emit event for off-chain processing
        emit PerformanceMetricsUpdated(
            tokenId,
            performanceMetrics[tokenId].tasksCompleted,
            performanceMetrics[tokenId].successRate,
            performanceMetrics[tokenId].reputation,
            calculatePerformanceTier(tokenId)
        );
    }

    /**
     * @dev Get agent performance metrics
     */
    function getPerformanceMetrics(uint256 tokenId) external view returns (PerformanceMetrics memory) {
        require(_exists(tokenId), "Token does not exist");
        return performanceMetrics[tokenId];
    }

    /**
     * @dev Get agent specializations
     */
    function getSpecializations(uint256 tokenId) external view returns (string[] memory) {
        require(_exists(tokenId), "Token does not exist");
        return agentSpecializations[tokenId];
    }

    /**
     * @dev Get agent achievements
     */
    function getAchievements(uint256 tokenId) external view returns (string[] memory) {
        require(_exists(tokenId), "Token does not exist");
        return agentAchievements[tokenId];
    }

    /**
     * @dev Get metadata version history
     */
    function getMetadataVersionHistory(uint256 tokenId) external view returns (MetadataVersion[] memory) {
        require(_exists(tokenId), "Token does not exist");
        return metadataVersionHistory[tokenId];
    }

    /**
     * @dev Get dynamic metadata configuration
     */
    function getDynamicConfig(uint256 tokenId) external view returns (DynamicMetadataConfig memory) {
        require(_exists(tokenId), "Token does not exist");
        return dynamicConfig[tokenId];
    }

    /**
     * @dev Get comprehensive agent data
     */
    function getAgentFullData(uint256 tokenId) external view returns (
        AgentMetadata memory metadata,
        PerformanceMetrics memory metrics,
        string[] memory specializations,
        string[] memory achievements,
        PerformanceTier tier
    ) {
        require(_exists(tokenId), "Token does not exist");

        return (
            agentMetadata[tokenId],
            performanceMetrics[tokenId],
            agentSpecializations[tokenId],
            agentAchievements[tokenId],
            calculatePerformanceTier(tokenId)
        );
    }

    /**
     * @dev Set global update cooldown
     */
    function setGlobalUpdateCooldown(uint256 cooldown) external onlyRole(ADMIN_ROLE) {
        globalUpdateCooldown = cooldown;
    }

    /**
     * @dev Toggle global dynamic metadata
     */
    function toggleDynamicMetadata(bool enabled) external onlyRole(ADMIN_ROLE) {
        dynamicMetadataEnabled = enabled;
    }

    /**
     * @dev Utility function to convert uint to string
     */
    function _uint2str(uint256 _i) internal pure returns (string memory) {
        if (_i == 0) {
            return "0";
        }
        uint256 j = _i;
        uint256 length;
        while (j != 0) {
            length++;
            j /= 10;
        }
        bytes memory bstr = new bytes(length);
        uint256 k = length;
        while (_i != 0) {
            k = k - 1;
            uint8 temp = (48 + uint8(_i - _i / 10 * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
    }

    /**
     * @dev Override burn to clean up enhanced data
     */
    function _burn(uint256 tokenId) internal override {
        super._burn(tokenId);

        // Clean up enhanced data
        delete performanceMetrics[tokenId];
        delete dynamicConfig[tokenId];
        delete metadataVersionHistory[tokenId];
        delete agentSpecializations[tokenId];
        delete agentAchievements[tokenId];
    }

    /**
     * @dev Enhanced mint function with performance metrics initialization
     */
    function mintAgentWithMetrics(
        address to,
        AgentMetadata memory metadata,
        string memory tokenURI,
        PerformanceMetrics memory initialMetrics
    ) external payable whenNotPaused returns (uint256) {
        uint256 tokenId = mintAgent(to, metadata, tokenURI);

        // Initialize performance metrics
        performanceMetrics[tokenId] = initialMetrics;
        performanceMetrics[tokenId].lastUpdated = block.timestamp;

        // Enable dynamic metadata by default
        dynamicConfig[tokenId] = DynamicMetadataConfig({
            enabled: true,
            updateThreshold: 100, // 1% change threshold
            updateCooldown: globalUpdateCooldown,
            updateOracle: msg.sender
        });

        return tokenId;
    }
}