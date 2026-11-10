# 이미지 인식 인덱스

명부와 이미지 특징은 별도 명령으로 생성합니다.

- `npm run catalog:generate`: CSV에서 `rescene-catalog.generated.json` 생성
- `npm run recognition:index`: `public/rescene_poca`에서 XFeat 특징을 추출하여 `public/rescene-xfeat-index.bin` 생성

이미지 확장자는 고정하지 않습니다. CSV의 `cardId`와 같은 파일명의 실제 이미지를 찾아 사용하므로 PNG, JPG, WebP를 사용할 수 있습니다. 이미지나 메타데이터가 바뀌면 생성 명령을 다시 실행해야 합니다.

## 인식 순서

1. XFeat ONNX 모델이 업로드 사진에서 학습된 특징점과 64차원 기술자를 추출합니다.
2. 전체 이미지의 XFeat 표현으로 후보 80장을 고릅니다.
3. 업로드 사진과 후보의 기술자를 상호 최근접 코사인 유사도로 연결합니다.
4. RANSAC homography로 위치 관계와 공간 분포가 일관된 대응점만 남깁니다.
5. 강한 결과는 유력 결과로 표시하고, 애매한 결과는 상위 후보 4장을 보여 사용자가 직접 선택하게 합니다.

이미지와 인식은 브라우저 안에서 처리되며 외부 AI API나 토큰을 사용하지 않습니다.

모델과 인덱스 URL에는 내용 해시가 붙습니다. 인식 점수는 비교용 지표이며 정답 확률이 아닙니다.

## 회귀 테스트

`public/poca_test/<cardId>.jpg`의 실물 사진은 브라우저 회귀 테스트에 사용합니다. 원본 사진은 수정하지 않습니다.

2026-11-10 Chrome 운영 빌드 검증 결과:

- ID가 있는 실물 촬영 사진 31장: 31장 모두 정답 1순위.
- ID가 없는 `20261103_000859.jpg`: `F0C96F71` 1순위이며 등록 이미지와 육안 대조 확인.
- 회전 9도, 밝기 82%, 배경 추가 JPEG: `39B58F31` 1순위, 검증 특징점 50개.
- 단색 PNG는 결과 없음으로 거부.
- `F8413EA5`와 `9FFEDA3C`처럼 사실상 같은 유닛 이미지는 정답을 1순위로 두되 후보 선택 상태로 표시.

이 결과는 현재 테스트 세트 기준이며 모든 카메라·반사·가림 조건을 보장하지는 않습니다.

## 출처와 라이선스

- XFeat: VERLab, *XFeat: Accelerated Features for Lightweight Image Matching*, CVPR 2024, Apache-2.0.
- ONNX 변환 모델: Kazuhito Takahashi의 XFeat Image Matching ONNX Sample, Apache-2.0.
- ONNX Runtime Web: Microsoft. 브라우저 내 추론 런타임.

원문 라이선스는 저장소의 `THIRD_PARTY_LICENSES`에 보존합니다. LighterGlue는 공식 XFeat용 브라우저 ONNX 배포물이 없어 현재 구현에 포함하지 않았습니다.
