import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const repoRoot = process.cwd();
const templateDir = path.join(repoRoot, "docs", "backend");
const outputDir = path.join(
  repoRoot,
  "outputs",
  `backend-specs-${new Date().toISOString().replace(/[:.]/g, "").replace("T", "-")}`,
);

const apiTemplatePath = path.join(templateDir, "쿠첸_API설계_v0.1.xlsx");
const tableTemplatePath = path.join(templateDir, "쿠첸_테이블정의서_v0.1.xlsx");

const apiSheetNames = [
  "목차",
  "공통 응답",
  "헬스",
  "버킷 목록",
  "인제스트",
  "목록 검색",
  "메타데이터",
  "이미지 파일",
  "오류 응답",
];

const tableSheetNames = [
  "테이블목록",
  "catalog",
  "ingest_job",
  "ingest_item",
  "sync_log",
  "bucket_state",
  "image_object",
  "thumbnail_object",
  "raw_json_object",
];

function clearContents(sheet) {
  const used = sheet.getUsedRange();
  if (used) {
    used.clear({ applyTo: "contents" });
  }
}

function setCell(sheet, cell, value) {
  sheet.getRange(cell).values = [[value]];
}

function setMatrix(sheet, startCell, matrix) {
  if (!matrix.length || !matrix[0].length) {
    return;
  }
  sheet.getRange(startCell).resize(matrix.length, matrix[0].length).values = matrix;
}

function setFormulaMatrix(sheet, startCell, matrix) {
  if (!matrix.length || !matrix[0].length) {
    return;
  }
  sheet.getRange(startCell).resize(matrix.length, matrix[0].length).formulas = matrix;
}

function setFormula(sheet, cell, formula) {
  sheet.getRange(cell).formulas = [[formula]];
}

function row5(name, type, required, description, comment = null) {
  return [name, type, required, description, comment];
}

function writeParamSection(sheet, startRow, rows) {
  const normalized = rows.length
    ? rows.map((row, index) => [row[0], row[1], row[2], row[3], row[4] ?? null])
    : [["없음", "-", "N", "입력값 없음", null]];
  setMatrix(sheet, `B${startRow}`, normalized);
}

async function loadWorkbook(templatePath) {
  return SpreadsheetFile.importXlsx(await FileBlob.load(templatePath));
}

function fillApiDetail(sheet, { name, pathText, type, feature, inputs, outputs }) {
  clearContents(sheet);
  setCell(sheet, "B2", name);
  setCell(sheet, "C2", pathText);
  setCell(sheet, "E2", "TYPE");
  setCell(sheet, "F2", type);
  setMatrix(sheet, "B3:F3", [["기능", feature, null, null, null]]);
  setCell(sheet, "B4", "INPUT PARAM");
  setMatrix(sheet, "B5:F5", [["NAME", "TYPE", "REQUIRED", "DESCRIPTION", "COMMENT"]]);
  writeParamSection(sheet, 6, inputs);
  setCell(sheet, "B15", "OUTPUT PARAM");
  setMatrix(sheet, "B16:F16", [["NAME", "TYPE", "REQUIRED", "DESCRIPTION", "COMMENT"]]);
  writeParamSection(sheet, 17, outputs);
}

function fillApiIndex(sheet) {
  clearContents(sheet);
  setCell(sheet, "B2", "목차");
  setMatrix(sheet, "B3:J3", [[
    "분류",
    "인덱스",
    "기능",
    "TYPE",
    "NAME",
    "DESCRIPTION",
    null,
    "TOTAL API",
    9,
  ]]);
  const rows = [
    ["대분류", 1, "공통", null, null, null, null, null, null],
    ["소분류", "1.1", "백엔드 상태 확인", "GET", "health", "백엔드와 인프라 연결 상태 확인 API", null, null, null],
    ["소분류", "1.2", "버킷 목록 조회", "GET", "bucketList", "접근 가능한 MinIO 버킷 목록 조회 API", null, null, null],
    ["대분류", 2, "인제스트", null, null, null, null, null, null],
    ["소분류", "2.1", "폴더 스캔", "POST", "ingestScan", "입력 폴더 재귀 스캔 및 MongoDB/MinIO 동기화 API", null, null, null],
    ["대분류", 3, "조회", null, null, null, null, null, null],
    ["소분류", "3.1", "목록/검색", "GET", "imageSearch", "MongoDB 기반 목록 조회 및 필터 검색 API", null, null, null],
    ["소분류", "3.2", "메타데이터 조회", "GET", "imageMetadata", "정규화 레코드 조회 API", null, null, null],
    ["소분류", "3.3", "단건 레코드", "GET", "imageDetail", "metadata API와 동일 payload의 단건 조회 API", null, null, null],
    ["대분류", 4, "이미지 파일", null, null, null, null, null, null],
    ["소분류", "4.1", "원본 스트림", "GET", "imageBlob", "원본 이미지 스트리밍 API", null, null, null],
    ["소분류", "4.2", "썸네일 스트림", "GET", "imageThumbnail", "썸네일 스트리밍 API", null, null, null],
    ["소분류", "4.3", "다운로드", "GET", "imageDownload", "파일 저장용 원본 이미지 반환 API", null, null, null],
  ];
  setMatrix(sheet, "B4:J16", rows);
  for (const address of ["B5:G6", "B8:G8", "B10:G12", "B14:G16"]) {
    const range = sheet.getRange(address);
    range.format.fill = "#FFFFFF";
    range.format.font = { color: "#000000" };
  }
}

function fillTableDetail(sheet, def) {
  clearContents(sheet);
  setCell(sheet, "A1", "테이블 정의서");
  setCell(sheet, "C3", def.id);
  setCell(sheet, "C4", def.title);
  setCell(sheet, "C5", def.description);
  setCell(sheet, "G3", "시스템명");
  setCell(sheet, "H3", "CUCHEN");
  setCell(sheet, "G4", "데이터베이스");
  setCell(sheet, "H4", "CUCHEN");
  setCell(sheet, "G5", "작성일");
  setCell(sheet, "H5", "2026.04.22");
  setCell(sheet, "G6", "작성자");
  setCell(sheet, "H6", "Codex");
  setMatrix(sheet, "A8:H8", [[
    "No",
    "필드명",
    "속성명",
    "Type",
    "Key",
    "Not Null",
    "Default",
    "비고",
  ]]);
  const rows = def.rows.map((row, index) => [
    index + 1,
    row.field,
    row.label,
    row.type,
    row.key ?? null,
    row.notNull ?? null,
    row.default ?? null,
    row.remark ?? null,
  ]);
  setMatrix(sheet, "A9", rows);
}

function buildApiWorkbook(workbook) {
  workbook.worksheets.items.forEach((sheet, index) => {
    sheet.name = apiSheetNames[index];
    clearContents(sheet);
  });

  fillApiIndex(workbook.worksheets.getItem("목차"));

  fillApiDetail(workbook.worksheets.getItem("공통 응답"), {
    name: "commonResponse",
    pathText: "공통 응답 envelope",
    type: "GET",
    feature: "공통 응답 구조 정의",
    inputs: [],
    outputs: [
      row5("success", "Boolean", "Y", "성공 여부"),
      row5("message", "String", "N", "상태 메시지"),
      row5("data", "Object", "N", "실제 payload"),
      row5("errorCode", "String", "N", "오류 코드", "정상일 경우 값 없음"),
      row5("errorMessage", "String", "N", "오류 메시지", "정상일 경우 값 없음"),
    ],
  });

  fillApiDetail(workbook.worksheets.getItem("헬스"), {
    name: "health",
    pathText: "GET /health",
    type: "GET",
    feature: "백엔드와 인프라 연결 상태 확인",
    inputs: [],
    outputs: [
      row5("ok", "Boolean", "Y", "서버 응답 가능 여부"),
      row5("storageMode", "String", "Y", "현재 저장 모드"),
      row5("ingestRootDir", "String", "Y", "감시 루트 경로"),
      row5("minioEndpoint", "String", "Y", "MinIO 연결 주소"),
      row5("bucket", "String", "Y", "기본 버킷명"),
    ],
  });

  fillApiDetail(workbook.worksheets.getItem("버킷 목록"), {
    name: "bucketList",
    pathText: "GET /images/buckets",
    type: "GET",
    feature: "접근 가능한 버킷 목록 조회",
    inputs: [],
    outputs: [
      row5("buckets", "Array<String>", "Y", "버킷 목록"),
    ],
  });

  fillApiDetail(workbook.worksheets.getItem("인제스트"), {
    name: "ingestScan",
    pathText: "POST /ingest/scan",
    type: "POST",
    feature: "입력 폴더 재귀 스캔 및 MongoDB/MinIO 동기화",
    inputs: [
      row5("rootDir", "String", "N", "스캔할 루트 폴더", "미지정 시 설정값 사용"),
    ],
    outputs: [
      row5("processed", "Number", "Y", "처리한 파일 수"),
      row5("synced", "Number", "Y", "동기화 성공 수"),
      row5("partial", "Number", "Y", "부분 성공 수"),
      row5("failed", "Number", "Y", "실패 수"),
      row5("skipped", "Number", "Y", "건너뛴 파일 수"),
    ],
  });

  fillApiDetail(workbook.worksheets.getItem("목록 검색"), {
    name: "imageSearch",
    pathText: "GET /images/search",
    type: "GET",
    feature: "MongoDB 기반 목록 조회 및 필터 검색",
    inputs: [
      row5("bucket", "String", "N", "버킷 필터"),
      row5("productNo", "String", "N", "제품번호 포함 검색"),
      row5("processCode", "String", "N", "공정코드 포함 검색"),
      row5("result", "String", "N", "판정 결과"),
      row5("capturedAtFrom", "String", "N", "촬영일시 시작"),
      row5("capturedAtTo", "String", "N", "촬영일시 종료"),
      row5("thresholdMin", "Number", "N", "판정 임계값 최소"),
      row5("thresholdMax", "Number", "N", "판정 임계값 최대"),
      row5("page", "Number", "N", "페이지 번호"),
      row5("pageSize", "Number", "N", "페이지 크기"),
      row5("query", "String", "N", "파일명 및 메타데이터 통합 검색어"),
      row5("aiResult", "String", "N", "이전 호환 필드"),
    ],
    outputs: [
      row5("total", "Number", "Y", "총 건수"),
      row5("page", "Number", "Y", "현재 페이지"),
      row5("pageSize", "Number", "Y", "페이지 크기"),
      row5("items", "Array<CatalogRecord>", "Y", "목록 항목"),
    ],
  });

  fillApiDetail(workbook.worksheets.getItem("메타데이터"), {
    name: "imageDetail",
    pathText: "GET /images/:imageId/metadata, GET /images/:imageId",
    type: "GET",
    feature: "정규화 레코드 단건 조회",
    inputs: [row5("imageId", "String", "Y", "조회할 이미지 ID")],
    outputs: [
      row5("imageId", "String", "Y", "이미지 ID"),
      row5("bucket", "String", "Y", "버킷명"),
      row5("fileName", "String", "Y", "파일명"),
      row5("fileExt", "String", "Y", "파일 확장자"),
      row5("sourcePath", "String", "Y", "로컬 원본 경로"),
      row5("contentHash", "String", "Y", "원본 해시"),
      row5("imageKey", "String", "Y", "MinIO 원본 객체 키"),
      row5("thumbnailKey", "String | null", "N", "MinIO 썸네일 객체 키"),
      row5("rawJsonKey", "String | null", "N", "원본 JSON 객체 키"),
      row5("metadata", "Object", "Y", "정규화 메타데이터"),
      row5("syncStatus", "String", "Y", "동기화 상태"),
      row5("errorMessage", "String | null", "N", "부분 실패 메시지"),
      row5("createdAt", "String", "Y", "생성일"),
      row5("updatedAt", "String", "Y", "수정일"),
    ],
  });

  fillApiDetail(workbook.worksheets.getItem("이미지 파일"), {
    name: "imageFiles",
    pathText: "GET /images/:imageId/blob, /thumbnail, /download",
    type: "GET",
    feature: "이미지 원본, 썸네일, 다운로드 스트리밍 제공",
    inputs: [row5("imageId", "String", "Y", "조회할 이미지 ID")],
    outputs: [
      row5("contentType", "String", "Y", "이미지 MIME 타입"),
      row5("contentDisposition", "String", "N", "저장용 응답 헤더"),
      row5("cacheControl", "String", "N", "캐시 정책"),
      row5("streamBody", "Binary Stream", "Y", "이미지 바디"),
    ],
  });

  fillApiDetail(workbook.worksheets.getItem("오류 응답"), {
    name: "errorEnvelope",
    pathText: "공통 오류 응답",
    type: "GET",
    feature: "공통 오류 응답 구조",
    inputs: [],
    outputs: [
      row5("success", "Boolean", "Y", "성공 여부"),
      row5("errorCode", "String", "N", "오류 코드", "정상일 경우 값 없음"),
      row5("errorMessage", "String", "N", "오류 메시지", "정상일 경우 값 없음"),
      row5("requestId", "String", "N", "추적용 요청 ID"),
      row5("timestamp", "String", "N", "서버 시각"),
    ],
  });

  return workbook;
}

function buildTableWorkbook(workbook) {
  for (let index = workbook.worksheets.items.length - 1; index >= tableSheetNames.length; index -= 1) {
    workbook.worksheets.items[index].delete();
  }

  workbook.worksheets.items.forEach((sheet, index) => {
    sheet.name = tableSheetNames[index];
    clearContents(sheet);
  });

  const listSheet = workbook.worksheets.getItem("테이블목록");
  setCell(listSheet, "A1", "테이블 목록");
  setMatrix(listSheet, "A4:F4", [[
    "No",
    "데이터베이스",
    "테이블ID",
    "테이블명",
    "데이터\n원천 시스템",
    "비고",
  ]]);
  setMatrix(listSheet, "A5:F12", [
    [1, "CUCHEN", "catalog", "이미지 카탈로그", "입력 폴더/JSON ingest", "조회 정본"],
    [2, "CUCHEN", "ingest_job", "인제스트 작업", "폴더 감시/수동 스캔", "배치 단위 상태 추적"],
    [3, "CUCHEN", "ingest_item", "인제스트 항목", "파일 pair", "개별 처리 결과"],
    [4, "CUCHEN", "sync_log", "동기화 로그", "reconcile / retry", "partial write 추적"],
    [5, "CUCHEN", "bucket_state", "버킷 상태", "backend / MinIO", "버킷 활성 상태"],
    [6, "CUCHEN", "image_object", "원본 이미지 객체", "MinIO", "원본 객체 메타"],
    [7, "CUCHEN", "thumbnail_object", "썸네일 객체", "MinIO", "썸네일 메타"],
    [8, "CUCHEN", "raw_json_object", "원본 JSON 객체", "MinIO", "원본 JSON 메타"],
  ]);
  setFormulaMatrix(listSheet, "C5:C12", [
    [`=HYPERLINK("#'catalog'!A1","catalog")`],
    [`=HYPERLINK("#'ingest_job'!A1","ingest_job")`],
    [`=HYPERLINK("#'ingest_item'!A1","ingest_item")`],
    [`=HYPERLINK("#'sync_log'!A1","sync_log")`],
    [`=HYPERLINK("#'bucket_state'!A1","bucket_state")`],
    [`=HYPERLINK("#'image_object'!A1","image_object")`],
    [`=HYPERLINK("#'thumbnail_object'!A1","thumbnail_object")`],
    [`=HYPERLINK("#'raw_json_object'!A1","raw_json_object")`],
  ]);

  const defs = [
    {
      name: "catalog",
      id: "CATALOG",
      title: "이미지 카탈로그",
      description: "목록/검색을 위한 조회 정본 테이블",
      rows: [
        { field: "imageId", label: "이미지 ID", type: "varchar(128)", key: "PK", notNull: "Y", remark: "고유 식별자" },
        { field: "bucket", label: "버킷", type: "varchar(64)", key: null, notNull: "Y", remark: "저장 버킷명" },
        { field: "fileName", label: "파일명", type: "varchar(255)", key: null, notNull: "Y", remark: "원본 파일명" },
        { field: "fileExt", label: "확장자", type: "varchar(16)", key: null, notNull: "Y", remark: "png/jpg" },
        { field: "sourcePath", label: "원본 경로", type: "text", key: null, notNull: "N", remark: "감시 폴더 경로" },
        { field: "contentHash", label: "콘텐츠 해시", type: "varchar(64)", key: "UK", notNull: "N", remark: "중복 판정" },
        { field: "imageKey", label: "원본 이미지 키", type: "varchar(255)", key: null, notNull: "Y", remark: "MinIO images object" },
        { field: "thumbnailKey", label: "썸네일 키", type: "varchar(255)", key: null, notNull: "N", remark: "MinIO thumbnails object" },
        { field: "rawJsonKey", label: "원본 JSON 키", type: "varchar(255)", key: null, notNull: "N", remark: "MinIO raw-json object" },
        { field: "metadata", label: "메타데이터", type: "json", key: null, notNull: "Y", remark: "productNo, capturedAt, processCode, result, threshold, lotNo, cameraId" },
        { field: "syncStatus", label: "동기화 상태", type: "varchar(32)", key: null, notNull: "Y", remark: "synced / partial / failed" },
        { field: "errorMessage", label: "오류 메시지", type: "text", key: null, notNull: "N", remark: "부분 실패 상세" },
        { field: "createdAt", label: "생성일", type: "datetime", key: null, notNull: "Y", default: "CURRENT_TIMESTAMP" },
        { field: "updatedAt", label: "수정일", type: "datetime", key: null, notNull: "Y", default: "CURRENT_TIMESTAMP" },
      ],
    },
    {
      name: "ingest_job",
      id: "INGEST_JOB",
      title: "인제스트 작업",
      description: "폴더 감시 또는 수동 스캔 한 건의 배치 작업",
      rows: [
        { field: "jobId", label: "작업 ID", type: "varchar(128)", key: "PK", notNull: "Y", remark: "배치 식별자" },
        { field: "rootDir", label: "루트 경로", type: "text", key: null, notNull: "Y", remark: "감시/스캔 경로" },
        { field: "bucket", label: "버킷", type: "varchar(64)", key: null, notNull: "Y", remark: "대상 버킷" },
        { field: "status", label: "상태", type: "varchar(32)", key: null, notNull: "Y", remark: "running / success / partial / failed" },
        { field: "processed", label: "처리 수", type: "int", key: null, notNull: "Y", default: 0 },
        { field: "synced", label: "동기화 수", type: "int", key: null, notNull: "Y", default: 0 },
        { field: "partial", label: "부분 성공 수", type: "int", key: null, notNull: "Y", default: 0 },
        { field: "failed", label: "실패 수", type: "int", key: null, notNull: "Y", default: 0 },
        { field: "skipped", label: "건너뜀 수", type: "int", key: null, notNull: "Y", default: 0 },
        { field: "startedAt", label: "시작일", type: "datetime", key: null, notNull: "Y" },
        { field: "finishedAt", label: "종료일", type: "datetime", key: null, notNull: "N" },
        { field: "message", label: "메시지", type: "text", key: null, notNull: "N", remark: "배치 요약" },
      ],
    },
    {
      name: "ingest_item",
      id: "INGEST_ITEM",
      title: "인제스트 항목",
      description: "작업 배치 내 개별 파일 pair 처리 결과",
      rows: [
        { field: "itemId", label: "항목 ID", type: "varchar(128)", key: "PK", notNull: "Y" },
        { field: "jobId", label: "작업 ID", type: "varchar(128)", key: "FK", notNull: "Y", remark: "상위 작업 연결" },
        { field: "imageId", label: "이미지 ID", type: "varchar(128)", key: null, notNull: "Y" },
        { field: "imageKey", label: "이미지 키", type: "varchar(255)", key: null, notNull: "Y" },
        { field: "rawJsonKey", label: "JSON 키", type: "varchar(255)", key: null, notNull: "N" },
        { field: "status", label: "상태", type: "varchar(32)", key: null, notNull: "Y", remark: "synced / partial / failed / skipped" },
        { field: "reason", label: "사유", type: "text", key: null, notNull: "N", remark: "실패 또는 스킵 사유" },
        { field: "createdAt", label: "생성일", type: "datetime", key: null, notNull: "Y" },
        { field: "updatedAt", label: "수정일", type: "datetime", key: null, notNull: "Y" },
      ],
    },
    {
      name: "sync_log",
      id: "SYNC_LOG",
      title: "동기화 로그",
      description: "MongoDB/MinIO 정합성 및 복구 로그",
      rows: [
        { field: "logId", label: "로그 ID", type: "varchar(128)", key: "PK", notNull: "Y" },
        { field: "eventType", label: "이벤트 유형", type: "varchar(64)", key: null, notNull: "Y", remark: "reconcile / retry / backfill" },
        { field: "source", label: "원천", type: "varchar(64)", key: null, notNull: "Y", remark: "watch / scan / batch" },
        { field: "target", label: "대상", type: "varchar(64)", key: null, notNull: "Y", remark: "MongoDB / MinIO" },
        { field: "imageId", label: "이미지 ID", type: "varchar(128)", key: null, notNull: "N" },
        { field: "result", label: "결과", type: "varchar(32)", key: null, notNull: "Y", remark: "success / partial / failed" },
        { field: "detail", label: "상세", type: "text", key: null, notNull: "N", remark: "차이/복구 내용" },
        { field: "createdAt", label: "생성일", type: "datetime", key: null, notNull: "Y" },
      ],
    },
    {
      name: "bucket_state",
      id: "BUCKET_STATE",
      title: "버킷 상태",
      description: "프론트 버킷 드롭다운과 상태 표시용",
      rows: [
        { field: "bucketName", label: "버킷명", type: "varchar(64)", key: "PK", notNull: "Y" },
        { field: "isActive", label: "활성 여부", type: "boolean", key: null, notNull: "Y", default: true },
        { field: "lastScanAt", label: "마지막 스캔일", type: "datetime", key: null, notNull: "N" },
        { field: "itemCount", label: "항목 수", type: "int", key: null, notNull: "Y", default: 0 },
        { field: "updatedAt", label: "수정일", type: "datetime", key: null, notNull: "Y" },
      ],
    },
    {
      name: "image_object",
      id: "IMAGE_OBJECT",
      title: "원본 이미지 객체",
      description: "MinIO 원본 이미지 객체 메타",
      rows: [
        { field: "objectKey", label: "객체 키", type: "varchar(255)", key: "PK", notNull: "Y" },
        { field: "imageId", label: "이미지 ID", type: "varchar(128)", key: null, notNull: "Y" },
        { field: "bucket", label: "버킷", type: "varchar(64)", key: null, notNull: "Y" },
        { field: "fileExt", label: "확장자", type: "varchar(16)", key: null, notNull: "Y" },
        { field: "contentHash", label: "해시", type: "varchar(64)", key: null, notNull: "N" },
        { field: "sizeBytes", label: "크기", type: "bigint", key: null, notNull: "Y" },
        { field: "etag", label: "ETag", type: "varchar(128)", key: null, notNull: "N" },
        { field: "lastModified", label: "수정일", type: "datetime", key: null, notNull: "N" },
      ],
    },
    {
      name: "thumbnail_object",
      id: "THUMBNAIL_OBJECT",
      title: "썸네일 객체",
      description: "MinIO 썸네일 객체 메타",
      rows: [
        { field: "objectKey", label: "객체 키", type: "varchar(255)", key: "PK", notNull: "Y" },
        { field: "imageId", label: "이미지 ID", type: "varchar(128)", key: null, notNull: "Y" },
        { field: "bucket", label: "버킷", type: "varchar(64)", key: null, notNull: "Y" },
        { field: "fileExt", label: "확장자", type: "varchar(16)", key: null, notNull: "Y", default: "webp" },
        { field: "sizeBytes", label: "크기", type: "bigint", key: null, notNull: "Y" },
        { field: "etag", label: "ETag", type: "varchar(128)", key: null, notNull: "N" },
        { field: "lastModified", label: "수정일", type: "datetime", key: null, notNull: "N" },
      ],
    },
    {
      name: "raw_json_object",
      id: "RAW_JSON_OBJECT",
      title: "원본 JSON 객체",
      description: "MinIO 원본 JSON 객체 메타",
      rows: [
        { field: "objectKey", label: "객체 키", type: "varchar(255)", key: "PK", notNull: "Y" },
        { field: "imageId", label: "이미지 ID", type: "varchar(128)", key: null, notNull: "Y" },
        { field: "bucket", label: "버킷", type: "varchar(64)", key: null, notNull: "Y" },
        { field: "fileExt", label: "확장자", type: "varchar(16)", key: null, notNull: "Y", default: "json" },
        { field: "sizeBytes", label: "크기", type: "bigint", key: null, notNull: "Y" },
        { field: "etag", label: "ETag", type: "varchar(128)", key: null, notNull: "N" },
        { field: "lastModified", label: "수정일", type: "datetime", key: null, notNull: "N" },
      ],
    },
  ];

  defs.forEach((def) => fillTableDetail(workbook.worksheets.getItem(def.name), def));
  return workbook;
}

async function renderChecks(workbook, sheetNames, label) {
  for (const sheetName of sheetNames) {
    const blob = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
    const bytes = await blob.arrayBuffer();
    console.log(`${label}:${sheetName}:${bytes.byteLength}`);
  }
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  const apiWorkbook = buildApiWorkbook(await loadWorkbook(apiTemplatePath));
  const tableWorkbook = buildTableWorkbook(await loadWorkbook(tableTemplatePath));

  await apiWorkbook.inspect({
    kind: "table",
    sheetId: "목차",
    range: "B2:J16",
    include: "values",
    tableMaxRows: 20,
    tableMaxCols: 10,
    tableMaxCellChars: 120,
  });
  await tableWorkbook.inspect({
    kind: "table",
    sheetId: "테이블목록",
    range: "A1:F12",
    include: "values",
    tableMaxRows: 15,
    tableMaxCols: 6,
    tableMaxCellChars: 120,
  });

  await renderChecks(apiWorkbook, apiSheetNames, "api");
  await renderChecks(tableWorkbook, tableSheetNames, "table");

  const apiXlsx = await SpreadsheetFile.exportXlsx(apiWorkbook);
  const apiOutputPath = path.join(outputDir, "쿠첸_API설계_v0.1.xlsx");
  const apiTemplateOutputPath = path.join(templateDir, "쿠첸_API설계_v0.1.xlsx");
  await apiXlsx.save(apiOutputPath);
  execFileSync("python3", [path.join(repoRoot, "scripts", "fix-backend-workbook-links.py"), apiOutputPath, "api"]);
  await fs.copyFile(apiOutputPath, apiTemplateOutputPath);

  const tableXlsx = await SpreadsheetFile.exportXlsx(tableWorkbook);
  const tableOutputPath = path.join(outputDir, "쿠첸_테이블정의서_v0.1.xlsx");
  const tableTemplateOutputPath = path.join(templateDir, "쿠첸_테이블정의서_v0.1.xlsx");
  await tableXlsx.save(tableOutputPath);
  execFileSync("python3", [path.join(repoRoot, "scripts", "fix-backend-workbook-links.py"), tableOutputPath, "table"]);
  await fs.copyFile(tableOutputPath, tableTemplateOutputPath);

  console.log(outputDir);
}

await main();
