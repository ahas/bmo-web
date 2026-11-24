# Wording

## How this document stands

- This is the guide to the Korean the console shows: the principle a sentence follows and the one Korean
  word each console concept is written as.
- It is kept by hand. A worker writing or changing UI text reads it, follows it, and adds a line when a
  concept first needs its word. No test reads it.
- The words themselves stand in `client/apps/web/i18n/locales/ko.yaml`; this guide says which word is
  chosen and how the sentence is written. A change to a word in the guide and a change to the pack that
  shows it are made together.
- The console's other languages — English, Japanese and Simplified Chinese — translate the Korean key for key
  (docs/web.md, 「Wording and the language pack」); 「The other languages」 below names the one word each of them
  writes a console concept as.

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
- spoiler (hidden message text) → 스포일러: 스포일러 표시, and its block folds by the in-place pair below.
  Never 가린 글, 숨김 글.
- hand a supervisor's session over, its next turn opening a fresh session on the note it writes → 세션 넘기기: 세션
  넘기기, 넘기기, 세션 넘기기를 요청했습니다, 인수인계 메모; start it afresh → 세션 초기화: 세션 초기화, 초기화, 새 세션으로
  시작합니다. Never 핸드오프, 세션 리셋, 세션 삭제 — neither deletes anything of a room, which every sentence about them
  keeps saying (대화 기록은 그대로 남습니다).
- forward a message → 전달: 전달, 전달됨, 전달했습니다, 전달하지 못했습니다, 전달할 방. Never 포워딩, 넘기기,
  옮기기 — 옮기기 is moving a message's place, which this console does not do.
- mention → 멘션: 멘션, 멘션 후보, 멘션할 이름. Never 호출, 부르기, 지칭.
- a person who leaves the organisation, their account marked so → 탈퇴: 탈퇴, 탈퇴 처리, 탈퇴 처리할까요, (탈퇴) beside
  a name. Never 떠남, 퇴사, 삭제 — the account is kept, only its sign-in ends.
- an agent's role, which gives its function bundles → 역할: 역할, 역할 추가, 역할 프롬프트, 종류 기본. A co-work role a
  work key names (`role:`) is 역할 too; where it stands on a screen beside the agent role it is told apart as 작업 키
  역할, and the agent role keeps the bare word. A function bundle → 기능 묶음; how many of a role's runs go at once → 동시
  실행, with what goes and waits as `2/3 실행 · 1 대기` and no agent switched on as 막힘. The text a role's runs carry
  after its prompt on one provider → 공급자별 프롬프트, each box named `<provider> 프롬프트`.
- the screen where the roles, the agents, the repositories and the models are kept → 에이전시. Its tabs → 역할,
  에이전트, 저장소, 등록 모델, 모델 파일. Never 에이전트 관리 for the screen.
- one seat of a role, on one road → 에이전트: 에이전트, 에이전트 추가, 에이전트 없음. An agent that names no road, and
  the setting by which an agent or a role follows its asker while naming a road of its own →
  요청한 감독관을 따름, its choices 켬 and 끔; what it lays over its role's preset → 역할 위에 덮어쓰기; one that carries a run → 실행 중. Never
  자리, 인스턴스, 워커 for the seat. Its own prompt, which stands in place of its role's → 에이전트 프롬프트; its dialog's
  tabs → 일반, 세션, 시스템 프롬프트, 기능; what its role sets for every agent of it → 역할 설정, the way to the role's
  dialog named the same. Never 공통 설정, 상위 설정.
- an item assigned by a model and a role, taken at its launch by whichever agent of the role running the model is
  free → 빈 에이전트: `<role> 빈 에이전트` on its line, `<role> · <model>` as the choice. Never 아무 에이전트, 자동 배정.
- supervisor → 감독관: 감독관, 감독관 추가, 감독관의 설정, 감독관 없음, 감독관 중단. Every agent that answers in rooms
  is a supervisor, and every sentence names it 감독관 alone; a screen never calls one 채팅 에이전트 or by a word for a
  partner in a chat.
- the supervisor that answers every room naming none → 기본 응답 감독관; the supervisor a search or browse run no
  supervisor delegated writes its brain for → 리서치 감독관; the supervisor a group room is added with, one of the
  person adding it owns or 감독관 없음 → 그룹 감독관.
- a person's own supervisor, as it is titled → `{name}의 BMO`, the person's name with BMO, or with the name its
  profile stands with where a company or the person set one (`{name}의 Dear`); its private room → the person's name
  alone, `{name}`. The person's name stands there, the login only where none stands; never the login with BMO beside
  a name, nor 비서, 개인 감독관 or 전용 BMO. The person themselves calls it 내 BMO, and its group on 조직's 에이전트 at 나 is 내 BMO.
- the names that call a BMO in a room → 부르는 이름: 부르는 이름, 부르는 이름 없음, 추가할 이름. Never 호출 이름, 웨이크
  워드, 별칭; 호출 stays the mention's never-word.
- a company's default for its people's BMOs → 기본 BMO, the platform's → 전역 기본 BMO; who may set their own BMO → BMO
  설정 권한, each row 허용, 막음 or 상위 조직 따름 (전역 설정 따름 on a company), a following row saying 상위 조직을 따라 허용 or
  상위 조직을 따라 막음 (전역 설정을 따라 허용 or 막음 on a company); the platform's own row → 자기 BMO 설정, its choices
  기본값을 따름, 허용 and 막음. Never 개인화 권한, 커스터마이즈.
- a screen and its tools switched on and off as one → 앱; where they are switched → 앱·도구 on 조직 and 내 앱·도구 in
  설정. Its state → 켬 or 끔; a unit's choice of it → 켬, 끔 or 상위 조직 따름 (전역 설정 따름 on a company), a following
  row saying 상위 조직을 따라 켬 or 전역 설정을 따라 끔; a person's row → 직접 정함 or 조직을 따름, their own word taken
  back by 되돌리기; a unit deciding it for everyone below → 하위 조직 잠금, its undoing 잠금 해제, a row under it saying who
  locks it as every lock line does (below); the platform letting a company use one → 제공, one it does not →
  제공되지 않음; the platform's own row → 직접 정함 or 기본값을 따름 (what its publisher declared), its recall → 긴급
  회수, 긴급 회수됨 and 회수 해제; a unit taking a company's shared app off its people's PCs → 회수, its question
  `<앱> 앱을 이 조직에서 회수할까요?`; a call to an app turned off → 조직 설정으로 꺼진 앱입니다. 잠금 here is the delegation
  chain's own word.
  Never 활성화, 비활성화, 사용 설정, 차단. 애플리케이션 stays the sidebar section's word.
- a tool of a person's own, which their BMO makes on their PC → 개인 앱: 개인 앱, 내 개인 앱 (its settings section),
  개인 앱 없음; one placed build of it → 버전, when it was put → `{time} 업데이트`; going to the one before → 이전 버전으로,
  its question 이전 버전으로 되돌릴까요?; what it may reach → `자기 데이터만 사용`, `네트워크 사용 {addresses}`, `비밀 사용
  {names}`, each said under it — 적어 둔 주소에만 접속하고, 다른 곳에는 접속할 수 없습니다; 실행할 때만 내 비밀 보관함에서 값을
  받고, 값은 BMO에게 보이지 않습니다 — and what keeps it from running → `비밀 보관함에 없음 {names}`, 조직 설정으로 네트워크를 쓸
  수 없어 이 앱은 실행되지 않습니다, 조직 설정으로 비밀을 쓸 수 없어 이 앱은 실행되지 않습니다. Never 나만의 앱, 커스텀 도구,
  롤백, 복원, 인터넷 권한.
- the screens of a person's own apps, as the sidebar groups them → 내 앱; a screen of one that cannot open because the
  person's PC does not answer → `PC가 꺼져 있어 열 수 없습니다.` Never 오프라인, 연결 끊김 for it.
- the company's shelf of shared personal apps → 스토어, never 앱 카탈로그; sharing one → 공유, whom with → 공유 대상, the three scopes →
  팀, 상위 조직장, 회사 전체, and one named by hand → 직접 지정; putting a copy on one's PC → 설치 (설치됨, 조직에서 설치 where a
  head's turning on did), moving it to the newest → 업데이트, making it one's own → 복제; the owner ending a share →
  공유 중단 (공유 중단됨); a head turning it on for a unit → 조직에 켜기, off → 조직에서 끄기, taking it off every PC there →
  회수; the reviewer's text → 검토 보고서 (검토 중 while it is written); a head's consent → 승인 (승인 대기); the request to
  ship it for every company → 플랫폼 앱 요청; what it asks for → 요구 권한. Never 스토어, 마켓, 배포 for a share, 철회, 롤백.
- the platform's word on an app on 플랫폼 설정 → 전역 설정, its choices 제공 or 제공 안 함 and 켬 or 끔; the platform's word for
  one company or unit → 회사별 제공; a row's line → 모든 회사에 제공 (`{n}곳 제외` after it), `{n}곳에 제공` or 제공하지
  않음, a company or a unit counted by 곳. Turning an app off everywhere at once → 긴급 회수, its question
  `<앱> 앱을 모든 곳에서 끌까요?` and its way through 회수; its state → 긴급 회수됨; its undoing → 회수 해제. Never 강제
  종료, 비상 정지, 철회.
- where a part of a BMO's profile came from → 직접 정함, 회사에서 정함; the deployment's own wears the default's mark,
  `BMO (기본값)`. How a BMO speaks and behaves, as text → 페르소나. Never 성격, 말투 설정, 프롬프트.
- a role's slot, one of the runs its agents let in at once → 역할 슬롯, 슬롯; a slot kept by a reservation → 예약, counted
  as `1 예약`. Never 자리, 칸, 풀.
- what an agent is doing now → 상태, its column's name: an agent with nothing going → 유휴; a supervisor answering in
  rooms → 답변 중; a run of a role's agent → the pack's word for the source that asked it (Job, 협업, 요청 …)
  and what it works on. Never 쉬는 중, 대기 or 비어 있음 for an idle agent: 대기 is a run waiting in its role's line.
- the whole deployment resting while the platform's Claude logins are at their limit or the service is down → 휴식:
  an agent whose road it closes → `휴식 중 · {time}까지`, or 휴식 중 alone where it names no moment; its kinds → 사용량
  한도, 공급자 장애; ending it by hand → 휴식 끝내기. The owner's chat told of a restart and of a rest → 재시작 알림, 휴식
  알림. Never 쉬는 중, 휴면 or 잠자기.
- a repository the agency runs jobs in → 저장소: 저장소, 저장소 추가. Never 리포지토리, 레포, 워커 for the place.
- a supervisor's road, the one provider and model its turns go out on → 공급자 · 모델, its fields 공급자, 모델, 강도,
  생각 and 답변 상한; a session's compaction threshold → 압축 기준; keeping a prefix warm → 캐시 유지;
  a role's sessions kept or opened anew → 유지, 새로. Never 라우트, 라우팅, 우선순위 목록.
- the second model a road's own model consults when it chooses → 어드바이저: 어드바이저, 어드바이저 모델, 어드바이저 호출;
  none chosen → 끔, the road's off word as 생각 has it, never 없음 or 사용 안 함 among its choices. Never 조언자, 자문 모델,
  상담 모델.
- a repository, where executing work runs → 저장소: 저장소, 저장소 추가, 작업 저장소; the model a repository pins →
  고정 모델; no pin → 역할 에이전트. A deployment's own model → 등록 모델; a file its engine serves → 모델 파일.
- a repository that is a folder holding other repositories' checkouts, its own tree never written by its jobs → 우산
  저장소: 우산 저장소, 우산 저장소는 추가지원 체크아웃을 두지 않습니다. Never 엄브렐러, 상위 저장소, 묶음 저장소.
- the checkouts a repository keeps beside its base for jobs to run in at once → 추가지원 체크아웃: 추가지원 체크아웃 수,
  추가지원 {n} in a row; a count the service grows itself rather than one fixed → 자동, `자동 (기본값)` among the
  choices. Never 오토, 알아서.
- the road a role's next run goes out on → 지금. What chose a job's road → 항목 지정 (the
  item's own model), 강제 지정, 고정 모델 or 공급자 순서. Never 고정 for a force, which is a repository's pin.
- a value equal to the default a service states → `<value> (기본값)`, after the value and never in its place; a
  setting a service leaves to its own default without naming the value stands empty with `(기본값)` as its
  placeholder; a setting whose default no service states stands empty, with no word.
- a role → its name alone, the kebab-case key the agency holds it under (`worker`, `scout`, `voyager`,
  `seeker`, `producer` …): never translated and never the row's label, on every screen that names one.
- a supervisor whose road cannot take a turn now → 답할 수 없음.
- a supervisor's tool limit, the capabilities its sessions may hold → 도구 제한; a capability stands by its own name
  (`program.files`), never translated. Never 도구 한도, 허용 도구 목록.
- the operating system's user a program runs as → 시스템 사용자: 소유자의 시스템 사용자. Never 계정 for it, which stays
  for a login. The folder the units keep their data under → 데이터 루트. Never 데이터 폴더, 루트 폴더.
- what an agent left waiting for a room → 진행 중: a watch → 감시, a reminder → 알림, a supervisor's background subagent →
  서브에이전트, its background shell command → 셸 명령. Never 하위 에이전트, 백그라운드 작업 or 쉘.
- the answers one turn of a round wrote, before the one it went on with → 쓴 답, each opened by 받은 말 (words handed
  over) or 작업 알림 (the program's own notice); never 판, which reads as 판정.
- a round's record on its answer → 판정 기록: 판정 기록, 기록, 펼치기, 접기. The one press carrying the turn's
  brain, calls, drafts and judgement; its parts say 브레인, 툴 사용, 드래프트, 판정.
- one of the system instructions a supervisor's message passes in order before it goes out → 지시 단계: 지시 단계,
  지시 단계 없음, 지시 단계에 추가, 지시 단계에서 제거, 단계 추가, 사용하지 않는 단계, and on a running turn `{name} 단계
  확인 중`; the settings block that holds them keeps the feature's word, 드래프트. A stage stands under its own name, a
  kebab-case key never translated; its text → 내용, put back by 기본 내용으로 되돌리기. Never 질문, 검토 단계 or 체크리스트
  for a stage.
- the fixed check before the stages of how a message addresses the people it answers → 호칭 확인, and on a running turn
  호칭 확인 중. Never 감사, 오디트 or 이름 점검.
- the check of the words that arrived while a round worked → 도착 확인, and on a running turn 도착한 메시지 확인 중. Never
  새 말 확인 or 추가 메시지 점검.
- how a turn of a round's pipeline ended, in its 드래프트 line → 답함, 보냄, 넘김, 실패, and 사유 없이 넘김 for a skip that
  named no reason and was asked once more; how the 호칭 확인 or a stage ended → 통과 where the message went on as it stood,
  수정함 where it rewrote it, 실패. The turn that took longest → 오래 걸린 턴. Never 다시 질문, 패스, 리비전 or 라운드 for a
  turn.
- the tone layer a room's supervisor takes toward the people it is not close to, one the deployment offers → 말투: 말투,
  말투 불러오는 중…, 말투를 저장하지 못했습니다, 선택할 수 없는 말투입니다; a layer stands by its own name (`bmo`), never
  translated, and none → 없음 (기본값). Never 톤, 톤 레이어 or 말투 설정, and never 페르소나, which is a BMO's own text.
- a room's situation note → 상황: 상황, 방의 상황, 방의 상황 보기, 이 방의 지금 상황, 갱신, 상황 노트 없음. Never 현황,
  상태 노트, 컨텍스트 노트.
- the calendar → 캘린더 (the screen, and one calendar in it); an event → 일정, as in 내 일정, 조직 일정; a reminder → 알림; a recurrence → 반복.
- a date picker's paging buttons → 이전 달, 다음 달 among the days; 이전 연도, 다음 연도 among the months and on the
  outer pair; 이전 연도 범위, 다음 연도 범위 among a run of years. Never 지난달, 저번 달, 전년, 다음 해, 이전 연대.
- a select's list, the same on every screen → its search field 검색; nothing matching what was typed → 찾은 항목
  없음; a list holding nothing → 항목 없음, unless the screen's own word for its list is given here; a search the
  server refused → 검색하지 못했습니다; words typed that no choice holds, offered as a new value → "{value}" 추가.
  Never 검색어 입력, 결과 없음, 데이터 없음.
- the button at the end of a field typed into that opens its list of choices, an input menu's → 목록 열기, the name
  a screen reader reads for it on every screen. Never 옵션 표시, 팝업 표시, Show popup.
- a booking of a company's resource, and the act of making one → 예약: 예약, 새 예약, 내 예약, 예약 취소, 예약을
  취소할까요, 이 예약만, 반복 예약, 예약 {n}건, 예약 없음; the person who made it → 예약자. It is the same word a role's
  slot kept by a reservation takes (above), each on its own screen. Never 예매, 대여, 부킹, 신청.
- a thing a company books, a room or anything else → 자원: 자원, 자원 추가, 자원 없음, 자원이 없습니다; its fields →
  종류, 위치 (위치 없음 where none is set), 좌석 with its count `{n}석`, 승인 필요, 담당자; the company it is booked in →
  회사, the reader's own `{name} (내 회사)`. Never 리소스, 시설, 설비, 비품, and never 유형 or 타입 for its kind.
- taking a resource out of use, which cancels its standing bookings and has no way back → 삭제: 삭제, 자원을
  삭제할까요. Never 보관, which keeps a thing to be brought back by 복원.
- the people who approve a resource's bookings → 담당자: 담당자, 담당자 {names}, 이 자원의 담당자. Never 관리자, which
  is the platform administrator's word, nor 승인자 or 책임자; and never 소속, which is what a thing belongs to (below).
- a booking that waits on a resource's 담당자 → 승인 필요 on the resource; a booking's state → 승인 대기 while it waits,
  예약됨 once it holds, 거부됨 once refused; the 담당자's acts → 승인, 거부, 승인되었습니다, 거부되었습니다, 예약을
  거부할까요, the pair the desktop app's pairing takes (below); why it was refused → 사유 (선택) as the field and
  `거부 사유: {reason}` where it is shown; the 담당자's tab of waiting bookings → 요청: 승인 대기 중인 요청이 없습니다.
  Never 허용, 거절, 반려, which stays a job review's word, nor 신청 for a booking that waits.
- the theater → 극장: 작품 (a title), 에피소드, 보관함 (the screen of titles), 내 극장, 조직 극장, 플레이리스트, 이어 보기,
  자막, 자막 굽기, 라이브러리 (a folder registered), 색인 and 재색인 (a scan), 업로드, 대사. Its player's play
  modes → 일반 모드, 영화관 모드, 전체 화면; the control between the first two names the mode a press goes to,
  영화관 모드 or 일반 모드. Never 극장 모드, 시어터 모드, 기본 보기, 넓게 보기.
- turn into (a text block's kind) → 종류 변경: 종류 변경, 종류를 변경했습니다, 변경하지 못했습니다; the kinds it
  offers stand on their own words (본문, 제목 1, 글머리 목록, 인용, 코드 블록). Never 서식 변경, 스타일, 종류로
  바꾸기. 변환 is no form of it: that word stands only where a file's format is really converted, as an mp3
  conversion's run names itself.
- a line of a to-do list in a note → 할 일: 할 일, 할 일 목록, 할 일 목록에 할 일을 추가합니다. Never 업무, which is a work of
  일정 관리, nor 작업 or 태스크.
- a code block's language that colours nothing → 일반 텍스트. Never 평문, nor 본문, which is a text block's kind.
- when a note or a database row was made → 만든 날짜, a database's column of it the same; when its words last changed →
  최근 수정, `{time} 수정`, 방금 수정됨. Never 생성 시간, 생성일, 편집됨.
- copy, paste → 복사, 붙여넣기: 복사, 복사했습니다, 클립보드에 복사했습니다, 복사하지 못했습니다; 붙여넣기, 붙여넣은,
  붙여넣을 링크를 입력해 주세요, 링크를 붙여넣거나 입력해 주세요. Never 카피, 붙이기 or 페이스트 for a paste; 붙이기
  keeps its own sense where a thing is attached rather than pasted.
- rename → 이름 변경, the act on a menu. Never 이름 바꾸기, 이름 수정, 리네임.
- undo, redo → 실행 취소, 다시 실행: 실행 취소, 다시 실행, 실행 취소로 블록 내용을 되돌릴 수 있습니다. 실행 취소 stands
  whole and is never 취소 alone, which is a dialog's way out. 다시 실행 is also a work order step's run again, each on
  its own screen. Never 되돌리기 or 언두 for undo, 다시 하기 or 재실행 for redo.
- indent, outdent a line → 들여쓰기, 내어쓰기. Never 탭, 오른쪽으로 이동, 왼쪽으로 이동, 내어 쓰기 or 내쓰기.
- align text → 정렬: the menu 정렬, its sides 왼쪽 정렬, 가운데 정렬, 오른쪽 정렬. A list's sort is 정렬 as well
  (정렬, 정렬 추가, `{name} 정렬`), each on its own control. Never 맞춤, 왼쪽 맞춤, 중앙 정렬 or 얼라인.
- the words under a picture or a block → 설명: 설명, 설명을 입력해 주세요, and a card's description the same, 설명
  수정. Never 캡션, the word the video player's line also keeps from subtitles, nor 주석.
- bring files into a note as notes → 가져오기: 가져오기, `노트 {n}개를 가져왔습니다`, 가져오지 못했습니다. Never 임포트, and
  never 불러오기, which is a screen reading what it shows.
- put a file of the reader's into a note → 업로드: 업로드, `{size}보다 작은 파일만 업로드할 수 있습니다` for a file over the
  largest the note takes. Never 올리기, 업로드 한도 or 최대 용량.
- secret, a value a unit reads by its file name → 비밀; the console's store of them, each person's own → 비밀 보관함,
  and one's own → 내 비밀; putting a value in place of the one a name holds → 교체. A unit's and the platform's stand
  on 조직's 비밀 보관함 under the same words. Never 시크릿, 키 보관소, 개인 금고.
- which console sections a unit's people use → 권한, each person's sections 읽기 and 쓰기; the list's search 이름으로 찾기,
  찾은 사람 없음, 사람 없음. Never 역할 for a section, 접근 제어.
- the shape a secret is asked in → 비밀 종류; one of its fields → 항목, its key 키 and its label 이름; fields put
  together by hand → 직접 구성; a field whose value is drawn as dots → 값 숨김; how a field is typed → 입력 (한 줄,
  여러 줄, 파일); an agent asking for a secret → 비밀 요청, and one answered → 저장됨. Never 필드, 마스킹, 템플릿.
- a payment card kept as a secret → 카드: 카드 번호, 유효기간, CVC, 소유자 이름. Never 신용카드 for the kind, 만료일,
  보안 코드, 명의자.
- where a parcel is sent → 배송지: 받는 사람, 전화번호, 우편번호, 주소, 상세 주소. Never 수령인, 수취인, 연락처 for the
  number, 상세주소.
- the secrets the agency's provider tools read, each chosen by name → 공급자 비밀: 공급자 비밀, `<provider>` 결제 카드,
  `<provider>` 로그인 for the account it signs in with, `{kind}` 종류 비밀, 없음 for none. Never 시크릿 설정, 연결된 비밀.
- what a run goes out on and what pays for it → 공급: the section, tab and pane are 공급; a policy lists its
  공급원, the five being 개인 공급, 전역 공급, 조직 크레딧, 개인 크레딧 and the end of the fall, 중단. The order
  a run falls through them is 공급 순서. Never 조달, 급전, 리소스 for the thing, and never 소스 for a member of
  the list.
- a unit's own supply, which its people's runs may take → 조직 공급 (a unit's own keys, its 조직 공급 키); organisation
  supply the platform has not opened → 제공되지 않음, the administrator's opening of it → 이 회사에 조직 공급 제공; the
  monthly cap on organisation credits → 월 상한; the platform's own keys → 플랫폼 공급 키, its record of credit movements →
  장부. What the units below may do with a setting → 하위 조직, its choice 위를 따름, 하위 조직 허용 or 하위 조직 잠금,
  the delegation chain's own words; the platform's own choice of no word → 기본값을 따름. Never 소스, 차단.
- what the people under a unit may do with personal apps → 개인 앱: 개인 앱 만들기, 네트워크 사용 요청, 비밀 사용 요청,
  공유 대상 (팀, 팀과 상위 조직장, 회사 전체), 공유 버전 승인, 공유 앱 설치; the administrator opening one for a company →
  `이 회사에 {setting} 제공`.
- where a company's archive documents are kept → 아티팩트 저장: its tab and form; the place → 저장 위치, the local place 이 서버
  and a SharePoint library SharePoint, a following unit's 위를 따라 `{place}`; SharePoint's settings 사이트 ID, 드라이브 ID, 폴더
  and 토큰 계정, an unnamed account 문서 주인. Never 스토리지, 보관소.
- the agents a person is given as their account is made ready → 가입 구성: each role 위를 따름, 막음, 에이전트 없음 or
  에이전트 `{n}`, a following role saying 플랫폼 규칙을 따름, 위를 따라 막음 or 위를 따라 에이전트 `{n}`. Never 초기 설정,
  온보딩.
- the platform itself as a node of the organisation tree, above every company → 플랫폼 전체; a tab with nothing set
  there → 이 탭에는 플랫폼 설정이 없습니다. Never 전체 플랫폼, 시스템 전체. The reader's own link as a node of the same
  tree → 나; a tab with nothing set there → 이 탭에는 개인 설정이 없습니다. Never 내 설정, 본인.
- the sidebar's section of what the heads of the organisations set → 조직, its entries the organisation screen's tab
  names; the tab of every setting about the agents of a unit's people → 에이전트. Never 조직 관리, 조직 설정 for the
  section.
- the organisation's instructions every agent of its people follows → 조직 지침, a unit's own text → 지침, none → 지침
  없음, the links above → 상위 조직 지침 `{n}`개가 먼저 적용됩니다. Never 시스템 프롬프트, 규칙, 정책 for them.
- whether an agent keeps its persona, as a unit or a person chooses it → its row 적용 on 조직 and 페르소나 사용 in 설정,
  its choices 페르소나 사용 and 페르소나 없음, a following row saying 위를 따라 페르소나 사용 or 위를 따라 페르소나 없음.
  Never 페르소나 끄기, 성격 없음.
- a person's own agents, the set their organisation supplies with their own changes over it → 내 에이전트: a seat
  supplied → 받은 에이전트 · `{unit}`, 받은 에이전트 · 기본 for the platform's own rule, 받은 에이전트 · 지금 없음 for one that
  no longer stands; one the person changed → 직접 정함, put back by 되돌리기; one of their own → 직접 추가; a role an
  organisation turned off → 쓸 수 없는 역할; a model their supply cannot run → 공급 없음. Their own instructions → 내 지침,
  for every agent 모든 에이전트. Never 커스텀 에이전트, 개인화, 기본 에이전트 for a supplied one.
- what a unit's people may change of the agents it supplies → 개인 설정 허용, its rows 에이전트 추가·끄기, 공급자 · 모델 선택
  and 내 지침, each 위를 따름, 허용 or 막음; one agent of a role in 가입 구성 → `{role} 에이전트 {n}`, its road the role's own
  agent's → 역할 에이전트를 따름. Never 권한 위임, 사용자 설정 허용.
- whether a unit's people add and change repositories → 저장소 관리, its choices 위를 따름, 허용, 막음; the repositories
  a unit owns → 조직 저장소, 조직 저장소 추가, 조직 저장소 없음. Never 레포 권한.
- a setting a unit above or the platform decided or locks, wherever a lock or a decision shows — a person's own row, a
  unit's, a company's — → 조직이 정함 · `{unit}`, 조직이 정함 where no unit is named, 전역 설정으로 정함 for the platform;
  its state → 켜짐 or 꺼짐. Never 관리자 지정, 강제됨, 상위 조직에서 잠금, 조직에서 잠금.
- the step a person whose runs only their own supply can carry takes before they start → 에이전트 로그인 설정, its way
  in from the join page 로그인하고 설정하기 and its way through 시작하기. Never 온보딩.
- what a provider, an account or a slot has left of its limits → 남은 사용량: its windows 세션 and 주간, each as
  `{share}%` with `{time} 초기화` for how long is left until it resets and 초기화 지남 once past; a balance 잔액 with
  `{wait} 전` for when it was read; a request allowance 하루 요청 or 무료 모델 요청 as `{left} / {limit} 남음`; and
  읽은 사용량 없음 where nothing is read. No account or slot is marked 사용 중. Never 잔여량, 쿼터, 한도 잔량, 리셋.
- the paid standing of a source and its use → 크레딧: 잔액, 이번 달 사용량, 이번 달 개인 크레딧 상한 (the person's own
  row) and 개인 크레딧 월 상한 (an organisation's cap on a person), 크레딧을 부여하다 and its noun 부여, the record
  of movements 장부 and of the grants and changes 감사 기록, the fixed conversion 전환율 and the unit a reservation
  opens and grows at 예약 크레딧. A cap that is not set stands as 상한 없음. The movements the 장부 keeps are spoken
  부여, 소비, 예약, 사용, 환불 and 차감, and the acts the 감사 기록 keeps 부여, 정책, 설정 and 플랜; an owner the 장부
  names stands as 사용자 or 조직 beside their number. Never 포인트, 머니, 잔고, 결제 for
  credits — payments are off and 결제 is one — and never 이력 for the audit.
- a membership sold on the platform → 플랜: the tab, the add and the row label are 플랜; its fields 가격, 대상
  (개인 or 조직), 주기, 기간 포함 and the switch 크레딧 사용 가능. Nothing stands on it until the administrator sets
  it, so a unit without one says 계획 없음. Never 요금제, 상품, 구독 (which is the standing on a plan, not the plan).
- whether supply limits answer at all → 공급 제한 적용: on and off as 켜짐 and 꺼짐 on the switch; the switch off
  records use but stops nothing. Never 강제, 활성화.
- a person's own road to a provider → 공급자 (its product's own name, `Claude` and the rest, written as the
  provider writes it), one key of it 공급 키, one sign-in of it 공급 로그인; what a row says of their standing is
  사용 가능, 창 가득 참, 로그인 필요, 키 거부됨 or 꺼짐 alone. The key's secret is chosen as a 이름 and the value
  never shows, as the secret store words it.
- a unit without a policy of its own → 따름: 상위 조직을 따름 on the screen's rows and 조직을 따름 on a person's,
  the policy in force shown as the rows' values under it; the act of ending one policy is 정책 삭제, which puts the
  following back, and the act of writing one is 정책 설정. Never 상속, which is a name nobody here says, and never
  적용 for the policy act, which is the platform switch's word.
- whether a person's own supply setting may change what the platform policy holds → 개인 설정 허용, the switch on the
  platform's form, and 고정 for a source or the order it holds; what a person reads beside one they cannot change →
  전역 설정으로 고정, and for the order 순서 전역 설정으로 고정; what an organisation's policy form reads beside a source
  the platform turns off and leaves to no person → 전역 설정으로 꺼짐. 고정 here keeps its own sense beside a pinned
  message's.
  Never 잠금, 잠김, 강제, 오버라이드.
- the plans an organisation is offered and the one it runs on → 노출 플랜 and 적용 플랜: a plan offered is 노출, its
  switch 노출; putting one in force is 적용, the act 적용 and its dialog's way through 적용, none standing as 적용 플랜
  없음, none offered 노출 플랜 없음; how long it has run and runs on → 적용 기간. 적용 here is the owner's own word for
  a plan in force and is never the policy act's. Never 구독 for either, 공개 or 표시 for 노출, 할당 or 배정 for 적용.
- retire, take down → 보관; bringing one back → 복원. Switching a piece in or out of use → 켜기, 끄기.
  Never 내리기, 올리기.
- fold (a work order) → 종료. 접기 is only ever a panel folding away, and is written as below.
- file, stand up (an item) → 만들기: 항목 만들기, 만든 항목, 만들지 못했습니다. Never 세우기, 올리기.
- ask (a job's question) → 질문, 질문하다: Job의 질문. Never 물다, 물어본 것, 묻기.
- a TODO item whose job waits on a question put to the owner → 답변 대기: the chip on its row and in the opened item,
  and the choice of the TODO filter's 질문 condition; the head's count pressed → 답변 대기 항목만 보기. Never 질문에
  답을 기다리는 중, 결정 대기, which reads as 결재 대기 at a glance, nor 응답 대기.
- the answer a job would take by itself → 추천: (추천) before the choice it names, 추천 {number}번, and 추천 답 for words
  the choices do not hold; a question its recommendation settled when its time ran out → 시간 초과 · 추천 답으로 결정,
  and one about to be → 시간 초과 · 추천 {number}번으로 결정; one only a person settles, with no recommendation or no due
  time → 사람의 답을 기다림. Never 권장, 제안, 무응답.
- download → 다운로드: 다운로드, {name} 다운로드, 다운로드 주소, `{name} 파일을 다운로드하지 못했습니다`. Never 내려받기. This is the owner's own choice of
  the word.
- volume → 볼륨; mute, unmute → 음소거, 음소거 해제: 음소거됨, 음소거 해제됨, 볼륨 {n}%; a mute that holds this device
  alone → 이 기기 음소거, 이 기기 음소거 해제. Never 무음, 소리 끄기, 이 기기에서만 음소거.
- a video player's controls → 전체 화면, 전체 화면 종료; 재생 속도, 속도 {speed}, and the normal speed `{speed} 보통`;
  자막, 자막 {name}, 자막 꺼짐, with 꺼짐 as the choice of none; 화면 회전, {degrees}도 회전됨; a skip → {n}초 앞으로,
  {n}초 뒤로; 밝기 {n}%; the player itself → 플레이어. Never 풀스크린, 배속 for the setting, 캡션 for subtitles,
  돌리기, 건너뛰기.
- machine → 기기: 이 기기, 기기 여유, 기기 이름. An account bound to a machine → 기기 연결: 기기 연결, 다른 기기로
  연결, 기기 연결 해제, 연결됨, 연결 대기 중. Never 기계, and never 바인딩, 묶기 or 풀기 for the binding. A machine
  several accounts are connected to → 공유 기기: 공유 기기, 공유, 공유 해제; the choice made as a machine is
  connected → 여러 계정이 함께 쓰는 기기. Never 공용 기기, 같이 쓰기. The machine an approval connects → 연결할 기기;
  when the account was connected to it → 연결한 날짜; how its program is connected → 연결 방식, 데스크톱 앱 or
  설치형 프로그램 for one installed by its command; the machines in a person's own settings → 설정의 기기. Never 에이전트
  for the installed program, which stays a role's seat, nor 페어링 날짜 or 설치 방식.
- a node, one machine of the node service's list → 노드: 노드, 노드 삭제, 노드 없음, 찾은 노드 없음. Whether it is the platform's or a
  person's → 소유: 공용 노드, 개인 노드, 공용, 개인, 소유 변경; the account a personal node belongs to → 소유 계정, 계정 없음,
  알 수 없는 계정 {id}. A PC several accounts share, a 공유 기기 above, is a 개인 노드. Never 공유 노드, 공유 PC, 플랫폼 노드 or
  사설 노드 for either. Its last check → 상태: 연결됨, 연결 끊김, 인증 실패, 호스트 키 불일치, 연결할 수 없음, 오류, 확인 전;
  how it is reached → 연결 방식: SSH, Jake. A personal node the monitor reads names its owner on its tile and in
  its system card's 소유 → 개인 노드 · {name}, and 개인 노드 alone where the reader cannot read the name. A personal
  node the monitor does not read says on its screen 개인 노드는 모니터링하지 않습니다.
- the console's desktop app → 데스크톱 앱; its pairing with an account → 앱 연결: 앱 연결, 연결 코드, 승인, 거부,
  승인했습니다, 거부했습니다, 연결하는 중, 연결됨. The app's own window → 앱 창, and the line at its top that shows the
  code → 제목 표시줄, as Windows names it. Never 데스크탑, 페어링, 허용 or 거절, nor 타이틀 바 or 창 제목.
- the app's download page → 데스크톱 앱: a version published → 버전, when it was → 공개일, none yet → 공개된 버전 없음;
  an installer → 설치 파일, or its format's own name, AppImage, deb 패키지; a file's size → 크기, written `{size}
  ({bytes}바이트)`; its digest → SHA-256; the steps of using it → 사용 방법. A warning Windows shows is named by the
  words Windows itself shows: Windows의 PC 보호, 추가 정보, 실행. Never 인스톨러, 셋업 파일, 릴리스, 배포일 or 해시값.
- the join page's two ways to connect the machine → 데스크톱 앱으로 시작 and jake 명령으로 시작, as tabs; their steps →
  앱 다운로드, 앱 열기, 연결 코드 입력, with 연결 as the code's button; an installer offered by its platform →
  `{platform} {format}`, as `Windows 설치 파일`. The installed program on the desktop app's own page → 설치된 jake, and
  moving to the app's own agent → 내장 에이전트로 전환. Never 설치 프로그램으로 시작, 커맨드, 페어링 or 바꾸기.
- the app's own settings, in the console's settings → 데스크톱, the section's name, as the owner named it: its switches
  are 잠금 중 원격 제어 유지, 창을 닫으면 트레이로 이동, 로그인할 때 시작, 트레이에서 시작 and 절전 모드 방지, the app's
  tray → 트레이 and its file → 설정 파일. Never 데탑, 시스템 트레이, 알림 영역 or 슬립.
- the deployment the desktop app connects to → BMO 서버, its console's address → BMO 서버 주소; changing it →
  서버 변경, in the tray and as the form's title, 변경 on the settings row; the app starting again on the new one →
  앱을 다시 시작합니다. Never 콘솔 주소, 호스트, 서버 바꾸기 or 재시작.
- where the desktop app's updates come from → 업데이트 채널: the set's releases → 안정판, `안정판 (기본값)` among the
  choices; the day's build between them → 나이틀리, as the owner named it; what a nightly is → 매일 만드는 빌드. Never
  정식판, 베타, 개발판, 스테이블 or 릴리스 채널.
- the app's window controls the console draws → 최소화, 최대화, 이전 크기로 (restoring a maximised window, as Windows
  says it) and 닫기. Never 최대화 해제, 복원, 창 닫기 or 종료, which is quitting the app.
- the largest file a place takes, which a room's chat service or the agency declares → 보낼 수 있는 크기: in the
  box `{by}에서 보낼 수 있는 크기({limit})보다 큰 파일이라 첨부하지 않았습니다`, the file named beneath it; for a send
  `{name} 파일이 {by}에서 보낼 수 있는 크기({limit})보다 커서 보내지 않았습니다`; with no chat service named, 이 방에서
  보낼 수 있는 크기. Never 용량 제한, 업로드 한도, 최대 용량, 너무 큽니다.
- render → 렌더링: 렌더링하지 않는 기간. Never 그리다.
- message, words → 메시지: 메시지를 보내다, 보낼 메시지. A conversation is 대화, an instruction added
  to an item is 지시. Never 말, 할 말, 이야기, 말을 걸다.
- the top of a room's line → 대화의 처음입니다 where the oldest message is the conversation's start; where a chat
  service reads the room's past back, `{service}에서 받은 대화는 여기부터입니다`. Never 불러올 대화 없음, 끝, or a
  sentence about why the older lines are missing.
- filter, sift → 필터. Never 거르기.
- page → 페이지. Never 쪽.
- table → 테이블; row → 행; cell → 셀; query → 쿼리, wherever the text is about a database: `행 {n}개를 클립보드에
  복사했습니다`, `셀 {n}개를 클립보드에 복사했습니다`. Never 표, 줄, 칸, 질의.
- default → 기본값, standing only as the mark after the default value (above). Never 처음 값.
- a value that is not set, standing alone in a table's cell or in a name and value list → `—`, the dash alone, as every
  table of the console writes it; a moment that was never recorded → 기록 없음. The dash never stands between words, at
  the end of a line of words or in a sentence: a line of words leaves out a part it does not have. Never 미설정, N/A or
  a hyphen for an empty cell.
- section → 섹션. Never 구역.
- reading a list, a region or a screen again, the button and the act → 새로고침, written as one word. Never 다시 읽기,
  새로 고침, 다시 불러오기.
- organisation → 조직: 조직, 같은 조직, 조직 이름; the side list a screen chooses one from, the 조직 screen's and every
  unit's screen's alike → 조직 목록, its search finding none → 찾은 조직 없음, a reader with none to set → 설정할 조직 없음, and its add for a new company → 회사 추가.
  Never 단체, 기관.
- an organisation unit, one of the tree a deployment's people stand in → 조직: 조직 추가, 상위 조직, 하위 조직; the
  tree of them → 조직도; a unit at the tree's top → 회사, a new one 새 회사. Never 단위, the English unit's twin.
- a unit's head → 조직장: 조직장 지정, 조직장 해제. Never 장 alone, 책임자.
- the one view a room's name opens, of what the room is and what it holds → 방 정보; its tabs → 대화상대, 미디어,
  파일, 링크, 음악, 음성, 상황, 세션 정보, 채팅 서비스, 말투. Never 방 설정, 채팅방 정보, 방 서랍.
- a room added in the mode where BMO answers as the person's own account → 아바타 모드, its line on → 이 방에서
  BMO가 내 계정으로 대신 답합니다, off → 기록만 하고 답하지 않습니다; where the mode cannot apply nothing of it is shown.
  Never 모드가 없습니다 or any line explaining its absence.
- who may call their own BMO into a room is no setting: every member may, so no screen names a 호출 권한 or 호출
  허용. Letting a member in that fails to give that right → 이 방에서 자기 BMO를 부를 수 있게 하지 못했습니다.
- a room's chat service, fixed as the room is added → 채팅 서비스는 방을 추가할 때 정해지고, 그 뒤로는 바꿀 수
  없습니다. Never a switch or 켜기/끄기 for a chat service in 방 정보.
- a chat road a room is on, as 채팅 서비스 and the console name it → the receiver's own record 대화 기록, each chat
  service by its exact official name in that language (Telegram, 카카오톡, Microsoft Teams, Discord), never a nickname
  such as 팀즈, and one the pack has no name for →
  메신저 ({key}). Never 이 방의 기록 for the record, and never the receiver's English label.
- a code a unit gives that the pack has no word for → the generic word for its sort: a verdict's stage 기타 단계, an
  outcome 기타 결과, a draft row's kind 기타 기록, a quiet instruction's sort 기타 지시, a role's bundle 기타 기능 묶음;
  a removal's warning of another code 확인할 점이 하나 더 있습니다, and a file refused for another reason 「{name} 파일을
  보내지 못했습니다.」. Never the code itself, and never the unit's English sentence.
- what a room's messages carried, collected by kind in 방 정보 → the pictures and videos together 미디어, a file that is no
  picture, video or sound 파일, a web address the words hold 링크, a sound that is no voice note 음악, voice notes 음성
  as the tab and 음성 메시지 for one; a tab with none → 미디어 없음, 파일 없음, 링크 없음, 음악 없음, 음성 메시지 없음; a
  read refused → 미디어를 불러오지 못했습니다 and the like. Never 갤러리 or 앨범 for 미디어 (앨범 is one send's pictures),
  첨부파일, 오디오, 사운드, 녹음.
- the people of a room, the accounts let into it and the people its chat service reads → 대화상대: 대화상대,
  대화상대 없음, 대화상대를 불러오지 못했습니다, 채팅 서비스에서 이 방의 대화상대를 읽지 못했습니다; a room with none
  says why under 대화상대 없음, 채팅 서비스가 없는 방입니다 or 채팅 서비스가 대화상대 목록을 주지 않습니다. Never 멤버,
  참여자, 인원, and never 구성원, which is a unit's people; a member the account service knows as an account → 콘솔
  사용자.
- whether a person is reachable now → 접속 상태: 온라인, 자리 비움, and for one who is not here the last moment seen,
  최근 접속 {time} 전; several people's → 온라인 {n}명; the account's switch to show it → 접속 상태 공개. Nobody is
  ever written offline: one who is not here is drawn as nothing. Never 접속 중, 부재 중, 마지막 접속, which stays the
  users tab's never-word for a sign-in.
- somebody writing in a room now → 입력 중: 입력 중… after the writers' faces, and every writer named before it,
  `{names} 입력 중…`, the names joined by a comma; a writer the room names nobody for is 누군가 among them. Never
  타이핑 중, 작성 중, 쓰는 중, and never a count of people in place of their names.
- letting an account into a room → 대화상대 추가: 대화상대 추가, 추가했습니다, 추가하지 못했습니다; two people at once →
  `{first}님, {second}님을 대화상대로 추가했습니다`, more at once → `{name}님 외 {n}명을 대화상대로 추가했습니다`, an organisation's people → `{unit}을(를) 대화상대로 추가했습니다`, the particle the name's last sound takes; the
  picker's field that finds both → 사람·조직, 이름이나 조직으로 찾기. Never 초대, which is the link that makes an account,
  nor 들이기, 입장, and never 일괄 추가 or 단체 초대 for letting several in.
- a person coming into a room by themselves, as a chat service tells it → 들어오기: `{names}이 들어왔습니다`, every
  person named as `{name}님` and the names joined by a comma, `{first}님, {second}님이 들어왔습니다`; people another
  brought in → `{by}님이 {first}님, {second}님을 대화상대로 추가했습니다`, as letting an account in reads. Never 입장, 참여,
  가입, and never a count of people in place of their names.
- taking a member out of a room → 내보내기: 내보내기, 내보냈습니다, 내보내지 못했습니다; a member taking themselves
  out → 나가기: 나가기, 나갔습니다, 나가지 못했습니다. Never 강퇴, 추방, 퇴장.
- the sidebar's one entry that brings a room in, however the reader may → 새 채팅. Its menu names each way by what it
  brings: a room added from a chat service → 채팅 서비스 방 추가, its dialog 방 추가; a group room opened in the console →
  콘솔 방 만들기. Never 새 방, 대화 시작, 방 가져오기.
- opening a group room in the console → 방 만들기: 방 만들기, 방 이름, 만들기. Never 방 개설, 방 생성, 방 열기.
- the people standing in a unit → 구성원: 구성원 추가, 구성원 n명. Never 배치 for placing a person in a unit.
- people moved into another unit in one act → 조직 이동: 조직 이동, 이동할 조직, 이동. Never 옮기기, 발령 or 배치 for
  people; a unit moved under another parent is still 옮기다.
- a person's place in the unit they stand in, on the organisation chart → 역할, its values 조직장 and 구성원.
  Everywhere else 역할 is an agent's role (below).
- what an act will write, shown before it is written → 미리 보기; a row the act leaves as it stands → 변경 없음.
  Never 사전 확인, 변화 없음.
- the screen of the organisation and the people in it → 조직; the administrator's screen of what is set for the
  platform itself (providers, secret kinds, plans, credits) → 플랫폼 설정; the dialog of what a person sets for
  themselves → 설정. Never 조직 설정, 관리자 or 관리자 설정 for a screen.
- the sidebar's sections of screens: what the administrator keeps the deployment running with, and the organisation
  screen beside it → 시스템 서비스; every other screen → 애플리케이션. Never 앱, 어플리케이션, 관리자 서비스, 관리
  서비스 or 관리자 메뉴.
- the person who administers the whole platform → 플랫폼 관리자: 플랫폼 관리자만 할 수 있습니다, 플랫폼 관리자나
  조직장만, 플랫폼 관리자에게 알려 주세요. Never 관리자 alone, which a reader cannot tell from a unit's 조직장; 관리자
  stays only where it names something else, as a service manager (서비스 관리자).
- the account on a chat service a contact listing and a started conversation are for → 계정: 내 계정, 채팅 서비스
  계정, 내 계정 연락처, 채팅 서비스 계정 연락처. Never 어카운트, 아이디.
- the organisation screen's tab where accounts are looked up across companies → 사용자: 사용자, 사용자 없음, 사용자를
  선택해 주세요, 찾은 사용자 {n}명; where an account stands → 상태: 활성, 기기 연결 대기, 탈퇴; when it was made → 만든
  날짜; when it last signed in → 최근 로그인; a person's latest runs → 최근 활동; the menu of what may be done for one →
  관리, its acts 조직 이동, 기기 연결, 프로필 변경, BMO 설정 권한, 탈퇴 처리; one person's tabs → 계정, 조직, 권한, BMO and
  활동, 조직 holding the groups 소속, 겸직 and 이력, and 활동 holding their rooms, agents, sessions and latest runs.
  Never 회원, 계정 목록, 마지막 접속, 활동 내역.
- a person in the console's directory → 사람: 사람, 같은 조직의 사람. Never 사용자 for a person found by search; 사용자 stays for a login or an account.
- the name people read a person by → 이름: 이름, 이름을 입력해 주세요. The sign-in name is 아이디. A screen names a person
  by their 이름 and shows the 아이디 only where no 이름 stands or where the sign-in itself is meant. Never 실명, 성명,
  표시 이름 or 닉네임.
- what another person shared with the reader → 공유받은 항목: 공유받은 항목, 공유받은 항목 없음; the person who
  shared it → 공유한 사람: 공유한 사람, 공유한 사람: {name}. Never 공유된 항목, 받은 공유.
- the people a thing is shared with → 공유 대상: 공유 대상, 공유 대상 없음. Never 공유한 사람, which is the
  sharer, nor 공유받은 사람.
- read-only, what the reader may read and never change → 읽기 전용. Never 읽기만 가능, 열람 전용.
- permission → 권한: 권한, 권한이 있습니다, 권한이 없습니다. Never 허가, 접근 권한.
- read a section → 읽기: 읽기, 읽을 수 있습니다. Never 조회 for a section's read.
- write a section → 쓰기: 쓰기, 쓸 수 있습니다. Never 편집 for a section's write.
- health check → 헬스 체크; the one run before anything changes → 사전 헬스 체크. Never 생존 확인.
- rollback → 롤백. Never 되돌림.
- template → 템플릿; coverage → 커버리지; cap → 상한; cooldown → 쿨다운. Never 틀, 덮음, 천장, 휴식.
- output tokens → 출력; context window → 컨텍스트. Never 답, 창.
- a model's reasoning effort → 강도; an answer's token ceiling → 답변 상한. Never 노력, 답 천장.
- the rest of a list a line leaves unshown → 외 {n}: `Claude Code 외 2`; people → 외 {n}명, which a row of faces'
  count of the rest is heard as. Never 그 밖에, +{n}.
- brain (what a turn read from the agent's memory store) → 브레인. Never 기억 저장소, 두뇌, 읽은 문서.
- a room's due memories (its promise, follow-up and check memories whose time or event has come) → 이 방에서 지금
  할 약속. Never 때가 된 기억, 만기된 기억, 예정된 메모리.
- an item's request in its own words → 요청 원문; the talk with the chat agent about an item, and the talk with a job over
  the question it asked → 의논. Never 대화 for the talk itself, which is a room's conversation. The one action that
  opens the talk over a job's question is named 이 주제로 대화하기, by the owner's word, and nothing else is.
- a part of a screen floating over it that the reader moves and sizes → 창: 창 이동, 창 크기 조절. Folding it to its pill is
  닫기 and unfolding it 열기, as a panel's; a sheet's two heights are set by 확장 and 축소. Never 윈도우, 팝업.
- a row of cards paged sideways → 이전, 다음, and the link that opens the row whole → 모두 보기. The next video offered
  near a video's end → 지금 재생, and its count to playing on its own → {n}초 후 재생.
- the card under a message showing the page a link leads to → 링크 미리보기: 링크 미리보기 불러오는 중…. Never 링크 카드,
  오픈그래프, OG.
- collapse, expand a panel → 닫기, 열기; collapse, expand in place → 축소, 확장. Never 접기, 펴기, 펼치기.
- the way back to the screen the reader came from → 뒤로. Never 돌아가기, 이전 화면.
- reach a limit → 도달; a match → 일치, 해당; tied to → 연결된. Never 걸리다, 걸린 곳.
- reach a service → 연결되다: 봇에 연결되지 않아. Never 닿다.
- request → 요청하다. Never 청하다.
- choose, pick → 선택: 선택해 주세요, 선택 취소, {n}명 선택. Never 고르기, 골라 주세요, 물리기.
- enter text → 입력: 입력해 주세요, {n}자 이내로 입력. Never 적어 주세요.
- launch, start a run → 실행. Never 띄우다, 뜨다, 발사.
- a tool call's clock in an agent's log → `실행 중 {time}` while it runs, `{n}분 넘게 실행 중` past the long mark; its
  supervisor's moments → 감독관 확인 요청 (with ` · 출력 없이 {time}`), 감독관 유지 (with ` · {time}까지`), 감독관 확인
  실패; how it settled → 완료, 실패, 턴과 함께 끝, or 중지 followed by what stopped it: 진행 없음, 응답 없음, 감독관, 작업
  중지; its process → 프로세스 {pid}; a command that is a loop's → 반복. Never 타임아웃, 컷, 킬, 확인 요청됨, 대기 중
  for a call, or 종료 for its end.
- the moments a job or a run started and ended → 시작, 끝, each before its time: `시작 {time}`, `끝 {time}`, as
  a run's log names them. Never 완료 for the end, which a stopped or failed job never reached, and never 종료.
- stop a run → 중지; pause and resume a timer → 정지, 재개; run out of time → 시간 초과. Never 멈추기,
  다시 흐르게, 때를 놓침.
- a thing a unit stopped before it was made, a voice briefing among them → 중지됨; asking for it again → 다시
  요청: 보이스브리핑 중지됨 · 다시 요청 가능. Never 재요청, 멈춤.
- leave the queue → 대기열에서 제외. Never 대기열에서 빠지다.
- why a supervisor's turn sent nothing to a room → 사유: `사유: {reason}` on its own line under the line saying it did
  not answer, and 사유를 밝히지 않았습니다 where the turn named none. Never 까닭, 이유 없음.
- the box at a TODO item's top right with its approval line and assignment → 결재란, its cells 요청, 추천 and 결재, the
  owner's approval of an item being 결재 (결재됨, and 결재 대기 for one awaiting it, in its state and its cell alike). Never
  결재 박스, 승인란, 서명란, 결재 전.
- set a TODO item aside → 보류, taking the hold back → 보류 해제: 보류, 보류 해제, 보류 사유, 보류 항목. The act and the
  state mark are the same word, and a held item's menu shows 보류 해제 in place of 보류. Never 보류 풀기, 재개, 대기로 돌리기
  for the release; 재개 stays a stopped work order's own word. A hold always carries its reason: its box is 보류 사유,
  never 사유 (선택).
- switch a TODO item's job notices off → 알림 끄기, back on → 알림 켜기: 알림 끄기, 알림 켜기, 알림 꺼짐, 알림 끄기
  사유. The state is shown with its reason as `알림 꺼짐 · {reason}` on a TODO row, and as `{since}부터 알림 꺼짐 · {reason}`
  in the opened item, as a hold's line reads. Never 알림 중지, 알림 해제, 음소거, 무음.
- a job's command in the testbed's queue, on its TODO row → 테스트 중 while it holds a seat, 테스트 대기 <n>번째 while it
  waits, each followed by ` · ` and the command as the testbed names it. Never 검사 중, 차례 대기, 줄 서는 중. It is the
  one place a row says 테스트 중: the state chip never does, a deployment's check and suite reading 배포 중.
- how a deployment ended → 배포 완료; 배포 실패 for every run something failed, its gate among them, followed by the
  stage and the step that failed it, `{step} 종료 코드 {code}` or `{step} 중지 · 출력 없음` for a step ended as hung;
  배포 실패 · 롤백 where the release before it was put back; 배포 거부됨 for a run refused before it began; 배포 중단됨
  for a run withdrawn before it ended. Never 배포 안 함, which reads as a choice not to deploy, nor 배포 취소.
- where a change stands on its way live, in the title bar and on a TODO row → 배포 대기 for a merged commit waiting
  for its repository's batch deployment, and for the deployment's hold on the queue; 배포 순서 대기 for a deployment
  started and waiting its turn in the testbed's deployment line; 배포 중 for a deployment under way. Each names its
  repository after ` · ` where one is known: 배포 중 · bmo-drive, 배포 순서 대기 · bmo-job 외 4. The list of the
  deployments waiting in the line → 순서 대기. Never 줄 서는 중, 대기열 or 배포 큐 for the line.
- the minutes between the agency's flushes, each putting every commit 배포 대기 live at once → 일괄 배포 주기, its
  group 배포, its figure followed by 분. Never 플러시, 배포 큐 비우기 or 큐 간격.
- the research unit's words → 리서치, 분류 (a category), 대기열 (its queue), 제외 (dismissing an item), 보류 (a hold on its
  runs), 해당 (a document marked for the owner's word), 브리핑 (a brief), 보안 권고 (an advisory). Never 카테고리, 큐, 기각.
- set by hand → 수동 지정. Never 손으로 정함.
- what the machine's background units wrote, the monitor's tab → 로그; one entry of it → 줄: 줄 없음, 찾은 줄 없음; the
  group a unit stands in → 분류: 전체, 서비스, 백업, 배포, 테스트, 정기 작업; a line's priority → 수준: 오류, 경고, 그 외; a
  value taken out of a line → 가려진 값. Never 카테고리, 레벨, 기록 for the tab, 마스킹.
- a job's review → 보고 턴; its entries → 검수 시작, 보고, 질의, 답변, 반려, 통과, 소유자 보고, 소유자 결정, 수락; its checks → 약속 이행, 결정 근거. Never 리젝, 거절, 컨펌.
- a user's job title and contact details → 프로필: 직함, 유선 전화, 휴대전화, 이메일. Never 유선번호, 핸드폰, 메일, and never
  직책 for the free job title, which is 직함.
- a person's grade in the company's scale → 직위; what they are in charge of → 담당업무. Never 직급, 담당 업무, 업무.
- one of a company's roles, carried in a unit → 직책: 직책, 직책 없음, 지금 직책 유지; the company's list of them on its
  own tab → 직책·종류. Never 역할 for it, which stays the 조직장 or 구성원 place, nor 포지션.
- a unit's kind in its company's words → 종류, the list 조직 종류: 조직 종류 없음. Never 유형, 타입, 구분.
- the name a unit's letters are numbered by → 약칭. Never 약어, 단축명, 코드.
- the unit a unit's approvals go up through → 결재 상위 조직, its parent marked `(기본값)` among the choices; the chain itself → 결재선. Never
  보고 라인, 상신 조직.
- the approval screen and a decision made in writing → 결재; a document's line → 결재선; its steps → 기안, 검토, 협의, 승인,
  and the people beside it → 참조, 통보, the pair together 참조·통보. These are the owner's own words. Never 결재 라인, 리뷰,
  합의 for 협의, 결재 for the approve step, 공유 for 참조.
- the acts on an approval document → 상신 (submit), 승인, 반려 (reject, with its 반려 사유), 회수 (the drafter takes it back),
  재기안 (drafted again), 접수 (a member of the handling unit takes it); each in every inflection, 상신했습니다,
  반려하지 못했습니다. A document not yet submitted → 임시저장; one whose line runs → 진행 중; one approved → 완료; one waiting
  for its handling unit → 접수 대기, then 처리 중. 반려 is the same word a job review takes, each on its own screen. Never
  제출, 거절, 철회, 취소 for these.
- the boxes a person and a unit read documents in → 결재함: 결재 대기 (with its count, 결재 대기 {n}), 기안함, 처리함,
  참조함; a unit's 완료함, 수신함, 참조함; the side list they are chosen from → 결재함 목록, a person's own heading it as
  내 결재함 and each unit's under the unit's name. Never 받은편지함, 대기열.
- a company's kinds of document → 양식: 양식, 새 양식, 양식 없음; the default set → 품의서, 내부 결재, 사내공문, 업무 협조, 휴가
  신청, 변경 보고; how a form numbers its completed documents → 번호 방식, its values 번호 없음, 양식별, 조직 약칭별; the number a
  document is given → 문서 번호. Keeping the forms and rules is 편집, as a setting's is; a document's own words are 수정. Never
  템플릿, 서식, 채번.
- a company's job authority table and one row of it → 전결 규칙: 전결 규칙, 새 전결 규칙, 전결 규칙 편집, 일반 (a rule naming no
  matter); its matter → 사안; an amount band → 구간 ({n}구간 never, 구간 {n}), its bound → 상한 금액, the last 상한 없음. A drafter
  deciding alone → 전결 권한. Never 위임 규칙, 결재 규칙, 조건.
- the unit a two-phase request arrives at → 처리 조직; the units a letter goes to → 수신처; the unit a document is drafted in →
  기안 조직. Never 처리 부서, 수신 부서, 기안 부서: a unit is 조직.
- a completed document filed in the archive → 아카이브 등록. Never 보관, which is retiring a thing.
- the kinds an archive (아티팩트) document is filed as, 리서치, 기록, 학습자료, 원문 and 페이지 → 카테고리: 카테고리, 모든 카테고리,
  each opening its list; a document's category label, the filer's own word for the work that made it → 분류: 분류, 모든 분류.
  Never 종류 for an archive document's kind: the owner's own choice of the word. The archive's front page → 최신 문서, 많이 본
  문서 with its span 최근 7일 and 최근 7일 동안 읽은 문서 없음 for none, the documents the reader read last → 최근 본 문서
  with 최근 7일 동안 본 문서 없음 for none, 카테고리 with 전체 first; a row's link to its whole
  list → 모두 보기.
- how long a step or a document took → 경과, the summary of them → 경과시간, with 건수, 중앙값 and 최소 ~ 최대. Never 소요 시간, 처리
  시간.
- the attendance screen → 근태; its views → 근무계획, 휴가, 업무 기록, 조직 근무계획 (a head's view of a unit), 설정. Never
  출퇴근, 근무 관리.
- a month's plan of one person → 근무계획: 작성 전, 작성 중, 제출됨, and its act 제출, since it has no approver; its changes →
  근무계획 이력. A day the plan does not cover yet → 미설정, a state of the day rather than an empty cell: 미설정, 미설정 {n}일,
  미설정인 날 in a sentence, and writing them all → 미설정 채우기. Never 상신 for a plan, 빈 날, 미입력, 누락일.
- the kind of a planned day → 업무구분: 근무, 시차출퇴근, 출장, 휴무, 대휴, 공휴일, 휴가; half a day of leave → 반차, 오전 반차, 오후
  반차, and a whole day → 종일. Never 근무유형, 근무형태, 반일 휴가.
- a working day's hours → 근무시간: 출근, 퇴근, 휴게 (휴게 {n} 시작, 휴게 {n} 끝, 휴게 없음); a unit's own → 조직 근무시간, one
  taken from above → 상위 조직 따름. Never 근무 패턴, 패턴, 쉬는 시간.
- a week on the person's own hours → 탄력근무; planned extra hours → 연장근무, the most a month may plan → 연장근무 한도, 한도
  없음. Never 유연근무 for 탄력근무, 초과근무, 잔업, 시간외 근무.
- a leave request → 휴가 신청, 새 휴가 신청; it runs as an approval document, so its acts and states are 결재's: 상신, 회수,
  임시저장, 진행 중, 승인, 반려. Never 제출 or 취소 for leave.
- one entry of what a day's hours went to → 업무 기록, its fields 시작, 시간, 업무코드, 업무명; the company's catalogue of codes →
  업무코드, 새 업무코드, 업무코드 없음, a code no longer used → 보관, 보관됨, and back → 복원; the hours of a day by code → 업무코드별 시간. An entry the
  person's BMO drafted → 초안, waiting ones → 확정할 초안 {n}건, keeping one → 확정. Never 작업 기록, 업무일지, 작업명, 승인 for
  확정.
- a post a person holds beside their home unit → 겸직: 겸직 추가, 겸직 편집, 겸직 해제, 겸직 없음, 대상자, 조직장 겸임. Never
  겸임 for the post itself, 파견, 소속 추가.
- acting for a unit's head for a period → 직무대행: 직무대행 지정, 대행자, 종료일, `{date}까지`, and the mark 대행. Never 대리,
  which is a rank, nor 권한 위임.
- what holds for a whole unit and every agent serving its people is given → 조직 기억: 기억 추가, 기억 편집, 기억 삭제,
  기억 없음, 이 조직의 기억, 상위 조직의 기억; its fields → 내용, 주제, 고정 (no unit below overrides its topic), 사내 한정
  (kept from a room where someone outside the company sits); a member's word waiting for a writer → 제안, answered 수락
  or 거절, 제안 없음; who may write it without heading the unit → 조직 기억 쓰기 권한, 권한 부여, 권한 해제. Never 메모리,
  공통 기억, 잠금 for 고정, 대외비 for 사내 한정, nor 승인 or 반려 for a proposal, which stay an approval's words.
- a memory of the organisation about one person, what it may know of them → its field and mark 인물; the person's own
  such memories on 계정 → 조직에 공유한 내 정보: 정보 추가, 정보 삭제, 공유한 정보 없음. Never 신상, 개인 정보 for it.
- what every agent may read, above every company → 전역 베이스 in Korean text; on 조직 기억 with 플랫폼 전체 chosen, its
  candidates' review → 검토, each decided 전역으로, `{brain}에 남김` or 버림; a tip kept by an agent → 요령, a check worth
  running each time → 점검, reference knowledge → 지식. Whether a unit's people have a layer read → 읽기 범위: 전역 베이스
  읽기, 조직 기억 읽기. Never 공용 기억 or 글로벌 for the base.
- the record of changes to a person's place → 이력: 이력 없음. Never 히스토리, 로그, 발령 내역.
- the one screen of the organisation's works, its menu and its title → 일정 관리. 업무 is never a menu's or a screen's
  name.
- one piece of work in the works tree, and each card, row or bar that draws one on 일정 관리 → 업무: 업무, 새 업무, 내 업무,
  내 개인 업무, `{name} 업무` for a unit's, 업무가 아직 없습니다, one with no date → 날짜 없는 업무; the works under one →
  하위 업무 (하위 업무가 아직 없습니다), the one above → 상위 업무. A work's kind → 종류: 묶음 업무 (one rolled up from the
  works under it), 단발 업무, 누적 업무, 기한 조건 (a milestone, ending once its conditions hold), 끼어든 업무 (an
  interruption, counted `끼어든 업무 {n}건 · {m}분`). Its state → 상태: 초안, 진행, 완료, 취소됨; on a card only 초안 and
  취소됨 are shown, since the column says the rest. Never 작업, 항목, 하위 작업 for a work, nor 에픽, 스토리, 버그 for
  a kind.
- the left list of 일정 관리 → 조직 목록, its rows 내 업무, each company and each unit by its own name. A board's
  column → 열, each a status (상태), its role → 단계: 시작 전, 진행 중, 완료, its limit → 최대; a work's 우선순위
  (가장 높음, 높음, 보통, 낮음, 가장 낮음), 레이블, 포인트, 스프린트 and the 백로그 it waits in. Never 스토리 포인트, 컬럼, 칸, and 태그 for a label.
- who carries a work → 담당자; giving it to them → 할당: 할당, `{name} 할당`, 할당이 아직 없습니다; their acknowledgement →
  확인, the assignment standing 확인 대기 until it is given and 확인함 after; a unit's head the assignment went past →
  건너뛴 조직장.
- a work's share of its parent → 가중치; dividing one work into several → 나누기; its changes over time → 이력, each
  change named by what changed (범위, 가중치, 종류, 목표, 계획, 날짜, 담당자, 상위 업무, 상태, 나누기, 진척, 우선순위, 레이블, 포인트) and shown
  as `{before} → {after}`. Never 히스토리.
- how far a work has gone → 진척, its entries 진척 기록; where the plan says it should be → `계획 {percent}` beside it; its
  signal → 정상, 주의, 위험; risks in the works under it → 하위 위험 {n}건. Its due date → 기한, `{n}일 남음` while it is
  still to come, 오늘 마감 on the day, 기한 지남 once past; its start → 시작일. Never 순조 for 정상, 진행률 for 진척,
  마감일 or 데드라인 for a due date.
- an entry the person's BMO drafted → 초안, keeping it → 확정, letting it go → 철회; the drafts on a work another reads →
  `확정 전 초안 {n}건`; one drafted from what an agent did → AI 작업. What an entry rests on → 증거, counted `증거 {n}건`;
  one resting on the person's word alone → 진술. Never 미확인, 승인 for 확정, 취소 or 삭제 for 철회, 근거 for 증거.
- the ways the chosen place's works are read on 일정 관리 → 보기: 요약, 타임라인, 백로그, 보드, 캘린더, 목록, and for a
  head 오늘, 주간 보고, 월간 보고. 일정 is never a view's name: it is a calendar event alone. The works at risk
  gathered at the list's head → 위험 업무; a scope that changed this week → 범위 변경; the signal's column → 전망. A
  person's day: a line their BMO wrote → BMO 작성; a line left unmoved day after day → `{n}일째 진척 없음`; nothing
  written → 기록 없음; nothing written on a day whose end-of-day question found the person's BMO not connected →
  BMO 연결 안 됨, never 연결 실패 or BMO 오프라인; a day off in its place in the attendance screen's words (휴가, 오전 반차, 오후 반차, 출장, 휴무,
  대휴, 공휴일). The weekly report's parts → 중점 업무, 진척 변화, 밀린 업무, 다음 주 기한 조건, 사람별 요약, 가치 분류 (분류
  없음 for works with none), 조직장 의견; its columns 시작 진척, 종료 진척, 최근 진척; its weeks → 이전 주, 다음 주; the
  sheet → 다운로드. A reader's remark on a work, or a head's on a person → 의견: 의견, 의견 추가, 등록, 의견이 아직
  없습니다, a head's marked 조직장. Never 진척 나무, 변화 없음 for a line left unmoved, 댓글, 코멘트, 내려받기.
- the weekly and monthly reports, in the words of the company's productivity workbooks so a reader of the workbook reads
  the same words: a work's classification → 분류 코드, its Level1 → 가치 분류, an entry's kind of work → 활동, the site or
  project it is for → 구분지표; the hours → 계획시간, 실적시간, 계획 대비, 정규, 야근, 휴무, 휴일 근무, KPI 시간, KPI 비율,
  야근 비율, 야근 편차, 1인당 시간, 인원; the spans → 전월 누계, 당월, 연간 누계; a person's own work in a head's report →
  개인 업무. Next week's plan → 계획, its draft → 계획 초안, keeping it → 확정; a head's coaching on a plan line →
  코칭, its kind → 코칭 분류, the line it takes from the company's list → 피드백. The weekly report's tables → 계획 대비 실적, 분류별 시간, 야근 업무, 업무별 시간, 구분지표별 시간, its week
  `{month}월 {number}주차`, the 40-hour check → 40시간 계획 and 40시간 실적, each 완료 or 미달, a class over or under
  its plan → 130% 초과, 70% 미만 in the 판정 column, the row a table is drawn for → 대상; the monthly report's →
  월간 코칭, 월별 추이, KPI 집계, 통계, 조직장 의견 (현황, 대책, 해석, 개선활동 with 당초, 변경, 효과); a level of the
  classification below Level1 → `{n}단계`; the row heading of a table → 구분, its total → 합계. Exporting the
  workbook's input rows → 실적 내보내기. Never 레벨, 공수, 오버타임, F/B, 실적 시간 with a space.
- a milestone's conditions → 조건: 조건 충족, 조건 미충족, 완료 조건; an approver's rejection of them → 반려, with its 반려
  사유, as an approval document's; the approval forms it waits on → 결재 양식; who approves → 승인자. Never 거절 for it.
- one work handing something to another, or to a unit → 관계, its kinds 인계, 검수, 참조, 보고, 변경 요청, 업무 요청, sent
  as 보냄 and arrived as 받음; answered 인수, 반려, 통과, 조건부 통과, 완료 or 거절; how long it waited → 대기 {span}
  while it waits, 응답 경과 {span} once answered. A relation or minutes not yet sent or confirmed → 초안; minutes
  confirmed → 확정.
- the TODO items that carry a work, and the work's tab listing them → TODO, each item `#{number}` and its title;
  filing a new one for the work → 항목 만들기; linking one that stands by its number → 연결, its field 항목 번호;
  ending a link → 연결 해제, ended 연결 해제됨, with its 사유; its state as the TODO panel names it (결재 대기, 대기,
  진행 중, 보류, 완료, 병합됨), and dropped → 취소됨; how it came to carry the work → 여기서 만듦, 연결함, 병합으로 옮김,
  파생 항목; a work no item carries any more → 실행 항목 없음, one whose item is held → 항목 보류; keeping the work open
  past its items → 항목 완료 후에도 진행; an entry an item wrote → TODO 작성, `TODO #{item} 작성`. Never 캐리어, 운반,
  수행 항목, 버려짐.
- a meeting's record → 회의록, the action items it lists → 임무. A template a new work opens on → 템플릿, each standing
  by its own name in the pack (단기 업무, 단계·게이트 …).
- what a record belongs to, a unit, and the company a person belongs to → 소속: 소속, 소속 조직 구성원, 소속 회사가
  없습니다; a record that belongs to none shows 없음. Never 소속
  없음, and never 담당 or 담당자 for it, which is who keeps or approves a thing.
- the customers' voice box, where a person sends the platform's maker a word and the maker answers, its entry and its
  screen → 고객의 소리. Never 피드백, VOC, 의견함.
- one word a person sends there → 의견: 의견 보내기, 새 의견 보내기, 의견을 보냈습니다, 의견을 보내지 못했습니다; its
  kinds → 버그, a fault the sender met, and 건의, something the sender wants changed or added. Never 버그 리포트 or
  제안 on this screen. 의견 on 일정 관리 stays a reader's remark on a work, each on its own screen.
- its states → 접수, as it arrives, 검토 중, 완료 and 반려. 반려 is the same word an approval document and a job review
  take, and 접수 here is a word's arrival, not a handling unit taking an approval document; each on its own screen.
- the maker's word on a sent 의견 → 답변: 답변, 답변했습니다, 답변하지 못했습니다; the sender's word back on the same
  의견 → 추가 의견: 추가 의견 보내기, 추가 의견을 보냈습니다, 추가 의견을 보내지 못했습니다. Never 답글, 댓글 or 회신
  for either.
- **One screen speaks in one style.** A notice, a guidance line and an error end in 합니다 and
  했습니다 throughout; 어요 is never mixed into them.
- **No dash between words.** A range is written `{min}~{max}`; a caveat on a title stands on its
  own smaller line, or after a ` · `.

## The other languages

- Each line is `<the Korean UI word> → <English> / <Japanese> / <Simplified Chinese>`. Wherever the Korean writes a
  concept by its word, each translation writes it by the word named here; where the Korean word stands for
  something else — 공급자 is a provider, 서비스 워커 the browser's service worker, 항목 a form's field — the
  translation writes that thing by its own word.
- 감독관 → supervisor / スーパーバイザー / 主管.
- 에이전시 → agency / エージェンシー / 代理中心.
- 에이전트 → agent / エージェント / 智能体.
- 브레인 → Brain / ブレイン / Brain.
- 미결 → open issues / 未決事項 / 待决事项.
- 보류 → on hold / 保留 / 暂缓.
- 드래프트 → draft / 下書き / 草稿.
- 공급 → supply / 供給 / 供给; 공급자 → provider / プロバイダー / 提供商.
- 저장소 → repository / リポジトリ / 仓库.
- 워커 → worker / ワーカー / 工作器.
- 판정 → verdict / 判定 / 判定.
- 방 → room / ルーム / 房间.
- 대화 기록 (the record road) → Room record / 会話記録 / 对话记录.
- 항목 → item / 項目 / 条目.
- 조직장 → head / 組織長 / 负责人.
- 위임 사슬 → delegation chain / 委任チェーン / 委托链.
- 아티팩트 → artifact / アーティファクト / 制品.
- 인물 (the person an org memory is about) → person / 人物 / 人员.
- 전역 베이스 → global base / グローバルベース / 全局库.
- 스토어 → Store / ストア / 应用商店; 회수 → recall / 回収 / 收回; 복제 → clone / 複製 / 复制.
