# Wording

## How this document stands

- This is the guide to the Korean the console shows: the principle a sentence follows and the one Korean
  word each console concept is written as.
- It is kept by hand. A worker writing or changing UI text reads it, follows it, and adds a line when a
  concept first needs its word. No test reads it.
- The words themselves stand in `client/apps/web/i18n/locales/ko.yaml`; this guide says which word is
  chosen and how the sentence is written. A change to a word in the guide and a change to the pack that
  shows it are made together.

## The principle

- A Korean sentence uses the word people most commonly say for the thing, whatever its origin: a
  Sino-Korean word, a loanword in its usual Hangul spelling, or a native word, whichever is the one
  in everyday use.
  - Right: 위치, 질문, 단어, 이유, 툴바, 빌트인, 편집, 수정.
  - Wrong: a native word or coinage put in place of the common one — "자리" for 위치, "물음" for
    질문, "낱말" for 단어, "까닭" for 이유, "도구 띠" for 툴바, "붙박이" for 빌트인, "손대기" for 편집.
- A native word is written where it is the one people say — 파일을 열어, 줄을 바꿔 — and never
  because it is native. Plain writing is about how sentences read; it is not a preference for native
  words.
- The English documents a writer reads are written in English idiom, not in terms: a thing
  "stands" somewhere, holds "a place", is reached by "a road", leaves "a strand". A Korean text
  renders the meaning in the common Korean word, never the English word's native Korean twin.
  - A place is 위치, a queue's 순서 or a pool's 슬롯; to stand somewhere is 있다 or 표시되다; a
    road is 경로 or 방법; a strand is one 건 of a list.
- English is not dropped into the middle of a Korean sentence.
  - Right: "툴바를 눌러". Wrong: "toolbar를 눌러".
- English stays English only where no Hangul spelling is in common use:
  - Code identifiers, commands, file and path names — `max_tokens`, `bun run test`, `WORDING.md`.
  - Names of products, libraries and protocols — Nuxt UI, SSE, herdr.
- **A job is Job or 작업 in Korean text, never 잡.** This is the owner's own choice of the word.
  - Job where the text names this system's unit of work — Job #123, Job 워커, Job 보고, 다음
    Job, 실행 중인 Job — and wherever 작업 would read as the TODO item (항목) or as a work order
    (작업 지시서). A particle follows it as it followed 잡: Job이, Job을, Job은, Job으로.
  - 작업 where the text means the work itself rather than the unit that runs it.
- **A value is shown in words, never as JSON.** No label, cell, chip or row holds a JSON object or array as
  text: a list stands as its rows, an object as its named fields in this guide's words, a moment as a moment, a
  yes or no as a state word (켜짐/꺼짐, 예/아니요), and a long body in a block of its own with highlighting. A code the
  console has no words for stands as a sentence naming the code — "알 수 없는 코드 `unknown-thing`" — and never as
  the code's JSON.
- A concept not yet in the glossary is written by the principle above, and the glossary gains its word
  when it is first needed.

## Console text

- The web console, its language pack and every message a control route hands it to show are
  written by this glossary as well as by the principle above.
- Each line is `<English concept> → <the Korean UI word>`, with the forms it takes and the forms it
  replaces. The word stands in every inflection: where the glossary says 삭제, a past tense is
  삭제했습니다 and a failure 삭제하지 못했습니다.
- delete → 삭제: 삭제, 삭제했습니다, 삭제하지 못했습니다, 삭제된, 삭제할까요. Never 지우다, 지우기, 지운,
  지워진, 지움; taking one entry out of a list is 삭제 or 제거, never 빼기.
- retire, take down → 보관; bringing one back → 복원. Switching a piece in or out of use → 켜기, 끄기.
  Never 내리기, 올리기.
- fold (a work order) → 종료. 접기 is only ever a panel folding away, and is written as below.
- file, stand up (an item) → 만들기: 항목 만들기, 만든 항목, 만들지 못했습니다. Never 세우기, 올리기.
- ask (a job's question) → 질문, 질문하다: Job의 질문. Never 물다, 물어본 것, 묻기.
- machine → 기기: 이 기기, 기기 여유. Never 기계.
- render → 렌더링: 렌더링하지 않는 기간. Never 그리다.
- message, words → 메시지: 메시지를 보내다, 보낼 메시지. A conversation is 대화, an instruction added
  to an item is 지시. Never 말, 할 말, 이야기, 말을 걸다.
- filter, sift → 필터. Never 거르기.
- page → 페이지. Never 쪽.
- table → 테이블; row → 행; query → 쿼리, wherever the text is about a database. Never 표, 줄, 질의.
- default → 기본값. Never 처음 값.
- section → 섹션. Never 구역.
- health check → 헬스 체크; the one run before anything changes → 사전 헬스 체크. Never 생존 확인.
- rollback → 롤백. Never 되돌림.
- template → 템플릿; coverage → 커버리지; cap → 상한; cooldown → 쿨다운. Never 틀, 덮음, 천장, 휴식.
- output tokens → 출력; context window → 컨텍스트. Never 답, 창.
- brain (what a turn read from the agent's memory store) → 브레인. Never 기억 저장소, 두뇌, 읽은 문서.
- an item's request in its own words → 요청 원문; the talk with the chat agent about an item → 의논. Never 대화 for
  either, which is a room's conversation.
- collapse, expand a panel → 닫기, 열기; collapse, expand in place → 축소, 확장. Never 접기, 펴기, 펼치기.
- reach a limit → 도달; a match → 일치, 해당; tied to → 연결된. Never 걸리다, 걸린 곳.
- reach a service → 연결되다: 봇에 연결되지 않아. Never 닿다.
- request → 요청하다. Never 청하다.
- choose, pick → 선택: 선택해 주세요, 선택 취소. Never 고르기, 골라 주세요, 물리기.
- enter text → 입력: 입력해 주세요, {n}자 이내로 입력. Never 적어 주세요.
- launch, start a run → 실행. Never 띄우다, 뜨다, 발사.
- stop a run → 중지; pause and resume a timer → 정지, 재개; run out of time → 시간 초과. Never 멈추기,
  다시 흐르게, 때를 놓침.
- leave the queue → 대기열에서 제외. Never 대기열에서 빠지다.
- set by hand → 수동 지정. Never 손으로 정함.
- **One screen speaks in one style.** A notice, a guidance line and an error end in 합니다 and
  했습니다 throughout; 어요 is never mixed into them.
- **No dash between words.** A range is written `{min}~{max}`; a caveat on a title stands on its
  own smaller line, or after a ` · `.
