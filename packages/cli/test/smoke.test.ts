import { expect, test } from 'vitest';
import { CORE_DEPENDENCY, PACKAGE_NAME } from '../src/index';

test('cli가 워크스페이스의 core를 참조한다', () => {
  expect(PACKAGE_NAME).toBe('@yangsik/cli');
  expect(CORE_DEPENDENCY).toBe('@yangsik/core');
});
