/* global afterAll, beforeAll, expect, test */
import { throwIfWorkflowNotFoundOrForbidden, start, end } from '../src/database'

beforeAll(start)
afterAll(end)

test('5. throwIfWorkflowNotFoundOrForbidden() with missing ID gives NotFound', async () => {
  await expect(throwIfWorkflowNotFoundOrForbidden(5, '')).rejects.toThrow('NotFound')
})

test('6. throwIfWorkflowNotFoundOrForbidden() with wrong secretId gives Forbidden', async () => {
  await expect(throwIfWorkflowNotFoundOrForbidden(6, 'wrong-secret')).rejects.toThrow('Forbidden')
})

test('7. throwIfWorkflowNotFoundOrForbidden() with good secretId gives name', async () => {
  await throwIfWorkflowNotFoundOrForbidden(7, 'good-secret')
})

test('8. throwIfWorkflowNotFoundOrForbidden() with empty secretId gives name', async () => {
  await throwIfWorkflowNotFoundOrForbidden(8, '')
})
