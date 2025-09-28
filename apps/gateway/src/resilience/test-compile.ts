// Simple test to validate resilience module compilation
import { createResilienceOrchestrator, createServiceProfile, DEFAULT_RESILIENCE_CONFIG } from './index.js';

// This file validates that all resilience components compile correctly
console.log('Resilience module compilation test passed');
console.log('Available exports:', {
  createResilienceOrchestrator: typeof createResilienceOrchestrator,
  createServiceProfile: typeof createServiceProfile,
  DEFAULT_RESILIENCE_CONFIG: typeof DEFAULT_RESILIENCE_CONFIG
});