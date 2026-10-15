import { createRhwpEngine } from '@yangsik/engine-rhwp';
import { rhwpEngine } from '@yangsik/engine-rhwp/node';
import { expect, test } from 'vitest';

test('cli가 워크스페이스의 core와 core/node를 참조한다', () => {
  expect(typeof createRhwpEngine).toBe('function');
  expect(rhwpEngine.id).toBe('rhwp');
});
