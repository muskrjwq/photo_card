# Catalog Core

포카 명부만 필요한 팬사이트를 위한 독립 모듈입니다.

- `types.ts`: 포카와 기능 설정의 공개 타입
- `data.ts`: 교체 가능한 예시 메타데이터
- `config.ts`: 기능 플래그와 이미지 정책
- `matcher.ts`: 가벼운 1차 후보 점수
- `opencv-matcher.ts`: 브라우저 OpenCV.js 정밀 매칭
- `index.ts`: 서버에서도 안전한 공개 엔트리

일반 명부에는 `@/modules/catalog`을 가져오고, 사진 인식 화면에서만
`@/modules/catalog/opencv-matcher`를 동적/클라이언트 전용으로 가져오세요.
이렇게 하면 명부만 쓰는 사이트는 큰 OpenCV 청크를 다운로드하지 않습니다.

데이터 저장소와 UI는 분리되어 있습니다. `CatalogCard[]`를 반환하는 어댑터만
작성하면 정적 JSON, CSV, D1, PostgreSQL 등으로 교체할 수 있습니다.
