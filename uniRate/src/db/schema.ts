import { integer, real, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

// 대학교 테이블
export const universities = sqliteTable(
  'universities',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),           // 대학명
    region: text('region').notNull(),        // 지역 (서울, 경기, 부산 등)
    type: text('type').notNull(),            // 유형: 국립 | 사립 | 공립
  },
  (table) => [
    index('idx_universities_region').on(table.region),
  ]
);

// 학과 테이블
export const departments = sqliteTable(
  'departments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    universityId: integer('university_id')
      .notNull()
      .references(() => universities.id),
    name: text('name').notNull(),            // 학과명
    category: text('category').notNull(),    // 계열: 인문 | 사회 | 자연 | 공학 | 의약 | 예체능 | 교육
  },
  (table) => [
    index('idx_departments_university_id').on(table.universityId),
  ]
);

// 입시 유형 테이블
export const admissionTypes = sqliteTable('admission_types', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),              // 입시유형: 수시 | 정시 | 편입
});

// 경쟁률 테이블
export const competitionRates = sqliteTable(
  'competition_rates',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    departmentId: integer('department_id')
      .notNull()
      .references(() => departments.id),
    admissionTypeId: integer('admission_type_id')
      .notNull()
      .references(() => admissionTypes.id),
    year: integer('year').notNull(),         // 입시 연도
    applicants: integer('applicants').notNull(), // 지원자 수
    accepted: integer('accepted').notNull(),    // 모집 인원
    rate: real('rate').notNull(),               // 경쟁률 (applicants / accepted)
  },
  (table) => [
    index('idx_competition_rates_year_dept').on(table.year, table.departmentId),
  ]
);

// 타입 추론용 export
export type University = typeof universities.$inferSelect;
export type NewUniversity = typeof universities.$inferInsert;
export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
export type AdmissionType = typeof admissionTypes.$inferSelect;
export type NewAdmissionType = typeof admissionTypes.$inferInsert;
export type CompetitionRate = typeof competitionRates.$inferSelect;
export type NewCompetitionRate = typeof competitionRates.$inferInsert;
