# 중간표현(IR)

Markdown AST를 변환에 필요한 만큼만 단순화한 구조. rhwp 개념(구역·문단 인덱스)은 넣지 않는다 — 위치 계산은 어댑터 몫. JSON 직렬화 가능해야 한다(스냅샷 테스트용).

```ts
interface Doc { meta: Record<string, string | string[]>; blocks: Block[]; assets: Asset[] }

type Block =
  | { t: 'heading'; level: 1|2|3|4|5|6; inlines: Inline[] }
  | { t: 'paragraph'; inlines: Inline[] }
  | { t: 'list'; ordered: boolean; items: { blocks: Block[] }[] }
  | { t: 'table'; align: ('left'|'center'|'right'|null)[]; header: Inline[][]; rows: Inline[][][] }
  | { t: 'image'; assetId: string; alt?: string; caption?: Inline[] }
  | { t: 'code'; lang?: string; text: string }
  | { t: 'quote'; blocks: Block[] }
  | { t: 'math'; tex: string }
  | { t: 'diagram'; kind: string; source: string; assetId?: string }
  | { t: 'pagebreak' } | { t: 'toc' };

type Inline =
  | { t: 'text'; text: string; marks?: ('bold'|'italic'|'strike'|'code')[] }
  | { t: 'link'; href: string; inlines: Inline[] }
  | { t: 'footnote'; blocks: Block[] };

interface Asset { id: string; ext: 'png'|'jpg'|'gif'|'bmp'|'svg'; bytes: Uint8Array; widthPx: number; heightPx: number }
```

- 지원 이미지 확장자는 스파이크로 확정한다 [검증 필요 S-04].
- ```` ```mermaid ```` 코드펜스는 `diagram` 블록이 되고 렌더 후 `assetId`가 채워진다.
- `<!-- hwp:pagebreak -->`, `<!-- hwp:toc -->` 주석은 해당 블록으로 변환한다.
