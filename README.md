# 포카포켓 (PocaPocket)

포토카드 명부, 무료 온디바이스 이미지 인식, 개인 수집 앨범을 한 프로젝트에 담은 오픈소스 팬 툴입니다. 실제 포카 이미지 대신 리센느 예시 메타데이터와 플레이스홀더가 포함되어 있습니다.

## 핵심 기능

- 멤버·단체·유닛, 앨범·이벤트, 출처, 희소성 등 확장 가능한 태그 기반 명부
- 사진 촬영/업로드 후 사전 등록 포카와 기기 내 매칭
- 명부식 또는 촬영식 수집 모드, 미인식 포카의 비공개 보관 및 추가 요청 흐름
- 포카 바인더 스타일의 `나의 포카`, 수집률·소장자 수·공개 앨범
- 원본·블러·소장자만 원본 공개 이미지 정책
- 기능 플래그와 독립 명부 모듈로 팬사이트별 자유로운 구성

## 빠른 시작

```bash
npm install
npm run dev
```

Node.js 22.13 이상이 필요합니다. 배포 빌드는 `npm run build`로 만듭니다.

## Google 로그인과 사용자 데이터

계정은 Supabase Auth의 Google 로그인을 사용하고, 소장 포카는 `user_cards` 테이블에 저장합니다. 브라우저에는 공개 가능한 publishable/anon key만 제공하며, 각 사용자는 RLS 정책상 자신의 행만 읽고 추가·삭제할 수 있습니다.

1. Supabase 대시보드에서 Google provider를 활성화합니다.
2. SQL Editor에서 `supabase/migrations/202611110001_user_cards.sql`을 실행합니다.
3. `.env.example`을 참고해 로컬 환경변수를 설정합니다.
4. Auth URL Configuration의 Site URL을 운영 주소로 설정하고 `http://localhost:3000/**` 등 개발용 Redirect URL을 추가합니다.

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
ADMIN_EMAIL=YOUR_GOOGLE_ACCOUNT_EMAIL
```

`ADMIN_EMAIL`은 서버 전용 값입니다. 로그인 토큰을 서버에서 검증한 뒤 해당 Google 계정에만 관리자 UI를 노출하며, 향후 관리자 API도 같은 검사를 거쳐야 합니다. Supabase secret/service-role key는 브라우저 코드나 저장소에 넣지 마세요.

## 프로젝트 구조

```text
app/                     웹 진입점과 전역 스타일
components/              포카포켓 UI
modules/catalog/         재사용 가능한 명부 코어
  data.ts                예시 포카/멤버/컬렉션 데이터
  types.ts               공개 데이터 타입
  config.ts              기능 및 이미지 정책 기본값
  xfeat-matcher.ts       브라우저 XFeat 이미지 매칭
public/cards/             교체 가능한 예시 이미지
site.config.ts            사이트별 최상위 설정
```

명부만 필요한 프로젝트는 `modules/catalog`을 복사하거나 별도 패키지로 추출할 수 있습니다. UI는 해당 모듈의 공개 타입만 사용합니다.

## 이미지 인식 설계

서버 AI나 유료 토큰을 사용하지 않습니다. Apache-2.0 XFeat 사전학습 모델을 ONNX Runtime Web으로 사용자 브라우저에서 실행합니다.

1. XFeat가 등록 원본과 촬영 사진에서 학습된 특징점·기술자를 추출
2. 전체 이미지의 XFeat 표현으로 후보 선별
3. 상호 최근접 코사인 유사도로 특징점 대응
4. RANSAC homography로 기하 관계와 공간 분포 검증
5. 확신도가 낮으면 최대 4개 후보를 보여 사용자가 선택

등록 원본의 특징은 `npm run recognition:index`로 미리 생성합니다. 업로드 사진은 서버로 전송하지 않습니다. 현재 구현은 XFeat와 상호 최근접 매칭을 사용하며, 공식 브라우저용 XFeat LighterGlue ONNX가 없어 LighterGlue는 포함하지 않습니다.

## 데이터 추가

리센느 원본 메타데이터는 `data/rescene/rescene_photocards.csv`, 이미지는 `public/rescene_poca`에서 관리합니다. CSV의 `localPath`는 `/rescene_poca/{cardId}.{실제 확장자}` 형식이며 외부 이미지 URL은 저장하지 않습니다.

`npm run catalog:generate`는 2,220장의 명부 JSON을 생성합니다. 이미지가 추가·교체되면 `npm run recognition:index`를 한 번 실행해 XFeat 인덱스를 다시 만드세요. 특징 추출에는 API 토큰이 들지 않으며 로컬 CPU를 사용합니다. 운영 환경에서는 CSV 어댑터를 D1/PostgreSQL 저장소로 교체할 수 있습니다.

## 기능 설정

`site.config.ts`에서 `recognition`, `collections`, `publicAlbums`, `requests`, `blurUnowned`를 켜거나 끌 수 있습니다. 저장소 구현과 인증은 어댑터 경계에 두어 정적 명부만 배포하는 구성도 유지할 수 있습니다.

## 현재 데모 범위

검색, 필터, 소장 체크, 앨범 UI, 이미지 공개 정책과 XFeat 기반 실제 업로드 매칭이 동작합니다. 운영 전에는 실제 원본·다양한 조명과 각도의 검증 세트로 임계값을 보정하고, 관리자 업로드·검수 API와 영속 저장소를 연결해야 합니다.

## 크레딧

- 포카 이미지·메타데이터 출처: [리센느 음원총공팀 포카사전](https://rescene.stream/apps/photocards)
- 특징 추출: [VERLab XFeat](https://github.com/verlab/accelerated_features), CVPR 2024, Apache-2.0
- ONNX 변환 모델: [XFeat Image Matching ONNX Sample](https://github.com/Kazuhito00/XFeat-Image-Matching-ONNX-Sample), Apache-2.0
- 브라우저 추론: [ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript/web.html)

제3자 라이선스 원문은 `THIRD_PARTY_LICENSES`에 포함합니다.

## 라이선스

프로젝트 코드는 MIT 라이선스로 배포할 수 있도록 구성했습니다. XFeat와 ONNX 변환 모델에는 Apache-2.0이 적용됩니다. 포토카드 이미지와 메타데이터는 위 출처 및 각 권리자의 조건을 따르며 프로젝트 코드 라이선스에 포함되지 않습니다.
