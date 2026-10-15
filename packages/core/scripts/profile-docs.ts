import { getProfileGuide } from '../src/index';

/** 레퍼런스 문서 본문. 가이드와 같은 생성기를 쓰므로 구현과 어긋나지 않는다. */
export function profileReferenceMarkdown(): string {
  const g = (t: Parameters<typeof getProfileGuide>[0]) => getProfileGuide(t).markdown;
  return `# 프로필 파일 레퍼런스 (v1)

> 이 문서는 \`packages/core\`의 가이드 생성기에서 **자동 생성**한다(\`pnpm --filter @yangsik/core gen:docs\`). 직접 고치지 않는다. 설계 배경은 [doctype-profile.md](doctype-profile.md).

${g('minimal')}

${g('keys')}

${g('kinds')}

${g('locators')}

${g('paths')}

${g('errors')}
`;
}
