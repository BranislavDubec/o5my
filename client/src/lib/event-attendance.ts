export type AttendanceStatus = "going" | "maybe" | "not_going" | null | undefined;

export function getAttendanceBorderClass(status: AttendanceStatus) {
  switch (status) {
    case "going":
      return "border-2 border-green-500/80 dark:border-green-400/80";
    case "maybe":
      return "border-2 border-yellow-500/80 dark:border-yellow-400/80";
    case "not_going":
      return "border-2 border-red-500/80 dark:border-red-400/80";
    default:
      return "border-2 border-orange-500/80 dark:border-orange-400/80";
  }
}
