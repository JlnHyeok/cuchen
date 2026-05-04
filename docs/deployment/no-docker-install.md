# Docker 없이 설치/배포 가이드

## 목적
이 문서는 Docker를 사용하지 않고 MongoDB, MinIO, backend, frontend를 설치/배포하는 절차를 정리한다.

기본 운영 방식은 Version A다. 즉 backend, MongoDB, MinIO는 Ubuntu/WSL 또는 Windows host 프로세스로 실행하고, frontend는 별도 정적 웹앱으로 배포한다.

## 전제
- agent는 파일 생성 경로를 직접 관리한다.
- backend는 `POST /ingest/files` 요청으로 받은 `path`, `filebase`를 기준으로 파일을 읽는다.
- backend가 접근 가능한 실제 OS 경로만 ingest할 수 있다.
- frontend는 MongoDB나 MinIO에 직접 접근하지 않고 backend HTTP API만 호출한다.
- SSE 화면 갱신은 backend 프로세스 메모리에서 발행되므로, frontend와 agent는 같은 backend 인스턴스를 바라봐야 한다.

## 공통 포트

| 구성요소 | 기본 포트 | 용도 |
| --- | ---: | --- |
| backend | 3000 | HTTP API, SSE |
| MongoDB | 27017 | metadata 저장 |
| MinIO API | 9000 | 이미지 객체 저장 |
| MinIO Console | 9001 | MinIO 관리 UI |
| frontend | 4173 또는 웹서버 포트 | 정적 UI |

## 공통 환경 변수

backend의 `apps/backend/.env`는 운영 환경마다 직접 만든다. 실제 비밀번호는 문서나 저장소에 커밋하지 않는다.

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000

STORAGE_MODE=mongo-minio
INGEST_ROOT_DIR=/data/cuchen/inbox

MINIO_ENDPOINT=http://127.0.0.1:9000
MINIO_ACCESS_KEY=<minio-access-key>
MINIO_SECRET_KEY=<minio-secret-key>
MINIO_BUCKET=cuchen-images

MONGODB_URL=mongodb://127.0.0.1:27017
MONGODB_DATABASE_NAME=cuchen
MONGODB_USER=
MONGODB_PASSWORD=
MONGODB_AUTH_SOURCE=admin
MONGO_COLLECTION_NAME=catalog

CORS_ORIGIN=http://localhost:4173,http://127.0.0.1:4173,http://<frontend-host>
```

frontend의 `apps/frontend/.env.production`은 browser에서 접근 가능한 backend 주소를 사용한다.

```env
VITE_BACKEND_URL=http://<backend-host>:3000
```

`VITE_BACKEND_URL`과 agent가 호출하는 ingest API 주소가 서로 다른 backend 인스턴스면 SSE 화면 갱신이 보이지 않을 수 있다.

## Ubuntu 설치

### 1. 기본 패키지 설치

```bash
sudo apt update
sudo apt install -y curl wget gnupg ca-certificates lsb-release
```

Node.js는 프로젝트 의존성 기준으로 22 LTS 이상을 사용한다. 설치 방식은 서버 표준에 맞추되, 배포 전에 버전을 확인한다.

```bash
node -v
npm -v
```

### 2. MongoDB 설치

MongoDB Community Edition을 apt repository로 설치한다. 아래 예시는 MongoDB 8.0 기준이다.

```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc \
  | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor

UBUNTU_CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu ${UBUNTU_CODENAME}/mongodb-org/8.0 multiverse" \
  | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list

sudo apt update
sudo apt install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

동작 확인:

```bash
mongosh --eval 'db.runCommand({ ping: 1 })'
```

운영에서 인증을 사용할 경우 app 계정을 만든다.

```javascript
use cuchen
db.createUser({
  user: "cuchen_app",
  pwd: "<strong-password>",
  roles: [{ role: "readWrite", db: "cuchen" }]
})
```

인증을 켰다면 backend `.env`는 아래처럼 맞춘다.

```env
MONGODB_USER=cuchen_app
MONGODB_PASSWORD=<strong-password>
MONGODB_AUTH_SOURCE=cuchen
```

### 3. MinIO 설치

단일 서버 개발/운영 기준으로 MinIO Server 바이너리를 설치한다.

```bash
sudo useradd -r -s /sbin/nologin minio-user || true
sudo mkdir -p /opt/minio /data/minio /etc/minio
sudo chown -R minio-user:minio-user /data/minio /etc/minio

sudo wget -O /usr/local/bin/minio https://dl.min.io/server/minio/release/linux-amd64/minio
sudo chmod +x /usr/local/bin/minio
```

MinIO 환경 파일을 만든다.

```bash
sudo tee /etc/default/minio >/dev/null <<'EOF'
MINIO_ROOT_USER=<minio-access-key>
MINIO_ROOT_PASSWORD=<minio-secret-key>
MINIO_VOLUMES=/data/minio
MINIO_OPTS="--address :9000 --console-address :9001"
EOF
sudo chown minio-user:minio-user /etc/default/minio
sudo chmod 600 /etc/default/minio
```

systemd 서비스를 만든다.

```bash
sudo tee /etc/systemd/system/minio.service >/dev/null <<'EOF'
[Unit]
Description=MinIO Object Storage
After=network-online.target
Wants=network-online.target

[Service]
User=minio-user
Group=minio-user
EnvironmentFile=/etc/default/minio
ExecStart=/usr/local/bin/minio server $MINIO_OPTS $MINIO_VOLUMES
Restart=always
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl start minio
sudo systemctl enable minio
```

MinIO Client를 설치하고 bucket을 만든다.

```bash
sudo wget -O /usr/local/bin/mc https://dl.min.io/client/mc/release/linux-amd64/mc
sudo chmod +x /usr/local/bin/mc

mc alias set local http://127.0.0.1:9000 <minio-access-key> <minio-secret-key>
mc mb --ignore-existing local/cuchen-images
```

### 4. backend 배포

```bash
cd /path/to/cuchen2/apps/backend
npm ci
npm run build
```

`apps/backend/.env`를 공통 환경 변수 기준으로 작성한 뒤 실행한다.

```bash
npm run start
```

systemd로 상시 실행할 경우:

```bash
sudo tee /etc/systemd/system/cuchen-backend.service >/dev/null <<'EOF'
[Unit]
Description=Cuchen Backend
After=network-online.target mongod.service minio.service
Wants=network-online.target

[Service]
WorkingDirectory=/path/to/cuchen2/apps/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=3
User=<deploy-user>
Group=<deploy-user>

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl start cuchen-backend
sudo systemctl enable cuchen-backend
```

상태 확인:

```bash
curl http://127.0.0.1:3000/health
```

### 5. frontend 배포

```bash
cd /path/to/cuchen2/apps/frontend
cat > .env.production <<'EOF'
VITE_BACKEND_URL=http://<backend-host>:3000
EOF
npm ci
npm run build
```

`apps/frontend/build` 폴더를 Nginx, Apache, Caddy 같은 정적 웹서버의 document root로 배포한다.

Nginx 예시:

```nginx
server {
  listen 4173;
  server_name _;

  root /opt/cuchen/frontend/build;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

간단히 실행 확인만 할 때는 Vite preview를 사용할 수 있다.

```bash
npm run preview -- --host 0.0.0.0 --port 4173
```

## Windows 설치

### 1. 기본 준비

- Node.js 22 LTS 이상을 설치한다.
- Git 또는 압축 배포본으로 프로젝트를 준비한다.
- PowerShell은 관리자 권한으로 실행한다.

버전 확인:

```powershell
node -v
npm -v
```

### 2. MongoDB 설치

MongoDB Community Edition Windows MSI를 설치한다.

설치 마법사에서는 운영 단순화를 위해 `Install MongoD as a Service`를 선택한다. 설치가 끝나면 MongoDB 서비스가 자동 시작된다.

동작 확인:

```powershell
mongosh.exe --eval "db.runCommand({ ping: 1 })"
```

운영에서 인증을 사용할 경우 `mongosh.exe`에서 app 계정을 만든다.

```javascript
use cuchen
db.createUser({
  user: "cuchen_app",
  pwd: "<strong-password>",
  roles: [{ role: "readWrite", db: "cuchen" }]
})
```

인증을 켰다면 backend `.env`는 아래처럼 맞춘다.

```env
MONGODB_USER=cuchen_app
MONGODB_PASSWORD=<strong-password>
MONGODB_AUTH_SOURCE=cuchen
```

### 3. MinIO 설치

MinIO Server와 Client 바이너리를 내려받는다.

```powershell
New-Item -ItemType Directory -Force C:\minio
New-Item -ItemType Directory -Force C:\minio\data

Invoke-WebRequest https://dl.min.io/server/minio/release/windows-amd64/minio.exe -OutFile C:\minio\minio.exe
Invoke-WebRequest https://dl.min.io/client/mc/release/windows-amd64/mc.exe -OutFile C:\minio\mc.exe
```

직접 실행:

```powershell
$env:MINIO_ROOT_USER="<minio-access-key>"
$env:MINIO_ROOT_PASSWORD="<minio-secret-key>"
C:\minio\minio.exe server C:\minio\data --address :9000 --console-address :9001
```

다른 PowerShell 창에서 bucket을 만든다.

```powershell
C:\minio\mc.exe alias set local http://127.0.0.1:9000 <minio-access-key> <minio-secret-key>
C:\minio\mc.exe mb --ignore-existing local/cuchen-images
```

상시 실행은 Windows 작업 스케줄러 또는 조직에서 사용하는 서비스 래퍼로 등록한다. 작업 스케줄러를 사용할 경우 시작 프로그램은 `C:\minio\minio.exe`, 인수는 아래 값으로 둔다.

```text
server C:\minio\data --address :9000 --console-address :9001
```

`MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`는 작업의 환경 또는 실행 계정의 시스템 환경 변수로 등록한다.

### 4. backend 배포

```powershell
cd C:\path\to\cuchen2\apps\backend
npm ci
npm run build
```

`apps\backend\.env`를 작성한다.

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000

STORAGE_MODE=mongo-minio
INGEST_ROOT_DIR=C:\cuchen\inbox

MINIO_ENDPOINT=http://127.0.0.1:9000
MINIO_ACCESS_KEY=<minio-access-key>
MINIO_SECRET_KEY=<minio-secret-key>
MINIO_BUCKET=cuchen-images

MONGODB_URL=mongodb://127.0.0.1:27017
MONGODB_DATABASE_NAME=cuchen
MONGODB_USER=
MONGODB_PASSWORD=
MONGODB_AUTH_SOURCE=admin
MONGO_COLLECTION_NAME=catalog

CORS_ORIGIN=http://localhost:4173,http://127.0.0.1:4173,http://<frontend-host>
```

실행:

```powershell
npm run start
```

상시 실행은 작업 스케줄러 또는 조직 표준 서비스 관리 도구를 사용한다. 작업 스케줄러를 사용할 경우 시작 프로그램은 `npm`, 인수는 `run start`, 시작 위치는 `C:\path\to\cuchen2\apps\backend`로 둔다.

상태 확인:

```powershell
curl.exe http://127.0.0.1:3000/health
```

### 5. frontend 배포

```powershell
cd C:\path\to\cuchen2\apps\frontend
Set-Content .env.production "VITE_BACKEND_URL=http://<backend-host>:3000"
npm ci
npm run build
```

`apps\frontend\build` 폴더를 IIS, Nginx for Windows, Caddy 같은 정적 웹서버에 배포한다. SPA 라우팅을 위해 존재하지 않는 경로는 `index.html`로 fallback되도록 설정한다.

간단히 실행 확인만 할 때는 Vite preview를 사용할 수 있다.

```powershell
npm run preview -- --host 0.0.0.0 --port 4173
```

## 운영 검증 체크리스트

### 인프라
- `mongosh --eval 'db.runCommand({ ping: 1 })'`가 성공한다.
- MinIO Console `http://<host>:9001`에 로그인할 수 있다.
- `cuchen-images` bucket이 존재한다.

### backend
- `curl http://<backend-host>:3000/health`가 성공한다.
- health 응답의 `storageMode`가 `mongo-minio`다.
- health 응답의 `ingestRootDir`가 agent가 사용할 경로 기준과 맞다.

### frontend
- browser에서 frontend 주소가 열린다.
- Network 탭에서 API 요청이 `VITE_BACKEND_URL`의 backend로 나간다.
- frontend origin이 backend `CORS_ORIGIN`에 포함되어 있다.

### ingest
- agent가 생성한 파일명이 `filebase-{div}.json`, `filebase-{div}.png` 형태다.
- `POST /ingest/files` 요청의 `path`는 backend 프로세스가 접근 가능한 실제 경로다.
- 성공 시 원본 파일이 삭제된다.
- 실패 시 원본 파일이 `failed/` 폴더로 이동한다.
- 성공 후 `/images/events` SSE를 통해 화면이 갱신된다.

## Version B로 Docker 배포할 때 달라지는 점

이 문서는 Docker 미사용 절차가 기준이다. 추후 Docker로 배포할 경우 데이터 계약은 같지만 경로 계약이 달라진다.

- `POST /ingest/files`의 `path`는 컨테이너 내부 경로여야 한다.
- host/WSL 경로를 쓰려면 Docker 실행 시 bind mount를 명시해야 한다.
- frontend와 agent가 같은 backend 인스턴스를 바라봐야 한다는 SSE 조건은 동일하다.
- MongoDB, MinIO endpoint는 컨테이너 네트워크 이름 또는 외부 노출 주소 기준으로 바뀐다.

## 참고 공식 문서
- MongoDB Ubuntu 설치: https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-ubuntu/
- MongoDB Windows 설치: https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-windows/
- MinIO Linux 설치/운영 문서: https://min.io/docs/minio/linux/
- MinIO Windows 설치/운영 문서: https://min.io/docs/minio/windows/
- Node.js 다운로드: https://nodejs.org/en/download
