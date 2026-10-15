import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { HwpDocument, initSync } from '@rhwp/core';
import { createRhwpEngine } from '../engine/rhwp';

let ready = false;

/** WASM을 한 번만 초기화한다 (Node: initSync). */
export function ensureRhwp(): void {
  if (ready) return;
  const g = globalThis as Record<string, unknown>;
  // README는 호스트의 폭 측정 함수를 요구한다. 근사값을 둔다(실제 호출 여부는 S-11로 확인 중).
  g.measureTextWidth ??= (_font: string, text: string) =>
    [...text].reduce((w, c) => w + (c.charCodeAt(0) > 0x2000 ? 14 : 7), 0);
  const wasm = createRequire(import.meta.url).resolve('@rhwp/core/rhwp_bg.wasm');
  initSync({ module: readFileSync(wasm) });
  ready = true;
}

/** 번들 템플릿 기반 빈 문서 (양식을 만드는 스크립트용). */
export function createBlankDoc(): HwpDocument {
  ensureRhwp();
  const d = HwpDocument.createEmpty();
  d.createBlankDocument();
  return d;
}

export const rhwpEngine = createRhwpEngine(ensureRhwp);
