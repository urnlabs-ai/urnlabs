# /create-feature - Full Stack Feature Development

## Description
Creates a complete feature from requirements to deployment with all necessary components including database changes, API endpoints, frontend components, tests, and documentation.

## Usage
```
/create-feature <feature-name> [--type=api|ui|full] [--entity=<entity>]
```

## Implementation
1. **Requirements Analysis**
   - Parse feature requirements and specifications
   - Identify database schema changes needed
   - Determine API endpoints required
   - Plan frontend component architecture

2. **Database Layer**
   - Create Prisma migrations if needed
   - Update database schemas
   - Add necessary indexes and constraints

3. **Backend Development**
   - Generate API endpoints with proper validation
   - Add authentication/authorization checks
   - Implement business logic
   - Add error handling and logging

4. **Frontend Development**
   - Create React/Vue components as needed
   - Add form validation and state management
   - Implement responsive design
   - Add loading states and error handling

5. **Testing**
   - Generate unit tests for business logic
   - Create integration tests for API endpoints
   - Add frontend component tests
   - Update e2e test scenarios

6. **Documentation**
   - Update API documentation
   - Add feature documentation
   - Update changelog
   - Create user guides if needed

7. **Deployment Preparation**
   - Ensure environment configurations
   - Update deployment scripts
   - Add monitoring and alerts
   - Create rollback procedures

## Example
```bash
/create-feature user-profile --type=full --entity=User
```

This creates a complete user profile feature with database models, API endpoints, frontend forms, tests, and documentation.