#!/bin/bash
# Text Motion 실행 — Finder에서 더블클릭하면 됨.
cd "$(dirname "$0")"

# 시스템 npm 캐시(~/.npm)가 권한 문제로 막혀 있어도 설치되도록 전용 캐시 폴더 사용
export npm_config_cache="$HOME/.npm-text-motion"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js가 없어. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해줘."
  echo "(또는 터미널에서: brew install node)"
  read -n 1 -s -r -p "아무 키를 누르면 닫혀."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "첫 실행: 필요한 패키지와 렌더용 Chromium을 내려받는 중 (1~3분)…"
  if ! npm install; then
    echo
    echo "설치 실패."
    echo "npm 캐시 권한 오류(EACCES / EEXIST ~/.npm)가 보이면 터미널에서 아래 한 줄을 실행한 뒤 다시 더블클릭:"
    echo "    sudo chown -R \$(whoami) ~/.npm"
    echo "그 외에는 인터넷 연결을 확인해줘."
    read -n 1 -s -r -p "아무 키를 누르면 닫혀."
    exit 1
  fi
fi

PORT=${PORT:-5173}
( sleep 1.5; open "http://localhost:$PORT" ) &
echo "브라우저가 열려. 끝낼 땐 이 창을 닫거나 Ctrl+C."
# server.js 가 업데이트되면 서버가 코드 75로 종료 → 자동으로 다시 시작
while true; do
  node server.js; code=$?
  [ "$code" -eq 75 ] || break
done
