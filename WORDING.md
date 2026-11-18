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
- spoiler (hidden message text) → 스포일러: 스포일러 표시, and its block folds by the in-place pair below.
  Never 가린 글, 숨김 글.
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
- one seat of a role, on one road → 에이전트: 에이전트, 에이전트 추가, 에이전트 없음. An agent that names no road →
  요청한 감독관을 따름; what it lays over its role's preset → 역할 위에 덮어쓰기; one that carries a run → 실행 중. Never
  자리, 인스턴스, 워커 for the seat.
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
  a name, nor 비서, 개인 감독관 or 전용 BMO. The person themselves calls it 내 BMO, and its settings section is 내 BMO.
- the names that call a BMO in a room → 부르는 이름: 부르는 이름, 부르는 이름 없음, 추가할 이름. Never 호출 이름, 웨이크
  워드, 별칭; 호출 stays the mention's never-word.
- a company's default for its people's BMOs → 기본 BMO; who may set their own BMO → BMO 설정 권한, each row 허용, 막음
  or 상위 조직 따름, a following row saying 상위 조직을 따라 허용 or 상위 조직을 따라 막음. Never 개인화 권한, 커스터마이즈.
- where a part of a BMO's profile came from → 직접 정함, 회사에서 정함; the deployment's own wears the default's mark,
  `BMO (기본값)`. How a BMO speaks and behaves, as text → 페르소나. Never 성격, 말투 설정, 프롬프트.
- a role's slot, one of the runs its agents let in at once → 역할 슬롯, 슬롯; a slot kept by a reservation → 예약, counted
  as `1 예약`. Never 자리, 칸, 풀.
- what an agent is doing now → 상태, its column's name: an agent with nothing going → 유휴; a supervisor answering in
  rooms → 답변 중; a run of a role's agent → the pack's word for the source that asked it (Job, 협업, 요청 …)
  and what it works on. Never 쉬는 중, 대기 or 비어 있음 for an idle agent: 대기 is a run waiting in its role's line.
- a repository the agency runs jobs in → 저장소: 저장소, 저장소 추가. Never 리포지토리, 레포, 워커 for the place.
- a supervisor's road, the one provider and model its turns go out on → 공급자 · 모델, its fields 공급자, 모델, 강도,
  생각 and 답변 상한; a session's compaction threshold → 압축 기준; keeping a prefix warm → 캐시 유지;
  a role's sessions kept or opened anew → 유지, 새로. Never 라우트, 라우팅, 우선순위 목록.
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
- what an agent left waiting for a room → 진행 중: a watch → 감시, a reminder → 알림.
- the answers one turn of a round wrote, before the one it went on with → 쓴 답, each opened by 받은 말 (words handed
  over) or 작업 알림 (the program's own notice); never 판, which reads as 판정.
- a round's record on its answer → 판정 기록: 판정 기록, 기록, 펼치기, 접기. The one press carrying the turn's
  brain, calls, drafts and judgement; its parts say 브레인, 툴 사용, 드래프트, 판정.
- a room's situation note → 상황: 상황, 방의 상황, 방의 상황 보기, 이 방의 지금 상황, 갱신, 상황 노트 없음. Never 현황,
  상태 노트, 컨텍스트 노트.
- the calendar → 캘린더 (the screen, and one calendar in it); an event → 일정, as in 내 일정, 조직 일정; a reminder → 알림; a recurrence → 반복.
- a date picker's paging buttons → 이전 달, 다음 달 among the days; 이전 연도, 다음 연도 among the months and on the
  outer pair; 이전 연도 범위, 다음 연도 범위 among a run of years. Never 지난달, 저번 달, 전년, 다음 해, 이전 연대.
- a select's list, the same on every screen → its search field 검색; nothing matching what was typed → 찾은 항목
  없음; a list holding nothing → 항목 없음, unless the screen's own word for its list is given here; a search the
  server refused → 검색하지 못했습니다; words typed that no choice holds, offered as a new value → "{value}" 추가.
  Never 검색어 입력, 결과 없음, 데이터 없음.
- a booking of a company's resource, and the act of making one → 예약: 예약, 새 예약, 내 예약, 예약 취소, 예약을
  취소할까요, 이 예약만, 반복 예약, 예약 {n}건, 예약 없음; the person who made it → 예약자. It is the same word a role's
  slot kept by a reservation takes (above), each on its own screen. Never 예매, 대여, 부킹, 신청.
- a thing a company books, a room or anything else → 자원: 자원, 자원 추가, 자원 없음, 자원이 없습니다; its fields →
  종류, 위치 (위치 없음 where none is set), 좌석 with its count `{n}석`, 승인 필요, 담당자; the company it is booked in →
  회사, the reader's own `{name} (내 회사)`. Never 리소스, 시설, 설비, 비품, and never 유형 or 타입 for its kind.
- taking a resource out of use, which cancels its standing bookings and has no way back → 삭제: 삭제, 자원을
  삭제할까요. Never 보관, which keeps a thing to be brought back by 복원.
- the people who approve a resource's bookings → 담당자: 담당자, 담당자 {names}, 이 자원의 담당자. Never 관리자, which
  names the administrator's screen, nor 승인자 or 책임자; and never 소속, which is what a thing belongs to (below).
- a booking that waits on a resource's 담당자 → 승인 필요 on the resource; a booking's state → 승인 대기 while it waits,
  예약됨 once it holds, 거부됨 once refused; the 담당자's acts → 승인, 거부, 승인되었습니다, 거부되었습니다, 예약을
  거부할까요, the pair the desktop app's pairing takes (below); why it was refused → 사유 (선택) as the field and
  `거부 사유: {reason}` where it is shown; the 담당자's tab of waiting bookings → 요청: 승인 대기 중인 요청이 없습니다.
  Never 허용, 거절, 반려, which stays a job review's word, nor 신청 for a booking that waits.
- the theater → 극장: 작품 (a title), 에피소드, 보관함 (the screen of titles), 내 극장, 조직 극장, 플레이리스트, 이어 보기,
  자막, 자막 굽기, 라이브러리 (a folder registered), 색인 and 재색인 (a scan), 업로드, 대사.
- turn into (a text block's kind) → 종류 변경: 종류 변경, 종류를 변경했습니다, 변경하지 못했습니다; the kinds it
  offers stand on their own words (본문, 제목 1, 글머리 목록, 인용, 코드 블록). Never 서식 변경, 스타일, 종류로
  바꾸기. 변환 is no form of it: that word stands only where a file's format is really converted, as an mp3
  conversion's run names itself.
- secret, a value a unit reads by its file name → 비밀; the console's store of them, each person's own → 비밀 보관함,
  and one's own → 내 비밀; putting a value in place of the one a name holds → 교체. Never 시크릿, 키 보관소, 개인 금고.
- the shape a secret is asked in → 비밀 종류; one of its fields → 항목, its key 키 and its label 이름; fields put
  together by hand → 직접 구성; a field whose value is drawn as dots → 값 숨김; how a field is typed → 입력 (한 줄,
  여러 줄, 파일); an agent asking for a secret → 비밀 요청, and one answered → 저장됨. Never 필드, 마스킹, 템플릿.
- a payment card kept as a secret → 카드: 카드 번호, 유효기간, CVC, 소유자 이름. Never 신용카드 for the kind, 만료일,
  보안 코드, 명의자.
- where a parcel is sent → 배송지: 받는 사람, 전화번호, 우편번호, 주소, 상세 주소. Never 수령인, 수취인, 연락처 for the
  number, 상세주소.
- the secrets the agency's provider tools read, each chosen by name → 공급자 비밀: 공급자 비밀, `<provider>` 결제 카드,
  `<provider>` 로그인 for the account it signs in with, `{kind}` 종류 비밀, 없음 for none. Never 시크릿 설정, 연결된 비밀.
- retire, take down → 보관; bringing one back → 복원. Switching a piece in or out of use → 켜기, 끄기.
  Never 내리기, 올리기.
- fold (a work order) → 종료. 접기 is only ever a panel folding away, and is written as below.
- file, stand up (an item) → 만들기: 항목 만들기, 만든 항목, 만들지 못했습니다. Never 세우기, 올리기.
- ask (a job's question) → 질문, 질문하다: Job의 질문. Never 물다, 물어본 것, 묻기.
- download → 다운로드: 다운로드, {name} 다운로드, 다운로드 주소. Never 내려받기. This is the owner's own choice of
  the word.
- volume → 볼륨; mute, unmute → 음소거, 음소거 해제: 음소거됨, 음소거 해제됨, 볼륨 {n}%.
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
- the console's desktop app → 데스크톱 앱; its pairing with an account → 앱 연결: 앱 연결, 연결 코드, 승인, 거부,
  승인했습니다, 거부했습니다, 연결하는 중, 연결됨. The app's own window → 앱 창, and the line at its top that shows the
  code → 제목 표시줄, as Windows names it. Never 데스크탑, 페어링, 허용 or 거절, nor 타이틀 바 or 창 제목.
- the app's download page → 데스크톱 앱: a version published → 버전, when it was → 공개일, none yet → 공개된 버전 없음;
  an installer → 설치 파일, or its format's own name, AppImage, deb 패키지; a file's size → 크기, written `{size}
  ({bytes}바이트)`; its digest → SHA-256; the steps of using it → 사용 방법. A warning Windows shows is named by the
  words Windows itself shows: Windows의 PC 보호, 추가 정보, 실행. Never 인스톨러, 셋업 파일, 릴리스, 배포일 or 해시값.
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
- table → 테이블; row → 행; query → 쿼리, wherever the text is about a database. Never 표, 줄, 질의.
- default → 기본값, standing only as the mark after the default value (above). Never 처음 값.
- a value that is not set, standing alone in a table's cell or in a name and value list → `—`, the dash alone, as every
  table of the console writes it; a moment that was never recorded → 기록 없음. The dash never stands between words, at
  the end of a line of words or in a sentence: a line of words leaves out a part it does not have. Never 미설정, N/A or
  a hyphen for an empty cell.
- section → 섹션. Never 구역.
- organisation → 조직: 조직, 같은 조직, 조직 이름. Never 단체, 기관.
- an organisation unit, one of the tree a deployment's people stand in → 조직: 조직 추가, 상위 조직, 하위 조직; the
  tree of them → 조직도; a unit at the tree's top → 회사, a new one 새 회사. Never 단위, the English unit's twin.
- a unit's head → 조직장: 조직장 지정, 조직장 해제. Never 장 alone, 책임자.
- the people of a room, the accounts let into it and the people its chat service reads → 대화상대: 대화상대,
  대화상대 없음, 대화상대를 불러오지 못했습니다. Never 멤버, 참여자, 인원, and never 구성원, which is a unit's people; a
  member the account service knows as an account → 콘솔 사용자.
- whether a person is reachable now → 접속 상태: 온라인, 자리 비움, and for one who is not here the last moment seen,
  최근 접속 {time} 전; several people's → 온라인 {n}명; the account's switch to show it → 접속 상태 공개. Nobody is
  ever written offline: one who is not here is drawn as nothing. Never 접속 중, 부재 중, 마지막 접속, which stays the
  users tab's never-word for a sign-in.
- somebody writing in a room now → 입력 중: 입력 중… after the writers' faces, and every writer named before it,
  `{names} 입력 중…`, the names joined by a comma; a writer the room names nobody for is 누군가 among them. Never
  타이핑 중, 작성 중, 쓰는 중, and never a count of people in place of their names.
- letting an account into a room → 대화상대 추가: 대화상대 추가, 추가했습니다, 추가하지 못했습니다; several people at once
  → `{name}님 외 {n}명을 대화상대로 추가했습니다`, an organisation's people → `{unit}을(를) 대화상대로 추가했습니다`, the particle the name's last sound takes; the
  picker's field that finds both → 사람·조직, 이름이나 조직으로 찾기. Never 초대, which is the link that makes an account,
  nor 들이기, 입장, and never 일괄 추가 or 단체 초대 for letting several in.
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
  platform itself (providers, secret kinds) → 관리자; the dialog of what a person sets for themselves → 설정. Never
  조직 설정 or 관리자 설정.
- the sidebar's sections of screens: what the administrator keeps the deployment running with → 관리자 서비스;
  every other screen → 애플리케이션. Never 앱, 어플리케이션, 관리 서비스 or 관리자 메뉴. 관리자 alone stays the name
  of the administrator's screen above.
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
- the rest of a list a line leaves unshown → 외 {n}: `Claude Code 외 2`. Never 그 밖에, +{n}.
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
- set a TODO item aside → 보류, taking the hold back → 보류 해제: 보류, 보류 해제, 보류 사유, 보류 항목. The act and the
  state mark are the same word, and a held item's menu shows 보류 해제 in place of 보류. Never 보류 풀기, 재개, 대기로 돌리기
  for the release; 재개 stays a stopped work order's own word.
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
  참조함; a unit's 완료함, 수신함, 참조함. Never 받은편지함, 대기열.
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
- the record of changes to a person's place → 이력: 이력 없음. Never 히스토리, 로그, 발령 내역.
- a project's work on the projects screen → 단계 (a stage) and 게이트 (what ends it); an approver's rejection of a gate →
  반려, with its 반려 사유, as an approval document's; the approval forms a gate waits on → 결재 양식; a task → 임무, its
  due date → 기한, `{n}일 남음` while it is still to come, 오늘 마감 on the day, 기한 지남 once past; a project's planned
  period → 계획 기간, its 시작일 and 종료일; a progress entry → 진척, its share → 진척률, its outlook → 전망, with 순조,
  주의, 위험; a recurring stage's reporting period → 보고 주기, with 매주, 매월, 분기마다, 반기마다, the project it reports
  to → 보고 대상, and a period that ended with no report → 보고 누락 {n}건; one project asking another, or a unit, for
  work → 업무 요청, answered 인수, 거절, then 완료; a report waiting for its unit's head to send it → 초안; how long a
  relation waited → 대기 {span} while it waits, 응답 경과 {span} once answered. Never 거절 for a gate's rejection,
  마감일 or 데드라인 for a due date, 진행률 for 진척률.
- what a board or a record belongs to, a unit or a project, and the company a person belongs to → 소속: 소속, 보드
  소속, 소속 조직 구성원, 소속 회사가 없습니다; a board or a record that belongs to none shows 없음. Never 소속
  없음, and never 담당 or 담당자 for it, which is who keeps or approves a thing.
- **One screen speaks in one style.** A notice, a guidance line and an error end in 합니다 and
  했습니다 throughout; 어요 is never mixed into them.
- **No dash between words.** A range is written `{min}~{max}`; a caveat on a title stands on its
  own smaller line, or after a ` · `.
