import { describe, expect, it } from 'vitest';
import * as api from '../src/index';

describe('공개 API', () => {
  it('hwp는 합의한 범위만 노출한다', () => {
    expect(Object.keys(api).sort()).toEqual(
      ['ProfileError', 'ValidationError', 'convertBytes', 'previewMapping', 'testProfile'].sort(),
    );
  });
});
