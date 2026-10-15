# 양식 등록 절차 (사람 + 도구)

새 문서 유형(양식)을 등록해 변환하는 순서. 도구는 파일을 다시 쓰지 않고, 사람이 프로필을 고친다.

1. **폴더 만들기** `templates/<유형>/` — 양식(`template.hwpx`), 예제 md(`example.md`), 필요하면 md 규약(`schema.json`).
   - 양식은 한컴에서 저장한 HWPX. 개인정보·내부 정보를 지운 사본을 쓴다. 외부 양식은 저작권 확인 전까지 저장소에 넣지 않는다.
   - 양식의 반복 단위(표 하나 또는 표 묶음)에는 **견본 하나**만 둔다. 라벨(0열)과 목록 표의 머리글은 서로 구분되는 텍스트로 둔다. 값 자리에는 안내 문구(예: `(입력)`)를 둘 수 있다.
2. **분석** `yangsik profile analyze templates/<유형>/template.hwpx` — 표별 라벨·머리글·누름틀·토큰·문단 JSON. 프로필의 위치·라벨은 이 결과의 텍스트만 쓴다.
3. **초안 작성** (둘 중 하나)
   - LLM: `yangsik profile generate --template … --example-md … --print-prompt`로 전송 내용을 확인한 뒤 `--allow-send`로 생성(키는 환경변수). 결과 `profile.yaml`·`review.md`.
   - 직접: `yangsik profile guide patterns`와 `templates/class-spec`·`db-spec`의 프로필을 참고해 작성.
4. **점검·드라이런** `yangsik profile check templates/<유형>/profile.yaml` → 오류(`code`·`path`·`후보`)를 고친다. 통과하면 `yangsik profile test templates/<유형>/profile.yaml`로 예제 md를 변환해 매핑 대조표와 자체 검증을 본다.
5. **사람의 확인** 변환 결과를 `--preview`의 쪽별 SVG와 한컴에서 열어 확인한다(키트: [hancom-kit](../06-quality/hancom-kit/README.md)). 결과 모양이 다르면 프로필의 `output`·`policy`와 양식(표 높이·쪽 나눔)을 조정한다.
6. **커밋** 양식·예제·프로필(·규약)을 `main`에 커밋한다. 프로필이 바뀌는 규칙은 `version`으로 관리한다.

한계와 미검증: 실제 SI 양식의 병합 셀·다단 머리행, 표 사이 문단 복제는 아직 검증하지 않았다([known-limitations](../03-rhwp-reference/known-limitations.md) L-20·L-22). 그런 양식은 분석 결과를 개발자에게 보내 새 kind·위치 지정을 등록한다(ADR-0016).
