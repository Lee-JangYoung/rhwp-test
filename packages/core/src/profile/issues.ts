/** 프로필 점검 결과 항목. LLM이 읽고 스스로 고칠 수 있도록 구조화한다. */
export interface Issue {
  code: IssueCode;
  severity: 'error' | 'warning';
  /** 프로필 안의 위치, 예: bindings[1].do[0].map */
  path: string;
  /** 프로필 파일의 줄 번호(1부터). 텍스트에서 읽었을 때만 */
  line?: number;
  /** 해당 바인딩의 id (있을 때) */
  id?: string;
  message: string;
  expected?: unknown;
  actual?: unknown;
  /** 비슷한 값(양식에서 찾은 라벨·표·누름틀, 허용 키·값 등), 가까운 순 */
  candidates?: string[];
}

/** 오류 코드와 고치는 법. 가이드(`getProfileGuide('errors')`)가 이 표에서 생성된다. */
export const ISSUE_CODES = {
  'yaml-syntax': {
    summary: 'YAML 문법 오류',
    fix: '들여쓰기·따옴표·콜론 뒤 공백을 확인한다. `{id} {name}`처럼 중괄호로 시작하는 값은 따옴표로 감싼다.',
  },
  'unknown-key': {
    summary: '알 수 없는 키',
    fix: '후보(candidates) 중 맞는 키로 고친다. 형식에 없는 키는 쓸 수 없다.',
  },
  'missing-key': {
    summary: '필수 키 누락',
    fix: '해당 위치에 필수 키를 추가한다. 필수 키는 가이드의 kind별 키 표에서 확인한다.',
  },
  'invalid-type': { summary: '값의 종류가 다름', fix: '기대한 종류(문자열·숫자·목록·객체)로 고친다.' },
  'invalid-value': { summary: '허용되지 않는 값', fix: '후보(candidates) 중 하나로 고친다.' },
  'unknown-kind': { summary: '등록되지 않은 kind', fix: '`describeKinds()`가 알려 주는 kind만 쓴다.' },
  'kind-not-supported': {
    summary: '정의만 되어 아직 지원하지 않는 kind·위치 지정',
    fix: '지원하는 kind(`describeKinds()`)로 표현하거나, 검증이 끝나 활성화될 때까지 쓰지 않는다.',
  },
  'field-not-found': {
    summary: '양식에 없는 누름틀 이름',
    fix: '양식 분석(`analyzeTemplate`)의 fields에 있는 이름만 쓴다.',
  },
  'table-not-found': {
    summary: '양식에서 위치 지정에 맞는 표가 없음',
    fix: '양식 분석의 표 목록(labels, header)을 보고 위치 지정을 고친다.',
  },
  'table-ambiguous': {
    summary: '위치 지정에 맞는 표가 여러 개',
    fix: '더 구체적인 위치 지정(다른 label·headerLabel·index)을 쓴다.',
  },
  'slot-ambiguous': {
    summary: '같은 영역의 같은 종류 슬롯이 여러 개인데 일부가 선택(optional)',
    fix: '슬롯마다 under(하위 제목)로 영역을 나누거나, 모두 필수로 한다. 선택 슬롯이 없으면 뒤 슬롯이 앞 슬롯의 표·목록으로 잘못 읽힌다.',
  },
  'target-removed': {
    summary: '앞선 remove가 지울 수 있는 표·라벨을 뒤에서 씀',
    fix: '그 표·라벨을 쓰는 바인딩(cells·rows 등)을 remove보다 앞에 둔다.',
  },
  'label-ambiguous': {
    summary: '표 안에 같은 라벨·머리글이 여러 개',
    fix: '양식에서 라벨·머리글을 서로 다른 텍스트로 만들거나, 해당 라벨을 매핑하지 않는다.',
  },
  'merged-cell': {
    summary: '견본 행의 병합 셀 때문에 행 복제로 채울 수 없음',
    fix: '견본 행에 세로 병합 셀이 없도록 양식을 고친다.',
  },
  'token-not-found': {
    summary: '양식에 없는 치환 토큰({{이름}})',
    fix: '양식 분석의 tokens에 있는 이름만 쓴다.',
  },
  'paragraph-not-found': {
    summary: '양식에 없는 문단',
    fix: '양식 분석의 paragraphs에 있는 문단 텍스트(표식)를 그대로 쓴다.',
  },
  'yaml-ambiguous-key': {
    summary: 'YAML이 문자열이 아닌 값(null·true·숫자)으로 읽는 키',
    fix: "양식 라벨이 NULL·Yes·No·숫자처럼 보이면 따옴표로 감싼다(예: 'NULL': '{NULL}').",
  },
  'range-invalid': {
    summary: 'range(표 묶음)의 시작·끝이 맞지 않음',
    fix: '시작 표가 끝 표보다 앞에 오도록 하고, 둘 다 같은 문맥(바깥 repeat 단위) 안의 표로 지정한다.',
  },
  'locator-required': { summary: '양식 위치 지정이 필요함', fix: '`in`으로 표를 지정하거나, repeat의 do 안에서 쓴다.' },
  'label-not-found': {
    summary: '표에 없는 라벨',
    fix: '표의 라벨 열(labels)에 있는 텍스트를 그대로 쓴다. 공백·철자까지 같아야 한다.',
  },
  'path-unknown': {
    summary: 'md 데이터 경로를 찾을 수 없음',
    fix: '`md` 절에서 선언한 컬렉션·슬롯·캡처 이름만 쓴다. 후보를 확인한다.',
  },
  'collection-unknown': { summary: '선언하지 않은 컬렉션', fix: '`md.collections`에 선언한 이름을 `over`에 쓴다.' },
  'slot-type-mismatch': {
    summary: '슬롯 종류가 이 용도와 맞지 않음',
    fix: '용도에 맞는 슬롯(예: diagrams는 code 슬롯)을 가리킨다.',
  },
  'slot-unused': {
    summary: 'md에서 읽지만 어디에도 쓰이지 않는 슬롯',
    fix: '의도한 것이면 둔다. 아니면 바인딩에 연결하거나 슬롯을 지운다.',
  },
  'label-unmapped': {
    summary: '양식 라벨이 매핑되지 않음',
    fix: '값을 넣어야 하면 map에 추가한다. 비워도 되면 둔다(unmappedValue에 따라 비워진다).',
  },
  'file-not-found': {
    summary: '프로필이 가리키는 파일이 없음',
    fix: 'template·schema 경로(프로필 폴더 기준 상대 경로)를 확인한다.',
  },
  'name-conflict': {
    summary: '같은 컬렉션 안에서 캡처·슬롯·하위 컬렉션 이름이 겹침',
    fix: '이름이 서로 다르게 고친다(제목 패턴의 {이름}, 슬롯 key, children 이름).',
  },
  'collection-empty': {
    summary: '반복할 항목이 없음(변환 중 확인)',
    fix: 'md에 항목을 추가하거나, 없어도 되면 repeat의 onEmpty를 keep으로 한다.',
  },
  'renderer-missing': {
    summary: '다이어그램 렌더러가 없음(변환 중 확인)',
    fix: '렌더러를 연결하거나 policy.onMissingRenderer를 warn/ignore로 한다.',
  },
  'schema-required-unmapped': {
    summary: 'md 규약의 필수 항목이 양식에 채워지지 않을 수 있음',
    fix: "cells.map에 해당 라벨을 추가하거나 '*'를 쓰고, 양식의 라벨에 있는지 확인한다.",
  },
  'binding-empty': { summary: '바인딩이 하는 일이 없음', fix: 'map·columns 등 동작 내용을 채운다.' },
} as const;

export type IssueCode = keyof typeof ISSUE_CODES;

/** 가까운 순 후보. 편집 거리(레벤슈타인)로 정렬한다. */
export function closest(target: string, options: readonly string[], limit = 5): string[] {
  const dist = (a: string, b: string): number => {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[a.length][b.length];
  };
  const t = target.trim().toLowerCase();
  return [...new Set(options)]
    .map((o) => ({ o, d: dist(t, o.trim().toLowerCase()) }))
    .sort((x, y) => x.d - y.d || x.o.localeCompare(y.o))
    .slice(0, limit)
    .map((x) => x.o);
}
