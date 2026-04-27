# MinIO API Reference

이 문서는 MinIO에서 제공하는 S3 호환 API와 객체 태깅 관련 기능만 따로 정리한 참조 문서입니다.

프로젝트 코드나 구현체 설명은 제외하고, MinIO 공식 문서 기준으로 실제 사용할 수 있는 API 중심으로 정리했습니다.

## 1. 버킷 API

MinIO는 S3 호환 버킷 API를 제공합니다.

### 1.1 `GET /`

- 버킷 목록 조회
- S3의 `ListBuckets`에 해당

### 1.2 `HEAD /{bucket}`

- 버킷 존재 여부 확인
- S3의 `HeadBucket`에 해당

### 1.3 `PUT /{bucket}`

- 버킷 생성
- S3의 `CreateBucket`에 해당

### 1.4 `DELETE /{bucket}`

- 버킷 삭제
- S3의 `DeleteBucket`에 해당

---

## 2. 객체 API

MinIO의 공식 S3 호환 문서에서 지원되는 객체 API는 다음과 같습니다.

- `CopyObject`
- `DeleteObject`
- `DeleteObjects`
- `DeleteObjectTagging`
- `GetObject`
- `GetObjectAttributes`
- `GetObjectTagging`
- `HeadObject`
- `ListObjects`
- `ListObjectsV2`
- `ListObjectVersions`
- `PutObject`
- `PutObjectTagging`
- `RestoreObject`
- `SelectObjectContent`

공식 문서:

- [S3 API Compatibility](https://docs.min.io/enterprise/aistor-object-store/developers/s3-api-compatibility/)

---

## 3. 객체 조회 및 업로드

### 3.1 `GET /{bucket}/{object}`

- 객체 본문 다운로드
- S3의 `GetObject`

### 3.2 `PUT /{bucket}/{object}`

- 객체 업로드
- S3의 `PutObject`

### 3.3 `HEAD /{bucket}/{object}`

- 객체 메타데이터 조회
- S3의 `HeadObject`

### 3.4 `DELETE /{bucket}/{object}`

- 객체 삭제
- S3의 `DeleteObject`

### 3.5 `PUT /{bucket}/{object}` with `x-amz-copy-source`

- 객체 복사
- S3의 `CopyObject`

---

## 4. 객체 목록 조회

### 4.1 `GET /{bucket}?list-type=2`

- 객체 목록 조회
- S3의 `ListObjectsV2`

대표 쿼리 파라미터:

- `prefix`
- `continuation-token`

### 4.2 `GET /{bucket}` with list semantics

- 객체 목록 조회
- S3의 `ListObjects`

MinIO의 S3 호환 API 문서에서는 `ListObjects`와 `ListObjectsV2` 둘 다 지원합니다.

---

## 5. 객체 태그 API

MinIO는 객체에 custom tags를 붙이고 조회하는 기능을 제공합니다.

공식 문서에서 확인되는 기능은 다음과 같습니다.

- 태그는 key-value 쌍입니다.
- 객체당 최대 10개의 custom tag를 지원합니다.
- 태그는 정책 제어 또는 `mc find --tags` 같은 검색에 사용할 수 있습니다.

공식 문서:

- [Objects and Versioning](https://docs.min.io/enterprise/aistor-object-store/administration/objects-and-versioning/)

### 5.1 `GET /{bucket}/{object}?tagging`

- 객체 태그 조회
- S3의 `GetObjectTagging`

### 5.2 `PUT /{bucket}/{object}?tagging`

- 객체 태그 설정
- S3의 `PutObjectTagging`

### 5.3 `DELETE /{bucket}/{object}?tagging`

- 객체 태그 삭제
- S3의 `DeleteObjectTagging`

### 5.4 `mc tag`

MinIO Client `mc`에서 태그를 다루는 대표 명령은 다음과 같습니다.

- `mc tag list`
- `mc tag set`
- `mc tag remove`

공식 문서:

- [mc tag](https://docs.min.io/enterprise/aistor-object-store/reference/cli/mc-tag/)
- [mc tag list](https://docs.min.io/enterprise/aistor-object-store/reference/cli/mc-tag/mc-tag-list/)
- [mc tag set](https://docs.min.io/community/minio-object-store/reference/minio-mc/mc-tag-set.html)

---

## 6. 자주 쓰는 헤더

객체 업로드 및 조회 시 자주 쓰는 헤더는 다음과 같습니다.

- `Content-Type`
- `x-amz-meta-*`
- `x-amz-tagging`
- `x-amz-copy-source`
- `x-amz-metadata-directive`

의미:

- `x-amz-meta-*`
  - 사용자 정의 metadata
- `x-amz-tagging`
  - 객체 태그 전달
- `x-amz-copy-source`
  - 복사 원본 지정
- `x-amz-metadata-directive`
  - 복사 시 metadata 처리 방식 지정

---

## 7. MinIO 문서상 특징

MinIO 공식 문서에서 확인되는 핵심 포인트는 다음과 같습니다.

- MinIO는 S3 API 호환 객체 저장소입니다.
- 객체 태그는 객체 metadata의 일부로 취급됩니다.
- 객체당 최대 10개의 custom tag를 지원합니다.
- 태그는 정책과 객체 탐색에 활용할 수 있습니다.
- MinIO Warp의 `warp stat`은 HEAD 기반 metadata retrieval 성능을 측정합니다.

관련 문서:

- [S3 API Compatibility](https://docs.min.io/enterprise/aistor-object-store/developers/s3-api-compatibility/)
- [Objects and Versioning](https://docs.min.io/enterprise/aistor-object-store/administration/objects-and-versioning/)
- [warp stat](https://docs.min.io/enterprise/minio-warp/reference/cli/stat/)
- [warp cmp](https://docs.min.io/enterprise/minio-warp/reference/cli/cmp/)

---

## 8. 요약

MinIO가 직접 제공하는 주요 기능은 다음 범주로 정리할 수 있습니다.

- 버킷 생성/조회/삭제
- 객체 업로드/조회/삭제
- 객체 목록 조회
- 객체 metadata 조회
- 객체 tag 조회/설정/삭제
- S3 호환 SigV4 인증 요청
- `mc` CLI를 통한 tag 관리

