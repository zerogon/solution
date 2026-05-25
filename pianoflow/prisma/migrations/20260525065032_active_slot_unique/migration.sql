-- 동일 선생님/시간에 ACTIVE 예약이 둘 이상 존재할 수 없도록 부분 유니크 인덱스
-- CANCELLED 상태는 인덱스에서 제외되어 재예약이 가능합니다.
CREATE UNIQUE INDEX "reservation_teacher_slot_active_uniq"
  ON "reservations" ("teacher_id", "slot_datetime")
  WHERE "status" = 'ACTIVE';
