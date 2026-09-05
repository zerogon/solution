-- 승인 절차 제거 (2026-09-05).
-- 신청 즉시 확정(CONFIRMED)·차감. 기존 행은 APPROVED→CONFIRMED, PENDING/REJECTED→CANCELLED로 옮기고
-- PENDING/REJECTED가 점유하던 날짜(leave_request_days)는 놓아 준다. 손으로 손질한 마이그레이션이라
-- 시드된 로컬 DB 위에서도 그대로 적용된다.

-- 1. 취소 사유 컬럼 — 관리자 취소 사유는 이미 rejection_reason에 저장되고 있었다.
ALTER TABLE "leave_requests" RENAME COLUMN "rejection_reason" TO "cancel_reason";

-- 2. 대기/반려 건이 점유하던 날짜 해제 (PENDING은 usedDays를 건드린 적이 없으므로 잔액 보정 불필요).
DELETE FROM "leave_request_days"
WHERE "leave_request_id" IN (SELECT "id" FROM "leave_requests" WHERE "status" IN ('PENDING', 'REJECTED'));

-- 3. LeaveStatus: { PENDING, APPROVED, REJECTED, CANCELLED } → { CONFIRMED, CANCELLED }
BEGIN;
ALTER TABLE "leave_requests" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "leave_requests" ALTER COLUMN "status" TYPE TEXT USING ("status"::text);
UPDATE "leave_requests" SET "status" = 'CONFIRMED' WHERE "status" = 'APPROVED';
UPDATE "leave_requests" SET "status" = 'CANCELLED' WHERE "status" IN ('PENDING', 'REJECTED');
DROP TYPE "LeaveStatus";
CREATE TYPE "LeaveStatus" AS ENUM ('CONFIRMED', 'CANCELLED');
ALTER TABLE "leave_requests" ALTER COLUMN "status" TYPE "LeaveStatus" USING ("status"::"LeaveStatus");
ALTER TABLE "leave_requests" ALTER COLUMN "status" SET DEFAULT 'CONFIRMED';
COMMIT;

-- 4. AuditAction: APPROVE_REQUEST / REJECT_REQUEST 제거 (해당 이력은 승인 절차와 함께 사라진다).
BEGIN;
DELETE FROM "audit_logs" WHERE "action" IN ('APPROVE_REQUEST', 'REJECT_REQUEST');
CREATE TYPE "AuditAction_new" AS ENUM ('LOGIN', 'CREATE_EMPLOYEE', 'UPDATE_EMPLOYEE', 'CHANGE_EMPLOYEE_STATUS', 'RESET_PASSWORD', 'CHANGE_BRANCH', 'CREATE_BRANCH', 'UPDATE_BRANCH', 'CHANGE_BRANCH_STATUS', 'GRANT_LEAVE', 'ADJUST_LEAVE', 'CARRY_OVER_LEAVE', 'CANCEL_REQUEST_ADMIN');
ALTER TABLE "audit_logs" ALTER COLUMN "action" TYPE "AuditAction_new" USING ("action"::text::"AuditAction_new");
ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";
ALTER TYPE "AuditAction_new" RENAME TO "AuditAction";
DROP TYPE "AuditAction_old";
COMMIT;

-- 5. NotificationType: REQUEST_APPROVED / REQUEST_REJECTED 제거.
BEGIN;
DELETE FROM "notifications" WHERE "type" IN ('REQUEST_APPROVED', 'REQUEST_REJECTED');
CREATE TYPE "NotificationType_new" AS ENUM ('REQUEST_CREATED', 'REQUEST_CANCELLED', 'LEAVE_ADJUSTED');
ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "NotificationType_old";
COMMIT;

-- 6. 승인자 컬럼 제거.
ALTER TABLE "leave_requests" DROP CONSTRAINT "leave_requests_approved_by_id_fkey";
ALTER TABLE "leave_requests" DROP COLUMN "approved_at", DROP COLUMN "approved_by_id";
