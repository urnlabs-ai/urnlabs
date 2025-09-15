import { describe, test, expect } from 'vitest'
import { AgentManager } from '..'

describe('ai-agents smoke', () => {
  test('AgentManager can instantiate', () => {
    const mgr = new AgentManager()
    expect(mgr).toBeTruthy()
  })
})

