# 한컴 확인 키트 (S-23)

한컴오피스에서 열어 보고 결과를 `RESULT.md`에 적는 키트입니다. 점검 항목은 [CHECKLIST.md](CHECKLIST.md).

- `files/` — 변환 산출물 7개와 같은 이름의 HWP 5.0(`.hwp`) 7개 (이 저장소의 합성 양식으로 만든 것. 개인정보 없음)
- `source-templates/` — 변환에 쓴 양식 원본
- `MANIFEST.json` — 파일별 SHA-256, rhwp 쪽수, 자체 검증 결과
- 기준 화면(rhwp가 그린 쪽별 SVG)은 용량 때문에 저장소에 두지 않습니다. 저장소를 받은 뒤 `pnpm install && pnpm --filter @yangsik/core kit:hancom`으로 `out/hancom-kit/rhwp-preview/`에 다시 만들 수 있습니다(산출물은 같은 입력에서 재생성됩니다).
- 결과는 `_spec/06-quality/verification-spike.md`의 S-23 행에 옮깁니다(단일 출처).
