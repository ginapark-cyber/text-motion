# Rollout Text Animation (text-motion)

> **For developers taking this over** — start here.
>
> - **Live (team is using it):** https://text-motion-production.up.railway.app (Railway trial, FHD only)
> - **Source:** https://github.com/ginapark-cyber/text-motion (private; ask Soyoung for access)
> - **Hosting / moving to another server:** see [`DEPLOY.md`](DEPLOY.md). Ships with a `Dockerfile` (Node 22 + Playwright Chromium + ffmpeg). Any Docker host works; needs ~2 GB RAM for 4K renders, a writable volume for `/data`, and nothing else (no DB, no auth).
> - **What it is:** ~1,800 lines of vanilla HTML/JS + one Express server. The browser previews an effect; the server re-renders the same page frame-by-frame in headless Chromium and pipes the PNGs into ffmpeg to produce a ProRes 4444 `.mov` with alpha.
> - **Where things live:** `server.js` (serving + `/api/export` render), `public/engine.js` (timeline), `public/effects/*.js` (one file per effect), `public/index.html` (UI), `public/stage.html` (render page).

---

텍스트 모션 프리셋을 브라우저에서 편집하고, 배경 없는 ProRes 4444 `.mov`(알파 포함)로 바로 뽑는 툴. 로컬(Mac)에서도, 서버(Docker)에서도 같은 코드로 돌아감.

## 실행

1. Node.js가 없으면 https://nodejs.org 에서 LTS 설치 (한 번만)
2. `start.command` 더블클릭
   - 처음엔 패키지와 렌더용 Chromium을 내려받아서 1~3분 걸림
   - "확인되지 않은 개발자" 경고가 뜨면: 우클릭 → 열기. 또는 터미널에서 `chmod +x start.command`
3. 브라우저에 http://localhost:5173 이 열림

터미널로 하려면: `npm install` 한 번, 이후 `npm start`.

## 사용

- 시작 화면: 효과 갤러리 — 카드마다 현재 텍스트로 미리보기가 반복 재생됨. 카드를 클릭하면 편집 화면으로, 헤더의 **‹ Effects** 로 다시 갤러리로
- 왼쪽: 텍스트, 서체(패밀리·스타일), 크기, 색, 위치(정렬·상하)
- 가운데: 미리보기. 스페이스바 재생/정지, 슬라이더로 스크럽. 배경 토글은 확인용이고 내보내기엔 영향 없음
- 오른쪽: 출력 크기, 파일명, 내보내기, 효과 기본 설정
- 왼쪽 **Exit**: Reverse out 을 고르면 등장 효과가 끝나고 Hold 만큼 머문 뒤 **같은 효과를 거꾸로 재생**하며 사라짐 (모든 효과 공통). Advanced 에서 사라지는 속도 조절
- 헤더 **Advanced** 를 켜면 여백·타이포·타이밍·fps·형식·효과 세부 파라미터가 전부 보임 (평소엔 숨김)
- 기본 출력은 4K(3840×2160). 모든 크기 값은 FHD 기준으로 정해져 있고 출력 해상도에 맞게 자동 확대되므로 FHD/4K 어느 쪽으로 뽑아도 화면 구성은 같음
- 결과물은 `exports/` 폴더에 저장. 파일명은 `텍스트_효과_크기_fps_id.mov`
- 마지막 설정은 브라우저에 자동 저장됨

형식
- **ProRes 4444 (.mov)** — 알파 포함. Premiere/AE/Final Cut에 그대로 올리면 배경 투명
- **PNG 시퀀스** — 알파 포함 프레임 폴더. AE에서 시퀀스로 임포트
- **H.264 (.mp4)** — 검정 배경, 빠른 확인·공유용

## 효과 추가

`public/effects/` 에 `.js` 파일을 하나 추가하면 끝 (파일명 숫자 순으로 목록에 뜸, 새로고침만 하면 됨).
`_template.js.txt` 를 복사해서 시작. 규칙은 그 파일 상단 주석 참고.

핵심은 `render(state, t)` 가 시간 `t` 만 보고 결정적으로 그리는 것 — 그래야 미리보기와 내보낸 mov가 프레임 단위로 똑같음.

### 들어있는 효과

텍스트: Decoder fade in · Fade up characters · Word by word · Word by word fade · Word by word fall · Opacity flicker in · Opacity flicker in (soft) · Opacity flicker in (soft) fall · Blur flicker in · Rise by word · Glow pop · Slide in (motion blur) · Typewriter · Typewriter rise · Typewriter block rise · Typewriter block fall
그래픽 (텍스트 무시, 색상·타이밍·효과 설정만 적용): Logo roll

`kind: 'graphic'` 을 붙이면 텍스트 박스 대신 전체 화면 레이어(`ctx.layer`, `ctx.width/height`)에 그림.
이미지 등 로딩이 필요하면 `state.ready` 에 Promise 를 넣으면 내보내기 전에 기다려줌.

### 로고 롤 로고 바꾸기

왼쪽 **Logos** 패널에서 관리:
- PNG/JPG/SVG 를 드래그해서 추가 → 흰색/검정 배경은 자동으로 지워지고 로고 영역만 잘라서 `public/assets/logos/` 에 저장
- 체크 = 롤에 포함, ▲▼ = 순서, × = 파일 삭제
- **Color**: Original / All white / All black / Color picker(왼쪽 Color 값)
- **Size matching**: Visual mass(기본, 넓은 워드마크와 정사각 심볼이 비슷한 덩어리로 보이게) / Same width / Same height, 크기는 **Logo size** 로

## 폰트 추가

`public/fonts/` 에 `.ttf` / `.otf` / `.woff2` 를 넣으면 서체 목록에 뜸.
파일명에서 `-` 나 `[` 앞까지가 패밀리명 (`Pretendard-Bold.otf` → Pretendard, `Archivo[wdth,wght].ttf` → Archivo).
`Italic` 이 들어가면 이탤릭으로, `[..]` 나 `Variable` 이 들어가면 가변 폰트로 인식.

## 문제가 생기면

- 화면 왼쪽 위에 "server is running an older version" 배너가 뜨면: 터미널에서 Ctrl+C 후 `start.command` 다시 실행 (이후 업데이트부터는 server.js 가 바뀌면 자동 재시작됨)

- ffmpeg 오류: `brew install ffmpeg` 후 다시 실행 (번들 ffmpeg 다운로드가 실패했을 때)
- 포트 충돌: `PORT=5200 npm start`
- 4K 30fps 기준 1초 분량 렌더에 대략 5~10초 걸림. 확인은 FHD로 하고 최종만 4K로 뽑는 게 빠름
