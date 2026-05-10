# AI Browser MVP

Electron + React 기반의 AI 통합 브라우저입니다. 여러 AI 서비스를 하나의 데스크톱 앱에서 편리하게 사용할 수 있습니다.

## 주요 기능

- **통합 브라우저**: 왼쪽 사이드바에서 여러 AI 서비스 간 빠른 전환
- **화면 분할 (Split View)**: 두 개의 AI 서비스를 동시에 좌우로 나란히 사용
- **외부 브라우저 연동**: 🌐 버튼으로 시스템 기본 브라우저에서 열기 (Google 로그인 문제 해결)
- **드래그 리사이징**: 분할된 화면 비율을 자유롭게 조절
- **로그인 세션 유지**: 각 AI 서비스별 독립적인 세션 관리 (partition)
- **커스텀 AI 서비스 추가**: 설정에서 새로운 AI 서비스를 자유롭게 추가/삭제
- **다크모드 UI**: 눈이 편안한 다크 테마
- **보안**: Node integration 비활성화, preload를 통한 안전한 API 노출

## 기본 제공 AI 서비스

- **ChatGPT** (https://chatgpt.com) ⚠️ _Google 로그인 제한_
- **Claude** (https://claude.ai)
- **Gemini** (https://gemini.google.com)
- **Perplexity** (https://www.perplexity.ai)
- **Copilot** (https://copilot.microsoft.com)

### ChatGPT Google 로그인 제한 안내

**중요**: ChatGPT는 Electron 내장 브라우저에서 Google OAuth 로그인을 정책상 차단합니다. 이는 Google의 보안 정책이며 우회할 수 없습니다.

**해결 방법**:
1. **외부 브라우저 열기** (권장): 🌐 버튼 클릭 → Chrome/Safari에서 로그인
2. **이메일/비밀번호 로그인**: ChatGPT에서 직접 계정 생성 후 이메일 로그인
3. 앱 내에서는 이메일 로그인만 사용 가능

사이드바에서 ChatGPT 옆에 ⚠️ 배지가 표시됩니다.

## 설치 방법

### 1. 의존성 설치

```bash
cd ai-browser-mvp
npm install
```

## 실행 방법

### 개발 모드

```bash
npm run electron:dev
```

이 명령어는 다음을 수행합니다:
1. Vite 개발 서버 시작 (http://localhost:5173)
2. Electron 앱 실행

### 프로덕션 빌드

```bash
npm run electron:build
```

빌드된 앱은 `release` 디렉토리에 생성됩니다.

## 프로젝트 구조

```
ai-browser-mvp/
├── electron/              # Electron 메인 프로세스
│   ├── main.ts           # 앱 초기화, 윈도우 생성, IPC 핸들러
│   └── preload.ts        # Renderer와 Main 간 안전한 API 브릿지
├── src/                  # React 앱
│   ├── components/
│   │   ├── Sidebar.tsx       # 왼쪽 사이드바 (AI 서비스 목록, L/R 표시)
│   │   ├── Topbar.tsx        # 상단 바 (Split View 버튼, AI 정보 표시)
│   │   ├── BrowserView.tsx   # 단일 브라우저 영역 (webview)
│   │   ├── SplitView.tsx     # 분할 브라우저 영역 (좌우 webview + 리사이저)
│   │   ├── Settings.tsx      # 설정 화면
│   │   └── *.css             # 컴포넌트별 스타일
│   ├── features/
│   │   └── apiCompare/       # API 비교 기능 (향후 확장용)
│   ├── App.tsx           # 메인 앱 컴포넌트 (상태 관리, 레이아웃)
│   ├── main.tsx          # React 엔트리 포인트
│   └── types.ts          # TypeScript 타입 정의
├── index.html
├── package.json
├── tsconfig.json         # React용 TypeScript 설정
├── tsconfig.electron.json # Electron용 TypeScript 설정
├── vite.config.ts
└── README.md
```

## 사용 방법

### 1. AI 서비스 선택
- 왼쪽 사이드바에서 원하는 AI 서비스 클릭
- 중앙 브라우저 영역에 해당 서비스가 로드됩니다

### 2. 로그인
- 각 AI 서비스에 직접 로그인하세요
- 로그인 세션은 앱을 닫아도 유지됩니다 (partition 기반 세션 관리)

#### 로그인 안내:
- 각 webview 상단에 로그인 안내 문구가 표시됩니다
- **Google 로그인 차단 시**:
  1. **🌐 외부 브라우저 열기** 버튼 클릭 (가장 쉬움)
  2. 또는 이메일/비밀번호 로그인 사용
- **권장**: 외부 브라우저로 열어서 Google 로그인 후 다시 앱에서 사용

#### 헤더 버튼:
- **🌐 외부 브라우저 열기**: 시스템 기본 브라우저에서 현재 AI 서비스 열기
  - Google 로그인이 정상 작동합니다
  - 로그인 후 앱으로 돌아와 사용 가능
- **🔄 새로고침**: 현재 webview 새로고침
  - 로그인 문제 발생 시 새로고침으로 해결되는 경우가 있습니다
- **위치**:
  - **단일 화면**: 상단 헤더 우측
  - **분할 화면**: 각 패널 헤더 우측

### 3. Split View (화면 분할) 사용하기
Split View를 사용하면 두 개의 AI 서비스를 동시에 좌우로 나란히 볼 수 있습니다.

#### Split View 켜기:
1. 상단 우측의 **⬛⬛ Split** 버튼 클릭
2. 화면이 좌우로 분할됩니다
3. 사이드바 헤더에 **L** (Left), **R** (Right) 표시가 나타납니다

#### Split View에서 AI 선택:
1. 좌측 또는 우측 화면을 클릭하여 활성 영역 선택
   - 활성 영역은 테두리로 표시됩니다
   - 사이드바의 **L/R** 표시가 활성 영역을 나타냅니다
2. 사이드바에서 AI 서비스 클릭
3. 선택한 AI가 활성 영역에 로드됩니다

#### 패널 헤더:
각 패널 상단에 다음이 표시됩니다:
- **AI 아이콘과 이름**: 현재 선택된 AI 서비스
- **새로고침 버튼(🔄)**: 해당 패널만 개별적으로 새로고침
- **로그인 안내**: Google 로그인 차단 시 이메일 로그인 사용 안내

#### 화면 비율 조절:
- 중앙의 구분선을 드래그하여 좌우 비율 조절
- 최소 20%, 최대 80%까지 조절 가능

#### Split View 끄기:
- 상단 우측의 **⬜ Single** 버튼 클릭
- 단일 화면으로 돌아갑니다

#### 사용 예시:
- **ChatGPT**와 **Claude**를 동시에 열어 같은 질문에 대한 응답 비교
- **Gemini**로 검색하면서 **Perplexity**로 팩트 체크
- 한쪽에서 코드 작성, 다른 쪽에서 문서 참조

### 4. Settings 화면 열기
- 왼쪽 사이드바 하단의 **⚙️ Settings** 버튼 클릭
- Settings 화면이 중앙 영역에 표시됩니다
- **중요**: 이것은 앱 자체 설정 화면이며, AI 웹사이트 내부 설정과 별개입니다

### 5. 커스텀 AI 서비스 추가
1. Settings 화면에서 **"+ Add Service"** 버튼 클릭
2. 다음 정보 입력:
   - **Name**: 서비스 이름 (예: DeepSeek, Mistral AI)
   - **URL**: 서비스 URL (예: https://chat.deepseek.com)
   - **Icon**: 이모지 (예: 🌟, 🚀) - 비워두면 기본 아이콘 사용
3. **"Add Service"** 버튼으로 추가 완료
4. 추가된 서비스가 즉시 사이드바에 표시됩니다

### 6. AI 서비스 관리
- **활성화/비활성화**: Settings에서 "Enabled/Disabled" 토글
  - Disabled로 설정하면 사이드바에서 숨겨집니다
- **삭제**: Settings에서 "Delete" 버튼 클릭
  - 삭제 전 확인 메시지가 표시됩니다
- **데이터 저장**: 모든 변경사항은 자동으로 저장되며 앱 재시작 후에도 유지됩니다

## 기술 스택

- **Electron**: 데스크톱 앱 프레임워크
- **React 18**: UI 라이브러리
- **TypeScript**: 타입 안정성
- **Vite**: 빠른 개발 환경
- **electron-store**: 로컬 데이터 저장

## 보안

- **Node Integration 비활성화**: Renderer 프로세스에서 Node.js 직접 접근 불가
- **Context Isolation**: Renderer와 Main 프로세스 완전 분리
- **Preload 스크립트**: 필요한 API만 선택적으로 노출
- **Webview Partition**: 각 AI 서비스별 독립적인 세션 관리

## 향후 확장 가능한 기능

### 1. API 비교 모드 (`src/features/apiCompare/`)
현재 Split View는 웹 기반 UI를 좌우로 나란히 보여줍니다. 향후 API 비교 모드는 다음과 같이 확장 가능합니다:

- **Split View와 통합**: Split View 구조를 활용하여 API 응답을 시각화
- **API 직접 호출**: 각 AI 서비스의 API를 직접 호출하여 응답 수집
- **통합 프롬프트 입력**: 한 번에 여러 AI에 동일한 프롬프트 전송
- **응답 비교 분석**:
  - 응답 속도 측정
  - 응답 품질 평가
  - 토큰 사용량 비교
  - 비용 계산
- **API 키 관리**: 안전한 API 키 저장 및 관리
- **결과 내보내기**: JSON, Markdown, CSV 형식으로 내보내기

**구현 계획**:
- Split View의 resizable layout 재사용
- API 클라이언트 모듈 추가 (OpenAI, Anthropic, Google AI 등)
- 새로운 `CompareMode` 컴포넌트 생성
- Topbar에 "API Compare" 모드 토글 추가

### 2. 북마크/히스토리
- 자주 사용하는 대화 북마크
- 대화 히스토리 저장 및 검색

### 3. 단축키
- 빠른 AI 전환 (Cmd+1, Cmd+2, ...)
- 새 대화 시작 (Cmd+N)

### 4. 테마 커스터마이징
- 라이트 모드 지원
- 커스텀 컬러 테마

### 5. 멀티 윈도우 (현재는 Split View로 구현됨)
- ✅ **완료**: Split View로 2개의 AI를 좌우로 나란히 표시
- 향후: 3개 이상의 AI를 동시에 보는 그리드 레이아웃
- 향후: 별도의 Electron 윈도우로 분리하여 멀티 모니터 지원

### 6. 플러그인 시스템
- 커스텀 기능 추가
- 자동 응답 저장
- 프롬프트 템플릿 관리

## 문제 해결

### ChatGPT Google 로그인 차단 문제 ⚠️

**문제**: ChatGPT에서 Google 계정으로 로그인 시 "This browser or app may not be secure" 오류가 발생합니다.

**이유**: Google은 Electron 기반 앱을 안전하지 않은 브라우저로 분류하여 OAuth 로그인을 **정책상 차단**합니다. 이는 Google의 보안 정책이며, 기술적으로 우회할 수 없습니다.

**ChatGPT 전용 표시**:
- 사이드바에서 ChatGPT 옆에 **⚠️ 로그인 제한** 배지가 표시됩니다
- 각 webview 상단에 명확한 안내 문구가 표시됩니다:
  > `ℹ️ ChatGPT Google 로그인은 앱 내부에서 차단될 수 있습니다. 이메일/비밀번호 로그인 또는 외부 브라우저 열기를 사용하세요.`

**해결 방법**:

#### 1. 외부 브라우저에서 열기 (가장 쉬움) ✨ NEW
각 패널 헤더의 **🌐 버튼**을 클릭하여 시스템 기본 브라우저에서 열기:
1. 단일 화면 또는 분할 화면에서 **🌐 버튼** 클릭
2. Chrome, Safari 등 기본 브라우저가 자동으로 열립니다
3. 외부 브라우저에서 로그인 완료
4. (선택) AI Browser 앱으로 돌아와서 **🔄 새로고침** 클릭

**장점**: Google OAuth가 정상 작동하며, 가장 편리한 방법입니다.

#### 2. 이메일/비밀번호 로그인 사용 (권장)
각 AI 서비스에서 직접 계정을 생성하고 이메일/비밀번호로 로그인:
- **ChatGPT**: https://chatgpt.com → "Sign up" → 이메일로 계정 생성
- **Claude**: https://claude.ai → "Create account" → 이메일로 계정 생성
- **Gemini**: Google 계정 필요 (방법 1 또는 3 사용)

#### 3. 웹 브라우저에서 먼저 로그인 후 세션 동기화
1. 일반 웹 브라우저(Chrome, Safari 등)에서 해당 서비스에 로그인
2. AI Browser 앱으로 돌아와서 **새로고침 버튼(🔄)** 클릭
3. 브라우저의 세션이 동기화되어 로그인 상태가 유지될 수 있습니다 (경우에 따라 작동)

#### 4. API 키 사용 (향후 기능)
향후 API 비교 모드에서는 API 키를 직접 사용하여 웹 로그인 없이 AI 서비스를 이용할 수 있습니다.

**안내 문구**:
앱 내에서 각 webview 상단에 다음 안내가 표시됩니다:
- **ChatGPT**: `ℹ️ ChatGPT Google 로그인은 앱 내부에서 차단될 수 있습니다. 이메일/비밀번호 로그인 또는 외부 브라우저 열기를 사용하세요.`
- **일반 AI**: `ℹ️ Google 로그인이 차단되는 경우, 이메일/비밀번호 로그인을 사용하거나 외부 브라우저에서 먼저 로그인하세요.`

**버튼 가이드**:
- **🌐 외부 브라우저 열기**: 시스템 기본 브라우저에서 현재 AI 서비스 열기
- **🔄 새로고침**: 현재 webview 새로고침
- **단일 화면**: 상단 헤더 우측에 두 버튼 모두 표시
- **분할 화면**: 각 패널 헤더 우측에 두 버튼 모두 표시

**사이드바 배지**:
- **⚠️ 로그인 제한**: ChatGPT 옆에 표시되며, Google 로그인이 제한됨을 나타냅니다
- 배지에 마우스를 올리면 "Google 로그인 제한" 툴팁이 표시됩니다
- 다른 AI 서비스(Claude, Gemini 등)에는 배지가 표시되지 않습니다

### Webview가 로드되지 않는 경우
- Electron의 webview 지원이 활성화되어 있는지 확인: `webviewTag: true`
- 각 서비스의 CSP(Content Security Policy)에 따라 일부 사이트는 iframe/webview 로드를 차단할 수 있습니다

### 세션이 유지되지 않는 경우
- `persist:` prefix가 partition에 포함되어 있는지 확인
- electron-store가 정상적으로 설치되었는지 확인

### 개발 모드에서 Hot Reload가 작동하지 않는 경우
- Vite 서버가 정상적으로 실행 중인지 확인 (http://localhost:5173)
- `concurrently`와 `wait-on`이 설치되어 있는지 확인

### DevTools 열기
DevTools는 기본적으로 닫혀 있습니다. 필요시 다음 단축키로 열 수 있습니다:
- **Mac**: `Cmd + Option + I`
- **Windows/Linux**: `Ctrl + Shift + I` 또는 `F12`

## 라이선스

MIT

## 기여

이슈와 PR은 언제나 환영합니다!
