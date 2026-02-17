<div align="center">

# 통합알람감시체계

### Unified Alarm Monitoring System

레이더 / 전송로 / UPS / 온습도 — 실시간 시설 감시 대시보드

[![Next.js](https://img.shields.io/badge/Next.js_16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![WebSocket](https://img.shields.io/badge/WebSocket-010101?style=flat-square&logo=socketdotio&logoColor=white)](https://github.com/websockets/ws)

</div>

---

## 개요

항공관제 시설의 장비 상태, UPS 전원 시스템, 온습도 센서를 실시간으로 감시하는 대시보드입니다. 장애 발생 시 브라우저 오디오 및 물리 사이렌을 통해 즉시 알람을 발생시킵니다.

**관제실 1920x1080 디스플레이** 및 **Raspberry Pi 7인치 디스플레이(800x480)** 에 최적화된 다크 모드 전용 UI를 제공합니다.

## 주요 기능

| 기능 | 설명 |
|------|------|
| **실시간 감시** | WebSocket 기반 즉시 상태 업데이트, 자동 재연결 |
| **3가지 시스템 유형** | 장비(패턴 기반), UPS(다중 메트릭), 센서(임계값 기반) |
| **알람 관리** | 자동 생성/해제, acknowledge, 심각도 구분, 이력 로그 |
| **오디오 알림** | 시스템/메트릭별 커스텀 브라우저 오디오 |
| **물리 사이렌** | TCP/UDP 사이렌 제어 (상태 기반, 재시작 시 자동 복구) |
| **스파이크 필터** | MAD 기반 이상치 탐지 (센서 데이터 안정화) |
| **커스텀 파서** | 비표준 데이터용 샌드박스 JavaScript (vm.Script) |
| **기능 토글** | 온습도 / UPS / 게이트 감시 런타임 ON/OFF |
| **컴팩트 모드** | Raspberry Pi 7인치 디스플레이 자동 최적화 |

## 상태 표시

```
🟢 정상   #22c55e     🟡 경고   #eab308     🔴 장애   #ef4444     ⚫ 오프라인  #71717a
```

## 아키텍처

```
UDP/TCP 데이터 → Worker 프로세스 (src/worker/)
                    ├── 데이터 파싱 (패턴 / 구분자 / 커스텀 코드)
                    ├── 스파이크 필터 (센서, MAD 기반)
                    ├── 임계값 평가 (조건 / 패턴 매칭)
                    ├── SQLite 업데이트 (Prisma ORM)
                    ├── 알람 트리거 및 사이렌 상태 동기화
                    └── WebSocket 브로드캐스트 (:7778)
                              ↓
                    RealtimeProvider (React Context)
                              ↓
                    대시보드 컴포넌트 (즉시 렌더링)
                              ↓
                    AudioAlertManager (상태 기반 브라우저 오디오)
```

두 개의 프로세스로 운영됩니다:

| 프로세스 | 포트 | 역할 |
|----------|------|------|
| **대시보드** | 7777 | Next.js 웹 UI |
| **Worker** | 7778 | 데이터 수집, 알람 처리, WebSocket 브로드캐스트 |

### Worker 시작 순서

1. UDP/TCP 리스너 시작
2. WebSocket 서버 시작 (포트 7778)
3. 오프라인 감지 시작 (10초 주기, **5분** 타임아웃)
4. 히스토리 정리 (25시간 보관, 매시간 실행)
5. 사이렌 상태 동기화 (미해결 크리티컬 알람 존재 시 활성화)
6. 오프라인 알람 동기화 (기동 전 오프라인 시스템에 대한 알람 생성)

**Graceful shutdown:** 사이렌 해제 → 리스너 중지 → WebSocket 종료 → DB 종료

## 기술 스택

| 구분 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router), React 19, TypeScript |
| 데이터베이스 | SQLite + Prisma ORM |
| UI | shadcn/ui, Radix UI, Tailwind CSS 4 |
| 차트 | Recharts 3 |
| 실시간 통신 | WebSocket (ws) |
| 런타임 | Node.js on DietPi Linux |

## 시작하기

### 사전 요구사항

- Node.js 20+
- npm

### 설치

```bash
git clone <repository-url>
cd alarm
npm install
```

### 데이터베이스 설정

```bash
npx prisma migrate deploy    # 마이그레이션 적용
npx tsx prisma/seed.ts        # 시드 데이터 입력
```

### 개발 모드

```bash
npm run dev           # 대시보드 (포트 7777)
npm run worker:dev    # Worker 감시 모드 (별도 터미널)
# 또는
npm run start:all     # 대시보드 + Worker 동시 실행
```

### 프로덕션 빌드

```bash
rm -rf .next && npm run build
npm start &           # 대시보드
npm run worker &      # Worker
```

## 프로덕션 배포 (systemd)

`systemd/` 디렉토리에 서비스 파일이 제공됩니다:

```bash
# 서비스 파일 복사
sudo cp systemd/alarm-dashboard.service /etc/systemd/system/
sudo cp systemd/alarm-worker.service /etc/systemd/system/

# 활성화 및 시작
sudo systemctl daemon-reload
sudo systemctl enable alarm-dashboard alarm-worker
sudo systemctl start alarm-dashboard alarm-worker

# 상태 확인
sudo systemctl status alarm-dashboard alarm-worker
```

## 프로젝트 구조

```
src/
├── app/                          # Next.js App Router
│   ├── (dashboard)/              # 대시보드 페이지
│   │   ├── alarms/               # 알람 이력 (필터링)
│   │   ├── settings/             # 기능 토글, 오디오, 사이렌 설정
│   │   ├── systems/              # 장비 CRUD 및 상세
│   │   ├── ups/                  # UPS CRUD 및 상세
│   │   └── temperature/          # 센서 감시
│   └── api/                      # REST API 라우트
├── components/
│   ├── realtime/                 # WebSocket 기반 실시간 컴포넌트
│   │   ├── audio-alert-manager   # 상태 기반 브라우저 오디오
│   │   ├── realtime-dashboard    # 장비 상태 그리드 + 컴팩트 모드
│   │   ├── realtime-provider     # WebSocket 컨텍스트 프로바이더
│   │   ├── realtime-temperature  # 센서 감시 패널
│   │   ├── realtime-ups          # UPS 감시 (6-차트 그리드)
│   │   ├── sensor-alarm-effects  # 센서 알람 시각 효과
│   │   └── temperature-history   # 센서 차트 히스토리
│   ├── forms/                    # 시스템 설정 폼
│   ├── alarms/                   # 알람 표시 및 필터링
│   ├── charts/                   # 시계열 차트 래퍼
│   ├── layout/                   # 사이드바, 헤더, 대시보드 레이아웃
│   └── ui/                       # shadcn/ui 기본 컴포넌트
├── hooks/                        # React 훅 (WebSocket, 뷰포트)
├── lib/                          # 공유 유틸리티
├── types/                        # TypeScript 인터페이스
└── worker/                       # 데이터 수집 프로세스
    ├── config.ts                 # UDP/TCP 포트 설정
    ├── db-updater.ts             # 데이터 처리, 알람, 스파이크 필터
    ├── index.ts                  # Worker 진입점
    ├── siren-trigger.ts          # 물리 사이렌 제어 (상태 기반)
    ├── tcp-listener.ts           # TCP 리스너
    ├── udp-listener.ts           # UDP 리스너
    └── websocket-server.ts       # WebSocket 브로드캐스트 서버
```

## 감시 대상 시스템

| 시스템 | 유형 | 프로토콜 | 설명 |
|--------|------|----------|------|
| 1레이더, 2레이더 | 장비 | UDP | 레이더 시스템 |
| FMS, LCMS | 장비 | UDP | 비행관리 / 감시 시스템 |
| VDL | 장비 | TCP | VHF 데이터 링크 |
| MARC | 장비 | UDP | MARC 시스템 |
| 전송로 | 장비 | UDP | 전송로 |
| UPS (관제송신 / 1레이더 / 2레이더) | UPS | UDP | 무정전 전원장치 |
| 온습도 | 센서 | UDP | 온도 및 습도 센서 |

## API

| 엔드포인트 | 설명 |
|------------|------|
| `GET/POST /api/systems` | 시스템 목록 조회 / 생성 |
| `GET/PUT/DELETE /api/systems/[id]` | 시스템 CRUD |
| `POST /api/systems/test-code` | 커스텀 파서 코드 테스트 |
| `GET /api/alarms` | 활성 알람 조회 |
| `POST /api/alarms/[id]/acknowledge` | 알람 확인 |
| `POST /api/alarms/acknowledge-all` | 전체 알람 확인 |
| `GET /api/metrics/history` | 메트릭 이력 데이터 |
| `GET/PUT /api/settings` | 기능 토글 및 설정 |
| `GET/POST /api/sirens` | 사이렌 장치 관리 |
| `POST /api/sirens/[id]/test` | 사이렌 테스트 |

## 시스템 설정

웹 UI(`/systems/new` 또는 `/ups/new`)를 통해 시스템을 설정합니다:

- **장비** — 정상/장애 상태 감지를 위한 바이트 패턴 정의
- **UPS** — 구분자 기반 파싱, 표시 항목, 임계값, 커스텀 코드 (선택)
- **센서** — 임계값 조건 설정 (`between` `gte` `lte` `eq` `neq`) 및 상태 카테고리

포트 매핑은 `src/worker/config.ts`에서 정의합니다.

## 스크립트

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | 개발 서버 (포트 7777) |
| `npm run build` | 프로덕션 빌드 |
| `npm start` | 프로덕션 서버 (포트 7777) |
| `npm run worker` | 프로덕션 데이터 수집기 |
| `npm run worker:dev` | Worker 감시 모드 |
| `npm run start:all` | 대시보드 + Worker 동시 실행 |
| `npm run db:seed` | 데이터베이스 시드 |
| `npm run db:reset` | 데이터베이스 초기화 및 재시드 |

## 라이선스

비공개 — All rights reserved.
