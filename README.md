<!-- ========================= README (간단) ========================= -->

/*
사용 가이드(요약)
1) 프로젝트 폴더 생성 후 index.html과 server.js를 저장
2) data/centers.csv를 공공데이터포털(예: 보건복지부/국립정신건강센터 제공)에서 내려받아 해당 경로에 넣으세요. (lat, lng 컬럼 권장)
   - 데이터 예시 출처: 공공데이터포털 '정신건강 관련기관 정보' 등. (데이터 링크는 채팅 본문을 확인)
3) Node 설치 후: npm init -y && npm i express node-fetch csv-parse
4) 환경변수 설정: export OPENAI_API_KEY=sk-... (Windows: set)
5) node server.js
6) 브라우저로 http://localhost:3000 접속

주의사항:
- 이 코드는 교육용 MVP 샘플입니다. 실제 서비스 전에는 법률/윤리/보안 검토, 전문가 검토가 필요합니다.
- 위치정보 사용은 사용자 동의가 필요합니다.
*/
