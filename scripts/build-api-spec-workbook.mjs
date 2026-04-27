import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const repoRoot = process.cwd();
const outputDir = path.join(
  repoRoot,
  "outputs",
  `api-spec-${new Date().toISOString().replace(/[:.]/g, "").replace("T", "-")}`,
);
const outputName = "쿠첸_API설계_v0.2.xlsx";
const outputPath = path.join(outputDir, outputName);
const templatePath = path.join(repoRoot, "docs", "backend", outputName);

const titleFill = "#1F4E79";
const sectionFill = "#D9EAF7";
const headerFill = "#EEF4FB";
const lineColor = "#CBD5E1";
const textColor = "#1F2937";
const mutedColor = "#475569";
const getFill = "#D1FAE5";
const postFill = "#FEF3C7";
const putFill = "#DBEAFE";
const deleteFill = "#FEE2E2";

function createWorkbook() {
  return Workbook.create();
}

function addSheet(workbook, name) {
  const sheet = workbook.worksheets.add(name);
  sheet.showGridLines = false;
  return sheet;
}

function setValues(sheet, range, values) {
  sheet.getRange(range).values = values;
}

function setFormula(sheet, cell, formula) {
  sheet.getRange(cell).formulas = [[formula]];
}

function styleRange(sheet, range, options = {}) {
  const r = sheet.getRange(range);
  if (options.fill) r.format.fill = options.fill;
  if (options.font) r.format.font = options.font;
  if (options.wrapText !== undefined) r.format.wrapText = options.wrapText;
  if (options.hAlign) r.format.horizontalAlignment = options.hAlign;
  if (options.vAlign) r.format.verticalAlignment = options.vAlign;
  if (options.borders) r.format.borders = options.borders;
  if (options.numberFormat) r.format.numberFormat = options.numberFormat;
  if (options.rowHeightPx) r.format.rowHeightPx = options.rowHeightPx;
  if (options.columnWidthPx) r.format.columnWidthPx = options.columnWidthPx;
}

function setColumnWidths(sheet, widths, rows = 200) {
  for (const [column, widthPx] of Object.entries(widths)) {
    styleRange(sheet, `${column}1:${column}${rows}`, { columnWidthPx: widthPx });
  }
}

function outlineTable(sheet, range) {
  styleRange(sheet, range, {
    borders: { preset: "outside", style: "thin", color: lineColor },
  });
}

function writeBlock(sheet, startCell, rows) {
  if (!rows.length) return;
  sheet.getRange(startCell).write(rows);
}

function colorByMethod(method) {
  if (method === "GET") return getFill;
  if (method === "POST") return postFill;
  if (method === "PUT") return putFill;
  if (method === "DELETE") return deleteFill;
  return headerFill;
}

function tableRows(fields) {
  if (!fields.length) {
    return [["없음", "-", "N", "입력값 없음"]];
  }
  return fields.map((field) => [
    field.name,
    field.type,
    field.required ?? "N",
    field.description,
  ]);
}

function renderTitleSheet(sheet, title, subtitle) {
  writeBlock(sheet, "A1", [[title]]);
  writeBlock(sheet, "A2", [[subtitle]]);
  styleRange(sheet, "A1:I1", {
    fill: titleFill,
    font: { color: "#FFFFFF", size: 15, bold: true, name: "맑은 고딕" },
    rowHeightPx: 34,
    hAlign: "left",
    vAlign: "center",
  });
  styleRange(sheet, "A2:I2", {
    fill: sectionFill,
    font: { color: mutedColor, size: 10, name: "맑은 고딕" },
    rowHeightPx: 22,
    hAlign: "left",
    vAlign: "center",
  });
}

function renderOverview(sheet, sections) {
  renderTitleSheet(sheet, "쿠첸 백엔드 API 설계서", "프론트 / 백엔드 분리 배포 기준의 API 계약서");
  writeBlock(sheet, "A4", [[
    "버전 v0.2 · API 9개 · MongoDB + MinIO · backend/frontend 분리 배포",
  ]]);
  writeBlock(sheet, "A5", [[
    "프론트는 백엔드 HTTP API만 사용하고, 이미지 원본과 썸네일은 MinIO에서 전달받는다. rawJsonKey는 예약 경로이며 현재 원본 JSON 객체 업로드는 미구현이다.",
  ]]);
  styleRange(sheet, "A4:G4", {
    fill: sectionFill,
    font: { color: textColor, bold: true },
    wrapText: false,
  });
  styleRange(sheet, "A5:G5", {
    fill: "#F8FAFC",
    font: { color: mutedColor },
    wrapText: false,
  });

  const startRow = 8;
  writeBlock(sheet, `A${startRow}`, [[
    "No",
    "시트",
    "Method",
    "Path",
    "API Name",
    "설명",
    "이동",
  ]]);

  const overviewRows = [];
  let no = 1;
  for (const section of sections) {
    for (const endpoint of section.endpoints) {
      overviewRows.push([
        no,
        section.sheet,
        endpoint.method,
        endpoint.path,
        endpoint.name,
        endpoint.summary,
        section.sheet,
      ]);
      no += 1;
    }
  }
  writeBlock(sheet, `A${startRow + 1}`, overviewRows);
  styleRange(sheet, `A${startRow}:G${startRow + overviewRows.length}`, {
    borders: { preset: "outside", style: "thin", color: lineColor },
    wrapText: true,
    vAlign: "center",
  });
  styleRange(sheet, `A${startRow}:G${startRow}`, {
    fill: headerFill,
    font: { color: textColor, bold: true },
    hAlign: "center",
  });

  for (let row = startRow + 1; row < startRow + 1 + overviewRows.length; row += 1) {
    writeBlock(sheet, `G${row}`, [["열기"]]);
    styleRange(sheet, `C${row}:C${row}`, {
      fill: colorByMethod(sheet.getRange(`C${row}`).values[0][0]),
      font: { color: textColor, bold: true },
      hAlign: "center",
    });
    styleRange(sheet, `G${row}`, {
      fill: sectionFill,
      font: { color: textColor, bold: true },
      hAlign: "center",
    });
  }

  sheet.freezePanes.freezeRows(startRow);
  setColumnWidths(sheet, {
    A: 58,
    B: 110,
    C: 72,
    D: 220,
    E: 120,
    F: 280,
    G: 80,
  }, 60);
}

function renderRulesSheet(sheet) {
  renderTitleSheet(sheet, "공통 규약", "응답 envelope, 오류 형식, 페이징 및 메타데이터 기준");

  let row = 4;
  const sections = [
    {
      title: "공통 응답 envelope",
      rows: [
        ["success", "Boolean", "Y", "성공 여부"],
        ["message", "String", "N", "상태 메시지"],
        ["data", "Object", "N", "실제 payload"],
        ["errorCode", "String", "N", "오류 코드"],
        ["errorMessage", "String", "N", "오류 메시지"],
      ],
    },
    {
      title: "페이징/검색 규칙",
      rows: [
        ["page", "Number", "N", "기본 1"],
        ["pageSize", "Number", "N", "기본 20"],
        ["bucket", "String", "N", "버킷 필터"],
        ["productNo", "String", "N", "포함 검색"],
        ["result", "String", "N", "OK/PASS, NG/FAIL/FAILED alias 매칭"],
        ["thresholdMin / Max", "Number", "N", "범위 검색"],
        ["capturedAtFrom / To", "String", "N", "ISO 8601 범위"],
        ["lotNo / cameraId", "String", "N", "LOT/CAMERA 포함 검색"],
      ],
    },
  ];

  for (const section of sections) {
    writeBlock(sheet, `A${row}`, [[section.title]]);
    styleRange(sheet, `A${row}:D${row}`, {
      fill: sectionFill,
      font: { color: textColor, bold: true },
      rowHeightPx: 24,
    });
    row += 1;
    writeBlock(sheet, `A${row}`, [[
      "필드",
      "타입",
      "필수",
      "설명",
    ]]);
    writeBlock(sheet, `A${row + 1}`, section.rows);
    styleRange(sheet, `A${row}:D${row + section.rows.length}`, {
      borders: { preset: "outside", style: "thin", color: lineColor },
      wrapText: true,
      vAlign: "center",
    });
    styleRange(sheet, `A${row}:D${row}`, {
      fill: headerFill,
      font: { color: textColor, bold: true },
      hAlign: "center",
    });
    row += section.rows.length + 3;
  }

  setColumnWidths(sheet, {
    A: 110,
    B: 120,
    C: 96,
    D: 360,
  }, 120);
  sheet.freezePanes.freezeRows(4);
}

function renderGroupedSheet(sheet, title, subtitle, sections) {
  renderTitleSheet(sheet, title, subtitle);
  writeBlock(sheet, "I1", [["← 목차"]]);
  styleRange(sheet, "I1", {
    fill: sectionFill,
    font: { color: textColor, bold: true },
    hAlign: "center",
    vAlign: "center",
  });

  let row = 4;
  for (const section of sections) {
    writeBlock(sheet, `A${row}`, [[section.title]]);
    styleRange(sheet, `A${row}:H${row}`, {
      fill: sectionFill,
      font: { color: textColor, bold: true },
      rowHeightPx: 24,
    });
    row += 1;

    writeBlock(sheet, `A${row}`, [[
      "Method",
      section.method,
      "Path",
      section.path,
      "Name",
      section.name,
      "Type",
      section.type,
    ]]);
    styleRange(sheet, `A${row}:H${row}`, {
      borders: { preset: "outside", style: "thin", color: lineColor },
      wrapText: true,
      vAlign: "center",
    });
    styleRange(sheet, `A${row}:H${row}`, {
      fill: "#FFFFFF",
    });
    styleRange(sheet, `A${row}:A${row}`, {
      fill: headerFill,
      font: { color: textColor, bold: true },
    });
    styleRange(sheet, `C${row}:C${row}`, {
      fill: headerFill,
      font: { color: textColor, bold: true },
    });
    styleRange(sheet, `E${row}:E${row}`, {
      fill: headerFill,
      font: { color: textColor, bold: true },
    });
    styleRange(sheet, `G${row}:G${row}`, {
      fill: headerFill,
      font: { color: textColor, bold: true },
    });
    styleRange(sheet, `B${row}:B${row}`, { font: { color: textColor, bold: true } });
    styleRange(sheet, `D${row}:D${row}`, { font: { color: textColor, bold: true } });
    styleRange(sheet, `F${row}:F${row}`, { font: { color: textColor, bold: true } });
    styleRange(sheet, `H${row}:H${row}`, { font: { color: textColor, bold: true } });
    row += 2;

    writeBlock(sheet, `A${row}`, [[`요약: ${section.summary}`]]);
    styleRange(sheet, `A${row}:H${row}`, {
      fill: "#F8FAFC",
      font: { color: mutedColor },
      wrapText: true,
    });
    row += 2;

    writeBlock(sheet, `A${row}`, [[
      "INPUT PARAM",
    ]]);
    styleRange(sheet, `A${row}:D${row}`, {
      fill: titleFill,
      font: { color: "#FFFFFF", bold: true },
    });
    row += 1;
    writeBlock(sheet, `A${row}`, [[
      "NAME",
      "TYPE",
      "REQUIRED",
      "DESCRIPTION",
    ]]);
    styleRange(sheet, `A${row}:D${row}`, {
      fill: headerFill,
      font: { color: textColor, bold: true },
      borders: { preset: "outside", style: "thin", color: lineColor },
      hAlign: "center",
    });
    row += 1;
    const inputRows = tableRows(section.inputs);
    writeBlock(sheet, `A${row}`, inputRows);
    styleRange(sheet, `A${row}:D${row + inputRows.length - 1}`, {
      borders: { preset: "outside", style: "thin", color: lineColor },
      wrapText: true,
      vAlign: "center",
    });
    row += inputRows.length + 1;

    writeBlock(sheet, `A${row}`, [[
      "OUTPUT PARAM",
    ]]);
    styleRange(sheet, `A${row}:D${row}`, {
      fill: titleFill,
      font: { color: "#FFFFFF", bold: true },
    });
    row += 1;
    writeBlock(sheet, `A${row}`, [[
      "NAME",
      "TYPE",
      "REQUIRED",
      "DESCRIPTION",
    ]]);
    styleRange(sheet, `A${row}:D${row}`, {
      fill: headerFill,
      font: { color: textColor, bold: true },
      borders: { preset: "outside", style: "thin", color: lineColor },
      hAlign: "center",
    });
    row += 1;
    const outputRows = tableRows(section.outputs);
    writeBlock(sheet, `A${row}`, outputRows);
    styleRange(sheet, `A${row}:D${row + outputRows.length - 1}`, {
      borders: { preset: "outside", style: "thin", color: lineColor },
      wrapText: true,
      vAlign: "center",
    });
    row += outputRows.length + 1;

    if (section.notes?.length) {
      writeBlock(sheet, `A${row}`, [[
        "비고",
      ]]);
      styleRange(sheet, `A${row}:D${row}`, {
        fill: titleFill,
        font: { color: "#FFFFFF", bold: true },
      });
      row += 1;
      const noteRows = section.notes.map((note, index) => [index + 1, note]);
      writeBlock(sheet, `A${row}`, [["No", "내용"]]);
      styleRange(sheet, `A${row}:B${row}`, {
        fill: headerFill,
        font: { color: textColor, bold: true },
        borders: { preset: "outside", style: "thin", color: lineColor },
      });
      row += 1;
      writeBlock(sheet, `A${row}`, noteRows);
      styleRange(sheet, `A${row}:B${row + noteRows.length - 1}`, {
        borders: { preset: "outside", style: "thin", color: lineColor },
        wrapText: true,
        vAlign: "center",
      });
      row += noteRows.length + 1;
    }

    row += 1;
  }

  setColumnWidths(sheet, {
    A: 150,
    B: 180,
    C: 96,
    D: 380,
    E: 120,
    F: 120,
    G: 96,
    H: 110,
    I: 80,
  }, 160);
  sheet.freezePanes.freezeRows(4);
}

function createSpecWorkbook() {
  const workbook = createWorkbook();
  const sections = [
    {
      sheet: "인프라",
      endpoints: [
        {
          method: "GET",
          path: "/health",
          name: "health",
          type: "GET",
          summary: "백엔드와 인프라 연결 상태 확인",
          title: "GET /health",
          inputs: [],
          outputs: [
            { name: "ok", type: "Boolean", required: "Y", description: "서버 응답 가능 여부" },
            { name: "storageMode", type: "String", required: "Y", description: "현재 저장 모드" },
            { name: "ingestRootDir", type: "String", required: "Y", description: "감시 루트 경로" },
            { name: "minioEndpoint", type: "String", required: "Y", description: "MinIO 연결 주소" },
            { name: "bucket", type: "String", required: "Y", description: "기본 버킷명" },
          ],
          notes: ["서버 기동 여부와 외부 저장소 연결을 함께 확인한다."],
        },
        {
          method: "GET",
          path: "/images/buckets",
          name: "bucketList",
          type: "GET",
          summary: "설정 기본 버킷과 catalog 기준 버킷 목록 조회",
          title: "GET /images/buckets",
          inputs: [],
          outputs: [
            { name: "buckets", type: "Array<string>", required: "Y", description: "기본 버킷과 catalog에 저장된 버킷 목록" },
          ],
          notes: [
            "프론트의 버킷 드롭다운에서 사용한다.",
            "MinIO 서버의 전체 접근 가능 버킷을 직접 조회하는 API는 아니다.",
          ],
        },
      ],
    },
    {
      sheet: "인제스트",
      endpoints: [
        {
          method: "POST",
          path: "/ingest/scan",
          name: "ingestScan",
          type: "POST",
          summary: "입력 폴더 재귀 스캔 및 MongoDB/MinIO 동기화",
          title: "POST /ingest/scan",
          inputs: [
            { name: "rootDir", type: "String", required: "N", description: "스캔할 루트 폴더" },
          ],
          outputs: [
            { name: "processed", type: "Number", required: "Y", description: "처리한 이미지/JSON pair 수" },
            { name: "synced", type: "Number", required: "Y", description: "동기화 성공 수" },
            { name: "partial", type: "Number", required: "Y", description: "부분 성공 수" },
            { name: "failed", type: "Number", required: "Y", description: "실패 수" },
            { name: "skipped", type: "Number", required: "Y", description: "건너뛴 pair 수" },
          ],
          notes: [
            "이미지와 JSON은 basename pair 기준으로 매칭한다.",
            "부분 성공과 실패 상태는 숨기지 않고 남긴다.",
            "동일 파일 재전입은 upsert / idempotent로 처리한다.",
          ],
        },
      ],
    },
    {
      sheet: "목록검색",
      endpoints: [
        {
          method: "GET",
          path: "/images/search",
          name: "imageSearch",
          type: "GET",
          summary: "MongoDB 기반 목록 조회 및 필터 검색",
          title: "GET /images/search",
          inputs: [
            { name: "bucket", type: "String", required: "N", description: "버킷 필터" },
            { name: "productNo", type: "String", required: "N", description: "제품번호 포함 검색" },
            { name: "processCode", type: "String", required: "N", description: "공정코드 포함 검색" },
            { name: "result", type: "String", required: "N", description: "판정 결과" },
            { name: "aiResult", type: "String", required: "N", description: "이전 호환 필드" },
            { name: "lotNo", type: "String", required: "N", description: "LOT 번호 포함 검색" },
            { name: "cameraId", type: "String", required: "N", description: "카메라 ID 포함 검색" },
            { name: "query", type: "String", required: "N", description: "파일명 및 메타데이터 통합 검색어" },
            { name: "capturedAtFrom", type: "String", required: "N", description: "촬영일시 시작" },
            { name: "capturedAtTo", type: "String", required: "N", description: "촬영일시 종료" },
            { name: "thresholdMin", type: "Number", required: "N", description: "판정 임계값 최소" },
            { name: "thresholdMax", type: "Number", required: "N", description: "판정 임계값 최대" },
            { name: "page", type: "Number", required: "N", description: "페이지 번호" },
            { name: "pageSize", type: "Number", required: "N", description: "페이지 크기" },
          ],
          outputs: [
            { name: "total", type: "Number", required: "Y", description: "총 건수" },
            { name: "page", type: "Number", required: "Y", description: "현재 페이지" },
            { name: "pageSize", type: "Number", required: "Y", description: "페이지 크기" },
            { name: "items", type: "Array<CatalogRecord>", required: "Y", description: "목록 항목" },
          ],
          notes: [
            "productNo는 포함 검색으로 동작한다.",
            "result는 OK/PASS, NG/FAIL/FAILED alias 매칭으로 동작한다.",
            "캡처 시각은 ISO 8601 문자열 범위 조건을 사용한다.",
            "lotNo와 cameraId는 별도 query parameter와 통합 query 검색을 모두 지원한다.",
          ],
        },
      ],
    },
    {
      sheet: "메타데이터",
      endpoints: [
        {
          method: "GET",
          path: "/images/:imageId/metadata",
          name: "imageMetadata",
          type: "GET",
          summary: "선택한 이미지의 정규화 레코드 조회",
          title: "GET /images/:imageId/metadata",
          inputs: [
            { name: "imageId", type: "String", required: "Y", description: "조회할 이미지 ID" },
          ],
          outputs: [
            { name: "imageId", type: "String", required: "Y", description: "이미지 ID" },
            { name: "bucket", type: "String", required: "Y", description: "버킷명" },
            { name: "fileName", type: "String", required: "Y", description: "파일명" },
            { name: "fileExt", type: "String", required: "Y", description: "파일 확장자" },
            { name: "sourcePath", type: "String", required: "Y", description: "로컬 원본 경로" },
            { name: "contentHash", type: "String", required: "Y", description: "원본 해시" },
            { name: "imageKey", type: "String", required: "Y", description: "MinIO 원본 객체 키" },
            { name: "thumbnailKey", type: "String | null", required: "N", description: "MinIO 썸네일 객체 키" },
            { name: "rawJsonKey", type: "String | null", required: "N", description: "원본 JSON 예약 키, 현재 객체 업로드 미구현" },
            { name: "metadata", type: "Object", required: "Y", description: "정규화 메타데이터" },
            { name: "syncStatus", type: "String", required: "Y", description: "동기화 상태" },
            { name: "errorMessage", type: "String | null", required: "N", description: "부분 실패 메시지" },
            { name: "createdAt", type: "String", required: "Y", description: "생성일" },
            { name: "updatedAt", type: "String", required: "Y", description: "수정일" },
          ],
          notes: ["목록 화면 우측 메타데이터 패널과 이미지 모달에서 재사용한다."],
        },
        {
          method: "GET",
          path: "/images/:imageId",
          name: "imageDetail",
          type: "GET",
          summary: "/images/:imageId/metadata와 동일한 단건 레코드 조회",
          title: "GET /images/:imageId",
          inputs: [
            { name: "imageId", type: "String", required: "Y", description: "조회할 이미지 ID" },
          ],
          outputs: [
            { name: "imageId", type: "String", required: "Y", description: "이미지 ID" },
            { name: "bucket", type: "String", required: "Y", description: "버킷명" },
            { name: "fileName", type: "String", required: "Y", description: "파일명" },
            { name: "fileExt", type: "String", required: "Y", description: "파일 확장자" },
            { name: "sourcePath", type: "String", required: "Y", description: "로컬 원본 경로" },
            { name: "contentHash", type: "String", required: "Y", description: "원본 해시" },
            { name: "imageKey", type: "String", required: "Y", description: "MinIO 원본 객체 키" },
            { name: "thumbnailKey", type: "String | null", required: "N", description: "MinIO 썸네일 객체 키" },
            { name: "rawJsonKey", type: "String | null", required: "N", description: "원본 JSON 예약 키, 현재 객체 업로드 미구현" },
            { name: "metadata", type: "Object", required: "Y", description: "정규화 메타데이터" },
            { name: "syncStatus", type: "String", required: "Y", description: "동기화 상태" },
            { name: "errorMessage", type: "String | null", required: "N", description: "부분 실패 메시지" },
            { name: "createdAt", type: "String", required: "Y", description: "생성일" },
            { name: "updatedAt", type: "String", required: "Y", description: "수정일" },
          ],
          notes: ["응답 형태는 /images/:imageId/metadata와 동일하다."],
        },
      ],
    },
    {
      sheet: "이미지파일",
      endpoints: [
        {
          method: "GET",
          path: "/images/:imageId/blob",
          name: "imageBlob",
          type: "GET",
          summary: "원본 이미지 스트리밍",
          title: "GET /images/:imageId/blob",
          inputs: [
            { name: "imageId", type: "String", required: "Y", description: "조회할 이미지 ID" },
          ],
          outputs: [
            { name: "contentType", type: "String", required: "Y", description: "이미지 MIME 타입" },
            { name: "streamBody", type: "Binary Stream", required: "Y", description: "원본 이미지 바디" },
          ],
          notes: ["다운로드보다 우선하는 고해상도 이미지 보기용 API다."],
        },
        {
          method: "GET",
          path: "/images/:imageId/thumbnail",
          name: "imageThumbnail",
          type: "GET",
          summary: "썸네일 스트리밍",
          title: "GET /images/:imageId/thumbnail",
          inputs: [
            { name: "imageId", type: "String", required: "Y", description: "조회할 이미지 ID" },
          ],
          outputs: [
            { name: "contentType", type: "String", required: "Y", description: "썸네일 MIME 타입" },
            { name: "cacheControl", type: "String", required: "Y", description: "장기 캐시 정책" },
            { name: "streamBody", type: "Binary Stream", required: "Y", description: "썸네일 바디" },
          ],
          notes: ["목록 미리보기와 모달 초기 로딩에 사용한다."],
        },
        {
          method: "GET",
          path: "/images/:imageId/download",
          name: "imageDownload",
          type: "GET",
          summary: "파일 저장용 원본 이미지 반환",
          title: "GET /images/:imageId/download",
          inputs: [
            { name: "imageId", type: "String", required: "Y", description: "조회할 이미지 ID" },
          ],
          outputs: [
            { name: "contentType", type: "String", required: "Y", description: "이미지 MIME 타입" },
            { name: "contentDisposition", type: "String", required: "Y", description: "attachment 헤더, 파일명은 현재 imageId 기준" },
            { name: "streamBody", type: "Binary Stream", required: "Y", description: "원본 이미지 바디" },
          ],
          notes: ["원본 파일 저장 버튼에서 사용한다."],
        },
      ],
    },
  ];

  const overviewSheet = addSheet(workbook, "목차");
  const rulesSheet = addSheet(workbook, "공통규약");
  const infraSheet = addSheet(workbook, "인프라");
  const ingestSheet = addSheet(workbook, "인제스트");
  const searchSheet = addSheet(workbook, "목록검색");
  const metadataSheet = addSheet(workbook, "메타데이터");
  const imageSheet = addSheet(workbook, "이미지파일");
  renderOverview(overviewSheet, sections);
  renderRulesSheet(rulesSheet);
  renderGroupedSheet(infraSheet, "인프라", "백엔드 상태와 MinIO 버킷 목록을 확인하는 API", sections[0].endpoints);
  renderGroupedSheet(ingestSheet, "인제스트", "입력 폴더를 재귀 스캔해 MongoDB와 MinIO에 동기화하는 API", sections[1].endpoints);
  renderGroupedSheet(searchSheet, "목록검색", "MongoDB 기준 목록 조회와 필터 검색 API", sections[2].endpoints);
  renderGroupedSheet(metadataSheet, "메타데이터", "정규화 레코드와 단건 레코드를 조회하는 API", sections[3].endpoints);
  renderGroupedSheet(imageSheet, "이미지파일", "원본, 썸네일, 다운로드용 이미지 전달 API", sections[4].endpoints);

  return workbook;
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const workbook = createSpecWorkbook();

  await workbook.inspect({
    kind: "table",
    sheetId: "목차",
    range: "A1:G24",
    include: "values",
    tableMaxRows: 30,
    tableMaxCols: 8,
    tableMaxCellChars: 120,
  });
  await workbook.inspect({
    kind: "table",
    sheetId: "인제스트",
    range: "A1:H30",
    include: "values",
    tableMaxRows: 40,
    tableMaxCols: 8,
    tableMaxCellChars: 120,
  });
  await workbook.inspect({
    kind: "table",
    sheetId: "이미지파일",
    range: "A1:H40",
    include: "values",
    tableMaxRows: 40,
    tableMaxCols: 8,
    tableMaxCellChars: 120,
  });

  const preview = await workbook.render({ sheetName: "목차", range: "A1:G24", scale: 1.4, format: "png" });
  await fs.writeFile(path.join(outputDir, "_preview.png"), Buffer.from(await preview.arrayBuffer()));

  const xlsx = await SpreadsheetFile.exportXlsx(workbook);
  await xlsx.save(outputPath);
  await fs.copyFile(outputPath, templatePath);

  console.log(outputDir);
}

await main();
