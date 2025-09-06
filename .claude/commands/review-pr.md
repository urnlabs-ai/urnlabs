# /review-pr - Intelligent Code Review

## Description
Performs comprehensive automated code review including security analysis, performance optimization, code quality assessment, and best practices validation.

## Usage
```
/review-pr [--pr=<number>] [--branch=<branch-name>] [--severity=low|medium|high]
```

## Review Checklist
1. **Security Analysis**
   - SQL injection vulnerabilities
   - XSS prevention
   - Authentication/authorization checks
   - Sensitive data exposure
   - OWASP Top 10 compliance

2. **Performance Review**
   - Database query optimization
   - N+1 query detection
   - Memory leak prevention
   - Caching strategies
   - Bundle size impact

3. **Code Quality**
   - Type safety compliance
   - Error handling completeness
   - Consistent coding patterns
   - Proper abstractions
   - Single responsibility principle

4. **Testing Coverage**
   - Unit test completeness
   - Integration test scenarios
   - Edge case handling
   - Mock usage appropriateness
   - Test maintainability

5. **Documentation**
   - API documentation updates
   - Code comments quality
   - README updates
   - Changelog entries
   - Breaking change notifications

6. **Deployment Readiness**
   - Environment configuration
   - Migration scripts
   - Rollback procedures
   - Feature flag usage
   - Monitoring setup

## Auto-fixes
The command automatically suggests or applies fixes for:
- Import organization
- Type annotations
- Error handling patterns
- Performance optimizations
- Security improvements

## Integration
- Creates GitHub PR comments with findings
- Updates PR status checks
- Suggests reviewers based on code changes
- Blocks merge if critical issues found