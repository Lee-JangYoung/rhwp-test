---
title: 회원 DB 명세서
version: "1.0"
author: 홍길동
date: 2026-10-15
---

## MEMBER

| 항목 | 내용 |
|---|---|
| 설명 | 회원 마스터 |
| 비고 | 탈퇴 회원도 보관한다 |

### 컬럼

| 컬럼명 | 타입 | 길이 | NULL | 설명 |
|---|---|---|---|---|
| ID | BIGINT | 20 | N | 회원 식별자 |
| NAME | VARCHAR | 50 | N | 이름 |
| EMAIL | VARCHAR | 100 | Y | 이메일 |

### 인덱스

| 인덱스명 | 컬럼 | 유니크 |
|---|---|---|
| PK_MEMBER | ID | Y |
| IX_MEMBER_EMAIL | EMAIL | N |

## LOGIN_LOG

| 항목 | 내용 |
|---|---|
| 설명 | 로그인 이력 |

### 컬럼

| 컬럼명 | 타입 | 길이 | NULL | 설명 |
|---|---|---|---|---|
| ID | BIGINT | 20 | N | 이력 식별자 |
| MEMBER_ID | BIGINT | 20 | N | 회원 식별자 |
