import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { build } from '../server';
import { FastifyInstance } from 'fastify';

// Testing Agent - Comprehensive test suite for profiles API
describe('Profiles API', () => {
  let app: FastifyInstance;
  let testUserId: string;
  let authToken: string;

  beforeEach(async () => {
    app = build({ logger: false });
    await app.ready();

    // Setup test user and auth token
    testUserId = 'test-user-id-123';
    authToken = 'valid-jwt-token';

    // Mock authentication
    vi.spyOn(app, 'jwtVerify').mockResolvedValue({
      id: testUserId,
      email: 'test@example.com',
      isAdmin: false,
    });
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  describe('GET /profiles/:userId', () => {
    it('should return user profile when authenticated user requests own profile', async () => {
      // Mock database response
      const mockProfile = {
        id: 'profile-id-123',
        user_id: testUserId,
        display_name: 'Test User',
        bio: 'Test bio',
        avatar_url: 'https://example.com/avatar.jpg',
        location: 'Test City',
        website_url: 'https://example.com',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      vi.spyOn(app.db.userProfile, 'findUnique').mockResolvedValue(mockProfile);

      const response = await app.inject({
        method: 'GET',
        url: `/profiles/${testUserId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.profile).toEqual(mockProfile);
    });

    it('should return 403 when user tries to access another user profile', async () => {
      const otherUserId = 'other-user-id-456';

      const response = await app.inject({
        method: 'GET',
        url: `/profiles/${otherUserId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe('Access denied');
    });

    it('should return 404 when profile does not exist', async () => {
      vi.spyOn(app.db.userProfile, 'findUnique').mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/profiles/${testUserId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe('Profile not found');
    });

    it('should return 401 when user is not authenticated', async () => {
      vi.spyOn(app, 'jwtVerify').mockRejectedValue(new Error('Invalid token'));

      const response = await app.inject({
        method: 'GET',
        url: `/profiles/${testUserId}`,
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error).toBe('Authentication required');
    });
  });

  describe('POST /profiles', () => {
    it('should create a new profile with valid data', async () => {
      const profileData = {
        display_name: 'New User',
        bio: 'New user bio',
        location: 'New City',
      };

      const mockCreatedProfile = {
        id: 'new-profile-id',
        user_id: testUserId,
        ...profileData,
        avatar_url: null,
        website_url: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      vi.spyOn(app.db.userProfile, 'findUnique').mockResolvedValue(null);
      vi.spyOn(app.db.userProfile, 'create').mockResolvedValue(mockCreatedProfile);
      vi.spyOn(app.io, 'to').mockReturnValue({ emit: vi.fn() } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/profiles',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: profileData,
      });

      expect(response.statusCode).toBe(201);
      const data = response.json();
      expect(data.profile).toEqual(mockCreatedProfile);
    });

    it('should return 409 when profile already exists', async () => {
      const existingProfile = { id: 'existing-id', user_id: testUserId };
      vi.spyOn(app.db.userProfile, 'findUnique').mockResolvedValue(existingProfile as any);

      const response = await app.inject({
        method: 'POST',
        url: '/profiles',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: { display_name: 'Test' },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe('Profile already exists');
    });

    it('should validate input data and reject invalid URLs', async () => {
      const invalidData = {
        display_name: 'Test User',
        avatar_url: 'invalid-url',
        website_url: 'not-a-url',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/profiles',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: invalidData,
      });

      expect(response.statusCode).toBe(400);
    });

    it('should sanitize input data', async () => {
      const dirtyData = {
        display_name: '  Test User  ',
        bio: '  Test bio with spaces  ',
        location: '  Test City  ',
      };

      const mockCreatedProfile = {
        id: 'new-profile-id',
        user_id: testUserId,
        display_name: 'Test User',
        bio: 'Test bio with spaces',
        location: 'Test City',
        avatar_url: null,
        website_url: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      vi.spyOn(app.db.userProfile, 'findUnique').mockResolvedValue(null);
      vi.spyOn(app.db.userProfile, 'create').mockResolvedValue(mockCreatedProfile);
      vi.spyOn(app.io, 'to').mockReturnValue({ emit: vi.fn() } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/profiles',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: dirtyData,
      });

      expect(response.statusCode).toBe(201);
      
      // Verify sanitized data was used in create call
      const createCall = vi.mocked(app.db.userProfile.create).mock.calls[0][0];
      expect(createCall.data.display_name).toBe('Test User');
      expect(createCall.data.bio).toBe('Test bio with spaces');
      expect(createCall.data.location).toBe('Test City');
    });
  });

  describe('PUT /profiles/:userId', () => {
    it('should update profile with valid data', async () => {
      const updateData = {
        display_name: 'Updated User',
        bio: 'Updated bio',
      };

      const mockUpdatedProfile = {
        id: 'profile-id',
        user_id: testUserId,
        ...updateData,
        location: 'Original City',
        avatar_url: null,
        website_url: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      vi.spyOn(app.redis, 'incr').mockResolvedValue(1);
      vi.spyOn(app.redis, 'expire').mockResolvedValue(1);
      vi.spyOn(app.db.userProfile, 'update').mockResolvedValue(mockUpdatedProfile);
      vi.spyOn(app.io, 'to').mockReturnValue({ emit: vi.fn() } as any);

      const response = await app.inject({
        method: 'PUT',
        url: `/profiles/${testUserId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: updateData,
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.profile).toEqual(mockUpdatedProfile);
    });

    it('should enforce rate limiting', async () => {
      vi.spyOn(app.redis, 'incr').mockResolvedValue(11); // Exceeds limit

      const response = await app.inject({
        method: 'PUT',
        url: `/profiles/${testUserId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: { display_name: 'Test' },
      });

      expect(response.statusCode).toBe(429);
      expect(response.json().error).toBe('Rate limit exceeded');
    });

    it('should return 403 when user tries to update another user profile', async () => {
      const otherUserId = 'other-user-id';

      const response = await app.inject({
        method: 'PUT',
        url: `/profiles/${otherUserId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: { display_name: 'Test' },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe('Access denied');
    });

    it('should return 404 when profile does not exist', async () => {
      vi.spyOn(app.redis, 'incr').mockResolvedValue(1);
      vi.spyOn(app.redis, 'expire').mockResolvedValue(1);
      vi.spyOn(app.db.userProfile, 'update').mockRejectedValue({ code: 'P2025' });

      const response = await app.inject({
        method: 'PUT',
        url: `/profiles/${testUserId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: { display_name: 'Test' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe('Profile not found');
    });
  });

  describe('DELETE /profiles/:userId', () => {
    it('should soft delete user profile', async () => {
      const mockDeletedProfile = {
        id: 'profile-id',
        user_id: testUserId,
        display_name: 'Test User',
        deleted_at: '2024-01-02T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      vi.spyOn(app.db.userProfile, 'update').mockResolvedValue(mockDeletedProfile as any);
      vi.spyOn(app.io, 'to').mockReturnValue({ emit: vi.fn() } as any);

      const response = await app.inject({
        method: 'DELETE',
        url: `/profiles/${testUserId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().message).toBe('Profile deleted successfully');

      // Verify soft delete was performed
      const updateCall = vi.mocked(app.db.userProfile.update).mock.calls[0][0];
      expect(updateCall.data).toHaveProperty('deleted_at');
    });

    it('should return 403 when user tries to delete another user profile', async () => {
      const otherUserId = 'other-user-id';

      const response = await app.inject({
        method: 'DELETE',
        url: `/profiles/${otherUserId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe('Access denied');
    });

    it('should return 404 when profile does not exist', async () => {
      vi.spyOn(app.db.userProfile, 'update').mockRejectedValue({ code: 'P2025' });

      const response = await app.inject({
        method: 'DELETE',
        url: `/profiles/${testUserId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe('Profile not found');
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      vi.spyOn(app.db.userProfile, 'findUnique').mockRejectedValue(new Error('Database connection failed'));

      const response = await app.inject({
        method: 'GET',
        url: `/profiles/${testUserId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json().error).toBe('Internal server error');
    });

    it('should log errors for monitoring', async () => {
      const logSpy = vi.spyOn(app.log, 'error');
      vi.spyOn(app.db.userProfile, 'findUnique').mockRejectedValue(new Error('Test error'));

      await app.inject({
        method: 'GET',
        url: `/profiles/${testUserId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(logSpy).toHaveBeenCalledWith('Profile fetch error:', expect.any(Error));
    });
  });

  describe('Real-time Notifications', () => {
    it('should emit real-time notifications on profile creation', async () => {
      const mockProfile = { id: 'new-id', user_id: testUserId };
      const emitSpy = vi.fn();

      vi.spyOn(app.db.userProfile, 'findUnique').mockResolvedValue(null);
      vi.spyOn(app.db.userProfile, 'create').mockResolvedValue(mockProfile as any);
      vi.spyOn(app.io, 'to').mockReturnValue({ emit: emitSpy } as any);

      await app.inject({
        method: 'POST',
        url: '/profiles',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: { display_name: 'Test' },
      });

      expect(emitSpy).toHaveBeenCalledWith('profileCreated', { profile: mockProfile });
    });

    it('should emit real-time notifications on profile updates', async () => {
      const mockProfile = { id: 'profile-id', user_id: testUserId };
      const emitSpy = vi.fn();

      vi.spyOn(app.redis, 'incr').mockResolvedValue(1);
      vi.spyOn(app.redis, 'expire').mockResolvedValue(1);
      vi.spyOn(app.db.userProfile, 'update').mockResolvedValue(mockProfile as any);
      vi.spyOn(app.io, 'to').mockReturnValue({ emit: emitSpy } as any);

      await app.inject({
        method: 'PUT',
        url: `/profiles/${testUserId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: { display_name: 'Updated' },
      });

      expect(emitSpy).toHaveBeenCalledWith('profileUpdated', { profile: mockProfile });
    });
  });
});