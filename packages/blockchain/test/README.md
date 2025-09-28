# Blockchain Testing Suite

Comprehensive testing infrastructure for Urnlabs blockchain components including smart contracts, services, and integration workflows.

## Overview

This testing suite provides complete coverage for all blockchain components:

- **Smart Contract Tests**: Unit tests for all Solidity contracts
- **Service Tests**: Unit tests for TypeScript service classes
- **Integration Tests**: End-to-end workflow testing
- **Performance Tests**: Gas optimization and efficiency validation
- **Security Tests**: Vulnerability and edge case testing

## Quick Start

### Prerequisites

- Node.js 18+ 
- Hardhat development environment
- Test network access (local/testnet)

### Installation

```bash
cd packages/blockchain/test
npm install
```

### Running Tests

```bash
# Run all tests
npm test

# Run contract tests only
npm run test:contracts

# Run service tests only
npm run test:services

# Run integration tests
npm run test:integration

# Run with coverage report
npm run test:coverage

# Run with gas reporting
npm run test:gas
```

## Test Structure

```
test/
├── contracts/           # Smart contract unit tests
│   ├── YieldFarm.test.ts
│   ├── CrossChainBridge.test.ts
│   ├── DAOGovernance.test.ts
│   └── EnhancedAgentNFT.test.ts
├── services/            # Service class unit tests
│   ├── WalletManager.test.ts
│   ├── IPFSManager.test.ts
│   └── CrossChainBridgeManager.test.ts
├── integration/         # End-to-end workflow tests
│   └── fullWorkflow.test.ts
├── hardhat.config.test.ts
├── package.json
└── README.md
```

## Test Categories

### Smart Contract Tests

#### YieldFarm.test.ts
- Pool management and configuration
- Staking and withdrawal operations
- Reward calculation and distribution
- Emergency functions and pausability
- Multi-user scenarios and edge cases

#### CrossChainBridge.test.ts
- Validator management and multi-signature validation
- Bridge initiation and completion workflows
- Liquidity management and fee collection
- Security controls and emergency procedures
- Cross-chain message verification

#### DAOGovernance.test.ts
- Proposal creation and lifecycle management
- Voting mechanisms and delegation
- Timelock and execution procedures
- Emergency controls and governance updates
- Complex governance scenarios

#### EnhancedAgentNFT.test.ts
- NFT minting and metadata management
- Performance-based tier calculations
- Metadata versioning and rollback
- Dynamic attribute updates
- IPFS integration testing

### Service Tests

#### WalletManager.test.ts
- MetaMask and WalletConnect integration
- Multi-wallet support and detection
- Chain switching and network management
- Transaction handling and gas optimization
- Security features and signature verification

#### IPFSManager.test.ts
- File upload and retrieval operations
- Encryption and decryption workflows
- NFT metadata management
- Performance monitoring and optimization
- Error recovery and redundancy

#### CrossChainBridgeManager.test.ts
- Bridge transfer orchestration
- Validator coordination
- Liquidity monitoring
- Fee calculation and management
- Error handling and recovery

### Integration Tests

#### fullWorkflow.test.ts
- Complete DeFi workflow testing
- DAO governance integration
- NFT lifecycle management
- Cross-chain operations
- Emergency procedures
- Performance optimization validation

## Testing Configuration

### Networks

The test suite supports multiple network configurations:

- **Hardhat**: Local development network
- **Localhost**: Local Hardhat node
- **Testnets**: Goerli, Sepolia for staging tests
- **Mainnets**: Ethereum, Polygon, BSC, Arbitrum for forking tests

### Environment Variables

Create a `.env` file in the test directory:

```env
# Network URLs
MAINNET_URL=https://mainnet.infura.io/v3/YOUR_KEY
GOERLI_URL=https://goerli.infura.io/v3/YOUR_KEY
POLYGON_URL=https://polygon-rpc.com/
BSC_URL=https://bsc-dataseed1.binance.org/

# API Keys
ETHERSCAN_API_KEY=your_etherscan_key
POLYGONSCAN_API_KEY=your_polygonscan_key
COINMARKETCAP_API_KEY=your_cmc_key

# Testing Configuration
PRIVATE_KEY=your_test_private_key
REPORT_GAS=true
TEST_GREP=specific_test_pattern
```

## Testing Best Practices

### Contract Testing

1. **Complete Coverage**: Test all functions and edge cases
2. **Event Verification**: Validate all emitted events
3. **State Changes**: Verify all state modifications
4. **Access Control**: Test permission restrictions
5. **Gas Optimization**: Monitor gas usage patterns

### Service Testing

1. **Mocking**: Use sinon for external dependencies
2. **Error Handling**: Test all error scenarios
3. **Async Operations**: Proper handling of promises
4. **Integration Points**: Test external service interactions
5. **Performance**: Monitor execution times

### Integration Testing

1. **End-to-End Flows**: Test complete user journeys
2. **Component Interaction**: Verify service coordination
3. **Data Consistency**: Ensure state synchronization
4. **Error Recovery**: Test failure scenarios
5. **Performance**: Validate system efficiency

## Advanced Testing Features

### Gas Reporting

Enable detailed gas usage analysis:

```bash
REPORT_GAS=true npm test
```

Reports include:
- Per-function gas costs
- Contract deployment costs
- Optimization recommendations
- Historical comparisons

### Coverage Analysis

Generate comprehensive coverage reports:

```bash
npm run test:coverage
```

Coverage includes:
- Line coverage
- Branch coverage
- Function coverage
- Statement coverage

### Performance Profiling

Monitor test execution performance:

```bash
npm run test:profile
```

Profiles include:
- Test execution times
- Memory usage patterns
- Resource utilization
- Bottleneck identification

### Security Testing

Run security-focused test suites:

```bash
npm run test:security
```

Security tests include:
- Reentrancy attack prevention
- Access control validation
- Input sanitization
- Edge case handling

## Continuous Integration

### GitHub Actions Integration

The test suite integrates with CI/CD pipelines:

```yaml
# .github/workflows/test.yml
name: Blockchain Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm test
      - run: npm run test:coverage
```

### Pre-commit Hooks

Automatic testing before commits:

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm run test:quick",
      "pre-push": "npm test"
    }
  }
}
```

## Debugging and Troubleshooting

### Common Issues

1. **Network Connectivity**: Ensure test networks are accessible
2. **Gas Limits**: Adjust gas settings for complex operations
3. **Timing Issues**: Use proper time manipulation in tests
4. **State Cleanup**: Reset state between test runs
5. **Mock Failures**: Verify mock configurations

### Debug Mode

Enable detailed logging:

```bash
DEBUG=true npm test
```

### Test Isolation

Run individual test files:

```bash
npx hardhat test test/contracts/YieldFarm.test.ts
```

## Contributing

### Adding New Tests

1. Follow existing naming conventions
2. Include comprehensive test coverage
3. Add proper documentation
4. Update this README if needed
5. Ensure CI/CD compatibility

### Test Standards

- Use descriptive test names
- Include setup and teardown procedures
- Test both success and failure scenarios
- Validate all state changes
- Include performance benchmarks

## Security Considerations

### Test Data

- Never use real private keys
- Use mock data for sensitive operations
- Isolate test environments
- Clean up test artifacts

### Access Controls

- Test all permission levels
- Validate role-based restrictions
- Verify emergency procedures
- Test upgrade mechanisms

## Performance Benchmarks

### Expected Performance

- Contract deployment: < 500k gas
- Token transfer: < 25k gas
- Complex operations: < 200k gas
- Test execution: < 60 seconds total

### Optimization Targets

- 95% test coverage minimum
- < 2% gas usage increase per release
- Zero critical security vulnerabilities
- 99% test success rate

## Monitoring and Alerts

### Test Metrics

Track key testing metrics:
- Test coverage percentage
- Average test execution time
- Gas usage trends
- Error rates

### Alerting

Configure alerts for:
- Test failures in CI/CD
- Coverage drops below threshold
- Gas usage increases significantly
- Security test failures

---

This comprehensive testing suite ensures all blockchain components meet production-ready standards with robust security, performance, and reliability validation.