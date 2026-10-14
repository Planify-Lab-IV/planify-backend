import type { AttendanceActor } from "../shared/auth/attendance.actor.js";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      participantSession?: {
        participantId: string;
        eventId: string;
      };
      attendanceActor?: AttendanceActor;
    }
  }
}
export {};
