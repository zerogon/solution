-- 직원 관리 단순화 (2026-09-10)
--  1) 관리자가 직원을 **완전 삭제**할 수 있게 한다. User를 참조하던 RESTRICT FK가 삭제를 막고 있었다.
--     신청·차감일·조정은 CASCADE로 함께 지우고, 조정의 '행위자'만 SET NULL로 비운다
--     (관리자를 지울 때 남의 조정 이력까지 사라지면 안 된다). 감사 로그는 actor_id가 이미 SET NULL이고
--     actor_name 스냅샷이 있어 "누가 언제 지웠는지"가 남는다.
--  2) users.email / users.phone 제거 — 어디에서도 쓰지 않는다. branches.phone(지점 연락처)은 그대로다.
--  3) branch_histories 제거 — '지점 이동' 기능이 사라지고 소속 지점은 직원 수정 폼에서 바꾼다.
--     AuditAction의 CHANGE_BRANCH 값은 과거 로그 행이 참조하므로 남긴다.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'DELETE_EMPLOYEE';

-- DropForeignKey
ALTER TABLE "branch_histories" DROP CONSTRAINT "branch_histories_changed_by_id_fkey";

-- DropForeignKey
ALTER TABLE "branch_histories" DROP CONSTRAINT "branch_histories_from_branch_id_fkey";

-- DropForeignKey
ALTER TABLE "branch_histories" DROP CONSTRAINT "branch_histories_to_branch_id_fkey";

-- DropForeignKey
ALTER TABLE "branch_histories" DROP CONSTRAINT "branch_histories_user_id_fkey";

-- DropForeignKey
ALTER TABLE "leave_adjustments" DROP CONSTRAINT "leave_adjustments_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "leave_adjustments" DROP CONSTRAINT "leave_adjustments_user_id_fkey";

-- DropForeignKey
ALTER TABLE "leave_request_days" DROP CONSTRAINT "leave_request_days_user_id_fkey";

-- DropForeignKey
ALTER TABLE "leave_requests" DROP CONSTRAINT "leave_requests_user_id_fkey";

-- DropIndex
DROP INDEX "users_email_key";

-- AlterTable
ALTER TABLE "leave_adjustments" ALTER COLUMN "created_by_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "email",
DROP COLUMN "phone";

-- DropTable
DROP TABLE "branch_histories";

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request_days" ADD CONSTRAINT "leave_request_days_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

