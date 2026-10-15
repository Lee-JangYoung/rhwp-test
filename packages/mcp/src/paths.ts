import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';

/** 허용 폴더 밖의 경로를 막는다(경로 탈출·심볼릭 링크 포함). 상대 경로는 첫 허용 폴더 기준. */
export class PathGuard {
  readonly roots: string[];

  constructor(roots: string[]) {
    if (roots.length === 0) throw new Error('허용 폴더가 없음');
    this.roots = roots.map((r) => realpathSync(resolve(r)));
  }

  /** 읽을 파일/폴더: 존재해야 하고 허용 폴더 안이어야 한다 */
  read(p: string): string {
    const abs = isAbsolute(p) ? p : resolve(this.roots[0], p);
    if (!existsSync(abs)) throw new Error(`파일이 없음: ${p}`);
    return this.within(realpathSync(abs), p);
  }

  /** 쓸 파일: 가장 가까운 기존 상위 폴더가 허용 폴더 안이어야 한다 */
  write(p: string): string {
    const abs = isAbsolute(p) ? p : resolve(this.roots[0], p);
    let up = dirname(abs);
    while (!existsSync(up) && dirname(up) !== up) up = dirname(up);
    this.within(realpathSync(up), p);
    return abs;
  }

  private within(real: string, original: string): string {
    if (!this.roots.some((r) => real === r || real.startsWith(r + sep)))
      throw new Error(`허용 폴더 밖의 경로: ${original} (허용: ${this.roots.join(', ')})`);
    return real;
  }
}
