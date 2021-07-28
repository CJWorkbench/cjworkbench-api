/* global afterAll, beforeAll, expect, test */
import { lookupAuthenticatedWorkflowName, start, end } from '../src/database'

beforeAll(start)
afterAll(end)

test('5. lookupAuthenticatedWorkflowName() with missing ID gives NotFound', async () => {
  await expect(lookupAuthenticatedWorkflowName(5, '')).rejects.toThrow('NotFound')
})

test('6. lookupAuthenticatedWorkflowName() with wrong secretId gives Forbidden', async () => {
  await expect(lookupAuthenticatedWorkflowName(6, 'wrong-secret')).rejects.toThrow('Forbidden')
})

test('7. lookupAuthenticatedWorkflowName() with good secretId gives name', async () => {
  const name = await lookupAuthenticatedWorkflowName(7, 'good-secret')
  expect(name).toEqual('Good Name')
})

test('8. lookupAuthenticatedWorkflowName() with empty secretId gives name', async () => {
  const name = await lookupAuthenticatedWorkflowName(8, '')
  expect(name).toEqual('Good Name')
})
