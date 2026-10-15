import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';

const OUTSIDE = (p: string) => `허용 폴더 밖의 경로: ${p}`;

/**
 * 허용 폴더 밖의 경로를 막는다. 경로는 먼저 정규화(`..` 해소)해 문자열로 확인하고, 존재하는 부분은
 * 심볼릭 링크를 풀어 다시 확인한다. 오류 메시지는 허용 폴더의 위치나 밖 파일의 존재 여부를 알려 주지 않는다.
 */
export class PathGuard {
  readonly roots: string[];

  constructor(roots: string[]) {
    if (roots.length === 0) throw new Error('허용 폴더가 없음');
    this.roots = roots.map((r) => realpathSync(resolve(r)));
  }

  private abs(p: string): string {
    return resolve(isAbsolute(p) ? p : resolve(this.roots[0], p));
  }

  private inside(real: string): boolean {
    return this.roots.some((r) => real === r || real.startsWith(r + sep));
  }

  /** 읽을 파일/폴더: 허용 폴더 안이어야 하고(링크를 푼 뒤에도), 존재해야 한다 */
  read(p: string): string {
    const abs = this.abs(p);
    if (!this.inside(abs)) throw new Error(OUTSIDE(p));
    if (!existsSync(abs)) throw new Error(`파일이 없음: ${p}`);
    const real = realpathSync(abs);
    if (!this.inside(real)) throw new Error(OUTSIDE(p));
    return real;
  }

  /**
   * 쓸 파일: 정규화한 경로가 허용 폴더 안이어야 한다. 기존 파일이 심볼릭 링크(끊어진 링크 포함)면 링크 대상도
   * 허용 폴더 안이어야 하고, 가장 가까운 기존 상위 폴더도 링크를 푼 뒤 허용 폴더 안이어야 한다.
   * `extensions`를 주면 그 확장자만 허용한다(승인된 양식·프로필을 덮어쓰지 못하게).
   */
  write(p: string, extensions?: string[]): string {
    const abs = this.abs(p);
    if (!this.inside(abs)) throw new Error(OUTSIDE(p));
    if (extensions && !extensions.some((e) => abs.toLowerCase().endsWith(e)))
      throw new Error(`저장 확장자는 ${extensions.join(', ')}만 허용: ${p}`);
    let up = dirname(abs);
    while (!existsSync(up) && dirname(up) !== up) up = dirname(up);
    if (!this.inside(realpathSync(up))) throw new Error(OUTSIDE(p));
    let isLink = false;
    try {
      isLink = lstatSync(abs).isSymbolicLink();
    } catch {
      /* 아직 없음 */
    }
    if (isLink) {
      if (!existsSync(abs) || !this.inside(realpathSync(abs))) throw new Error(OUTSIDE(p));
    }
    return abs;
  }
}
