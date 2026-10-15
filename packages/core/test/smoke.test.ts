import { expect, test } from 'vitest';
import { PACKAGE_NAME } from '../src/index';

test('core 패키지를 불러온다', () => {
  expect(PACKAGE_NAME).toBe('@yangsik/core');
});
