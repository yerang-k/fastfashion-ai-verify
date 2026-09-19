// Apps Script 웹앱 배포 후 나온 URL(…/exec)을 아래 따옴표 안에 붙여 넣으세요.
// 비워 두면 학생 페이지는 예전처럼 이 기기에만 저장됩니다(교사 페이지는 동작하지 않음).
const API_URL='https://script.google.com/macros/s/AKfycbyq06AzV1mWEJ1pKYN6DB4E4kkb3j8oZ42GG4Hz2wPEEo-tgYy_2_MY94Kt1mFupCan0Q/exec';

// 반 구분: 주소 뒤에 ?class=1-3 처럼 붙이면 그 반의 설정·응답이 따로 저장됩니다. 붙이지 않으면 기본 반입니다.
const CLASS_ID=(new URLSearchParams(location.search).get('class')||'').replace(/[^A-Za-z0-9가-힣_-]/g,'').slice(0,20);
