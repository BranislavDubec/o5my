export function localEventTimeToIso(date: string, time: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);

  if (!dateMatch || !timeMatch) {
    throw new Error("Neplatný dátum alebo čas");
  }

  const [, yearText, monthText, dayText] = dateMatch;
  const [, hourText, minuteText] = timeMatch;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const localTime = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (
    localTime.getFullYear() !== year ||
    localTime.getMonth() !== month - 1 ||
    localTime.getDate() !== day ||
    localTime.getHours() !== hour ||
    localTime.getMinutes() !== minute
  ) {
    throw new Error("Neplatný dátum alebo čas");
  }

  return localTime.toISOString();
}

export function eventEndPrecedesStart(startTime: string, endTime?: string | null) {
  return Boolean(endTime && Date.parse(endTime) < Date.parse(startTime));
}
