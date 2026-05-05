# Local App Launcher

이 문서는 터미널을 잘 모르는 사용자가 Maria Story Planner를 앱처럼 실행하기 위한 절차다. 실제 앱은 로컬 Node 서버를 띄운 뒤 브라우저를 앱 창으로 여는 방식이다. LLM API key는 `.env`에만 있고 브라우저로 전달되지 않는다.

## Installer

Finder에서 repo 폴더의 `Install Maria Story Planner.command`를 더블클릭하면 설치가 진행된다.

설치기는 다음 작업을 수행한다.

- Node.js 20.6 이상 확인
- Node.js가 없거나 너무 오래되었으면 Homebrew 또는 nodejs.org 공식 `.pkg`로 설치 시도
- `~/Applications/Maria Story Planner`에 설치본 생성
- `.env` 복사
- 의존성 설치와 production build 실행
- `Maria Story Planner.app` 생성
- Desktop에 `Maria Story Planner.app` 바로가기 생성

재설치할 때 기존 설치본의 `storage/`는 보존된다.

Node.js 공식 `.pkg` 설치 경로를 사용하는 경우 macOS 비밀번호 입력이 필요할 수 있다.

터미널에서 직접 실행하려면:

```bash
npm run install:mac
```

## Manual One-Time Setup

개발자가 한 번만 실행한다.

```bash
cd /Users/jaeheemacbook/Desktop/maria-story-planner
npm ci
npm run app:mac
```

그러면 repo 루트에 `Maria Story Planner.app`이 생성된다.

## Daily Use

1. Finder에서 `Maria Story Planner.app`을 더블클릭한다.
2. 앱 창이 열리면 그대로 사용한다.
3. 사용을 마치면 실행 중인 앱/터미널 창을 종료한다.

Google Chrome이 설치되어 있으면 독립 앱 창으로 열리고, 없으면 기본 브라우저로 열린다.

## Command-Line Fallback

앱 번들이 열리지 않을 때는 repo 폴더에서 다음 명령을 실행한다.

```bash
npm run app
```

## Notes

- `.env`는 Git에 커밋하지 않는다.
- 처음 실행 시 `dist/`가 없으면 자동으로 production build를 만든다.
- `node_modules/`가 없으면 자동으로 `npm ci`를 실행한다.
- 기본 주소는 `http://127.0.0.1:8765`다.
