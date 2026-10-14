# 중간표현(IR)

Markdown AST(mdast)를 변환기에 필요한 최소 구조로 단순화한 것이다. rhwp 개념(구역, 문단 인덱스 등)을 **포함하지 않는다**. 위치 계산은 어댑터의 책임이다.

## 문서

```ts
interface Doc {
  meta: Record<string, string | string[]>;   // front-matter
  blocks: Block[];
  assets: Asset[];                           // 이미지, 렌더된 다이어그램
}
```

## 블록

```ts
type Block =
  | { t: 'heading'; level: 1|2|3|4|5|6; inlines: Inline[] }
  | { t: 'paragraph'; inlines: Inline[] }
  | { t: 'list'; ordered: boolean; start?: number; items: ListItem[] }
  | { t: 'table'; align: ('left'|'center'|'right'|null)[]; header: Inline[][]; rows: Inline[][][] }
  | { t: 'image'; assetId: string; alt?: string; width?: Length; caption?: Inline[] }
  | { t: 'code'; lang?: string; text: string }
  | { t: 'quote'; blocks: Block[] }
  | { t: 'math'; tex: string }
  | { t: 'diagram'; kind: 'mermaid' | string; source: string; assetId?: string }
  | { t: 'pagebreak' }
  | { t: 'toc' };

interface ListItem { blocks: Block[]; checked?: boolean }
```

## 인라인

```ts
type Inline =
  | { t: 'text'; text: string; marks?: Mark[] }       // marks: bold | italic | strike | code
  | { t: 'link'; href: string; inlines: Inline[] }
  | { t: 'footnote'; id: string; blocks: Block[] }    // 참조 위치에 정의를 인라인
  | { t: 'break' };

type Mark = 'bold' | 'italic' | 'strike' | 'code' | 'sup' | 'sub';
```

## 에셋

```ts
interface Asset {
  id: string;
  kind: 'image' | 'diagram';
  ext: 'png' | 'jpg' | 'gif' | 'bmp' | 'svg';   // rhwp 삽입 지원 확장자는 스파이크로 확정 [검증 필요]
  bytes: Uint8Array;
  widthPx: number;
  heightPx: number;
}
```

## 규칙
- 지시 문법: `<!-- hwp:pagebreak -->`, `<!-- hwp:toc -->` 같은 HTML 주석을 `pagebreak`/`toc` 블록으로 변환한다(style-map-spec 참고).
- 다이어그램은 코드펜스 언어가 `mermaid`이면 `diagram` 블록이 된다. 렌더 후 `assetId`가 채워진다.
- IR은 JSON 직렬화 가능해야 한다(스냅샷 테스트, 디버깅 용도).
