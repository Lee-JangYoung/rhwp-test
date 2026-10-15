import { findChromium } from '@yangsik/core/node';
import { rhwpEngine } from '@yangsik/engine-rhwp/node';
import { EXIT, type Out } from '../util';

export async function doctor(_args: string[], out: Out): Promise<number> {
  const s = await rhwpEngine.open();
  const info = {
    rhwp: rhwpEngine.version,
    blankDocumentPages: s.pageCount(),
    styles: s.analyze().styles,
    chromium: findChromium(),
    node: process.version,
  };
  s.dispose();
  out.info(`rhwp ${info.rhwp} 로드 OK, 빈 문서 ${info.blankDocumentPages}쪽, 스타일 ${info.styles}개`);
  out.info(`Chromium: ${info.chromium ?? '없음 (Mermaid 불가: 변환 시 --no-mermaid 사용)'}`);
  out.info(`Node ${info.node}`);
  out.data(info);
  return EXIT.ok;
}
