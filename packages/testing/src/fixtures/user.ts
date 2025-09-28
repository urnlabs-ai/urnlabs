import { faker } from '@faker-js/faker';

export interface TestUser {
  id: string;
  email: string;
  name: string;
  organizationId?: string;
  role: 'admin' | 'user' | 'viewer';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  profile?: {
    avatar?: string;
    timezone?: string;
    preferences?: Record<string, any>;
  };
}

export const userFixtures = {
  defaultUser(): TestUser {
    return {
      id: faker.string.uuid(),
      email: 'test@example.com',
      name: 'Test User',
      role: 'user',
      isActive: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      profile: {
        timezone: 'UTC',
        preferences: {
          theme: 'light',
          notifications: true
        }
      }
    };
  },

  userWithId(id: string): TestUser {
    return {
      ...this.defaultUser(),
      id,
      email: `user-${id}@example.com`,
      name: `User ${id}`
    };
  },

  adminUser(): TestUser {
    return {
      ...this.defaultUser(),
      id: faker.string.uuid(),
      email: 'admin@example.com',
      name: 'Admin User',
      role: 'admin'
    };
  },

  randomUser(overrides: Partial<TestUser> = {}): TestUser {
    return {
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
      role: faker.helpers.arrayElement(['admin', 'user', 'viewer']),
      isActive: faker.datatype.boolean(),
      createdAt: faker.date.past().toISOString(),
      updatedAt: faker.date.recent().toISOString(),
      profile: {
        avatar: faker.image.avatar(),
        timezone: faker.location.timeZone(),
        preferences: {
          theme: faker.helpers.arrayElement(['light', 'dark']),
          notifications: faker.datatype.boolean()
        }
      },
      ...overrides
    };
  },

  list(count: number = 5): TestUser[] {
    return Array.from({ length: count }, () => this.randomUser());
  },

  withOrganization(organizationId: string): TestUser {
    return {
      ...this.defaultUser(),
      organizationId
    };
  },

  inactiveUser(): TestUser {
    return {
      ...this.defaultUser(),
      isActive: false
    };
  },

  create(userData: Partial<TestUser>): TestUser {
    return {
      ...this.defaultUser(),
      id: faker.string.uuid(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...userData
    };
  }
};