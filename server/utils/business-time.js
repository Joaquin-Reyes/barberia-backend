const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIME_ZONE || "America/Argentina/Buenos_Aires";

function zonedParts(value, timeZone = BUSINESS_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function isDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function businessDate(value = new Date(), timeZone = BUSINESS_TIME_ZONE) {
  const parts = zonedParts(value, timeZone);
  if (!parts) return null;
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function addDays(dateString, days) {
  if (!isDateString(dateString)) return null;
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function monthStart(dateString = businessDate()) {
  return isDateString(dateString) ? `${dateString.slice(0, 7)}-01` : null;
}

function zonedDateTimeToUtc(dateString, time = "00:00:00.000", timeZone = BUSINESS_TIME_ZONE) {
  if (!isDateString(dateString)) return null;

  const match = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{3}))?)?$/.exec(time);
  if (!match) return null;

  const [year, month, day] = dateString.split("-").map(Number);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  const millisecond = Number(match[4] || 0);
  if (hour > 23 || minute > 59 || second > 59) return null;

  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let candidate = desiredUtc;

  for (let index = 0; index < 2; index++) {
    const parts = zonedParts(new Date(candidate), timeZone);
    const representedUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      millisecond
    );
    candidate = desiredUtc - (representedUtc - candidate);
  }

  return new Date(candidate);
}

function businessDateRangeUtc(desde, hasta, timeZone = BUSINESS_TIME_ZONE) {
  if (!isDateString(desde) || !isDateString(hasta)) return null;
  const nextDay = addDays(hasta, 1);
  return {
    start: zonedDateTimeToUtc(desde, "00:00:00.000", timeZone).toISOString(),
    endExclusive: zonedDateTimeToUtc(nextDay, "00:00:00.000", timeZone).toISOString(),
  };
}

module.exports = {
  BUSINESS_TIME_ZONE,
  businessDate,
  businessDateRangeUtc,
  isDateString,
  monthStart,
};
