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
- edit a message → 수정: 수정, 수정됨, 수정했습니다, 수정하지 못했습니다. A message's words are 수정 and never
  편집, which stays for a setting's or an instruction's text where this guide already says so.
- react, reaction → 반응: 반응, 반응을 남겼습니다, 반응을 뺐습니다, 반응하지 못했습니다. Never 이모지 달기,
  응답, 리액션.
- pin a message → 고정, unpin → 고정 해제: 고정됨, 고정했습니다, 고정하지 못했습니다. Never 올리기, 내리기,
  박아 두기.
- sticker → 스티커: 스티커, 스티커 보내기, 스티커를 보내지 못했습니다. Never 씰, 붙임, 이모지 그림.
- forward a message → 전달: 전달, 전달됨, 전달했습니다, 전달하지 못했습니다, 전달할 방. Never 포워딩, 넘기기,
  옮기기 — 옮기기 is moving a message's place, which this console does not do.
- mention → 멘션: 멘션, 멘션 후보, 멘션할 이름. Never 호출, 부르기, 지칭.
- an agent's role, which gives its function bundles → 역할: 역할, 역할 추가, 역할 프롬프트, 종류 기본. A co-work role a
  work key names (`role:`) is 역할 too; where it stands on a screen beside the agent role it is told apart as 작업 키
  역할, and the agent role keeps the bare word. A function bundle → 기능 묶음; how many of a role's runs go at once → 동시
  실행, with what goes and waits as `2/3 실행 · 1 대기` and no agent switched on as 막힘.
- the screen where the roles, the agents, the repositories and the models are kept → 에이전시. Its tabs → 역할,
  에이전트, 저장소, 등록 모델, 모델 파일. Never 에이전트 관리 for the screen.
- one seat of a role, on one road → 에이전트: 에이전트, 에이전트 추가, 에이전트 없음. An agent that names no road →
  요청한 감독관을 따름; what it lays over its role's preset → 역할 위에 덮어쓰기; one that carries a run → 실행 중. Never
  자리, 인스턴스, 워커 for the seat.
- supervisor → 감독관: 감독관, 감독관 추가, 감독관의 설정, 감독관 없음, 감독관 중단. Every agent that answers in rooms
  is a supervisor, and every sentence names it 감독관 alone; a screen never calls one 채팅 에이전트 or by a word for a
  partner in a chat.
- the supervisor that answers every room naming none → 기본 응답 감독관; the supervisor a search or browse run no
  supervisor delegated writes its brain for → 리서치 감독관; the supervisor a group room is added with, one of the
  person adding it owns or 감독관 없음 → 그룹 감독관.
- a role's slot, one of the runs its agents let in at once → 역할 슬롯, 슬롯: 역할 슬롯, 작업 중, 예약됨, 비어 있음. Never
  자리, 칸, 풀.
- a repository the agency runs jobs in → 저장소: 저장소, 저장소 추가. Never 리포지토리, 레포, 워커 for the place.
- a supervisor's provider order → 공급자 순서: 공급자 순서, 공급자 추가; the share of a provider's quota at
  which it is passed over → 할당량 기준; a session's compaction threshold → 압축 기준; keeping a prefix warm → 캐시 유지;
  a role's sessions kept or opened anew → 유지, 새로. Never 라우트, 라우팅, 우선순위 목록.
- a repository, where executing work runs → 저장소: 저장소, 저장소 추가, 작업 저장소; the model a repository pins →
  고정 모델; no pin → 역할 에이전트. A deployment's own model → 등록 모델; a file its engine serves → 모델 파일.
- a supervisor's active provider, what it runs on now, and the road a role's next run goes out on → 지금; the owner forcing one → 강제 지정; no force,
  leaving it to the order → 순서에 맡김; the entry it runs on now → 사용 중. What chose a job's road → 항목 지정 (the
  item's own model), 강제 지정, 고정 모델 or 공급자 순서. Never 고정 for a force, which is a repository's pin.
- a value equal to the default a service states → `<value> (기본값)`, after the value and never in its place; a
  setting a service leaves to its own default without naming the value stands empty with `(기본값)` as its
  placeholder; a setting whose default no service states stands empty, with no word.
- a role → its name alone, the kebab-case key the agency holds it under (`worker`, `doppelganger`, `voyager`,
  `seeker`, `producer` …): never translated and never the row's label, on every screen that names one.
- a supervisor whose turn goes out on the stand-in → 대신 답하는 중.
- a round's record on its answer → 판정 기록: 판정 기록, 기록, 펼치기, 접기. The one press carrying the turn's
  brain, calls, drafts and judgement; its parts say 브레인, 툴 사용, 드래프트, 판정.
- a room's situation note → 상황: 상황, 방의 상황, 방의 상황 보기, 이 방의 지금 상황, 갱신, 상황 노트 없음. Never 현황,
  상태 노트, 컨텍스트 노트.
- the calendar → 일정 (the screen), 캘린더 (one calendar in it), 내 일정, 조직 일정; a reminder → 알림; a recurrence → 반복.
- the theater → 극장: 작품 (a title), 에피소드, 보관함 (the screen of titles), 내 극장, 조직 극장, 플레이리스트, 이어 보기,
  자막, 자막 굽기, 라이브러리 (a folder registered), 색인 and 재색인 (a scan), 업로드, 대사.
- secret, a value a unit reads by its file name → 비밀; the console's store of them → 비밀 보관함; putting a value in
  place of the one a name holds → 교체. Never 시크릿, 키 보관소.
- retire, take down → 보관; bringing one back → 복원. Switching a piece in or out of use → 켜기, 끄기.
  Never 내리기, 올리기.
- fold (a work order) → 종료. 접기 is only ever a panel folding away, and is written as below.
- file, stand up (an item) → 만들기: 항목 만들기, 만든 항목, 만들지 못했습니다. Never 세우기, 올리기.
- ask (a job's question) → 질문, 질문하다: Job의 질문. Never 물다, 물어본 것, 묻기.
- download → 다운로드: 다운로드, {name} 다운로드, 다운로드 주소. Never 내려받기. This is the owner's own choice of
  the word.
- volume → 볼륨; mute, unmute → 음소거, 음소거 해제.
- machine → 기기: 이 기기, 기기 여유. Never 기계.
- render → 렌더링: 렌더링하지 않는 기간. Never 그리다.
- message, words → 메시지: 메시지를 보내다, 보낼 메시지. A conversation is 대화, an instruction added
  to an item is 지시. Never 말, 할 말, 이야기, 말을 걸다.
- filter, sift → 필터. Never 거르기.
- page → 페이지. Never 쪽.
- table → 테이블; row → 행; query → 쿼리, wherever the text is about a database. Never 표, 줄, 질의.
- default → 기본값, standing only as the mark after the default value (above). Never 처음 값.
- section → 섹션. Never 구역.
- organisation → 조직: 조직, 같은 조직, 조직 이름. Never 단체, 기관.
- a person in the console's directory → 사람: 사람, 같은 조직의 사람. Never 사용자 for a person found by search; 사용자 stays for a login or an account.
- permission → 권한: 권한, 권한이 있습니다, 권한이 없습니다. Never 허가, 접근 권한.
- read a section → 읽기: 읽기, 읽을 수 있습니다. Never 조회 for a section's read.
- write a section → 쓰기: 쓰기, 쓸 수 있습니다. Never 편집 for a section's write.
- health check → 헬스 체크; the one run before anything changes → 사전 헬스 체크. Never 생존 확인.
- rollback → 롤백. Never 되돌림.
- template → 템플릿; coverage → 커버리지; cap → 상한; cooldown → 쿨다운. Never 틀, 덮음, 천장, 휴식.
- output tokens → 출력; context window → 컨텍스트. Never 답, 창.
- a model's reasoning effort → 강도; an answer's token ceiling → 답변 상한. Never 노력, 답 천장.
- the rest of a list a line leaves unshown → 외 {n}: `Claude Code 외 2`. Never 그 밖에, +{n}.
- brain (what a turn read from the agent's memory store) → 브레인. Never 기억 저장소, 두뇌, 읽은 문서.
- a room's due memories (its promise, follow-up and check memories whose time or event has come) → 이 방에서 지금
  할 약속. Never 때가 된 기억, 만기된 기억, 예정된 메모리.
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
- the research unit's words → 리서치, 분류 (a category), 대기열 (its queue), 제외 (dismissing an item), 보류 (a hold on its
  runs), 해당 (a document marked for the owner's word), 브리핑 (a brief), 보안 권고 (an advisory). Never 카테고리, 큐, 기각.
- set by hand → 수동 지정. Never 손으로 정함.
- a user's job title and contact details → 프로필: 직함, 유선 전화, 휴대전화, 이메일. Never 직책, 유선번호, 핸드폰, 메일.
- **One screen speaks in one style.** A notice, a guidance line and an error end in 합니다 and
  했습니다 throughout; 어요 is never mixed into them.
- **No dash between words.** A range is written `{min}~{max}`; a caveat on a title stands on its
  own smaller line, or after a ` · `.
