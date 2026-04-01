export interface Session {
  id: string;
  time: string;
  track: number;
  title: string;
  speaker: string;
  isBreak?: boolean;
}

export interface TimeSlot {
  time: string;
  sessions: Session[];
}

export type UserSchedule = Record<string, string>; // time -> sessionId
