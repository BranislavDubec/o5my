import { createSign } from "node:crypto";
import { storage } from "./storage";
import { getUserEventDescription } from "./google-event-description";

interface GoogleCalendarEventItem {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

function inferEventType(summary = "") {
  const normalized = summary.toLowerCase();

  if (
    normalized.includes("team building") ||
    normalized.includes("teambuilding") ||
    normalized.includes("team-building") ||
    normalized.includes("bonding")
  ) {
    return "teambuilding";
  }

  if (
    normalized.includes("training") ||
    normalized.includes("trening") ||
    normalized.includes("practice") ||
    normalized.includes("prac") ||
    normalized.includes("session")
  ) {
    return "training";
  }

  return "match";
}

function parseGoogleMatchMetadata(summary = "", description = "") {
  const opponentFromDescription = description
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line.toLocaleLowerCase("sk").startsWith("súper:"))
    ?.slice("súper:".length)
    .trim();
  const sideFromDescription = description
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line.toLocaleLowerCase("sk").startsWith("strana:"))
    ?.slice("strana:".length)
    .trim()
    .toLocaleLowerCase("sk");

  let opponent = opponentFromDescription || undefined;
  const awaySideMarkers = ["vypraven", "výprav", "vonku", "hostia", "away"];
  let homeAway: "home" | "away" | undefined = sideFromDescription
    ? awaySideMarkers.some(marker => sideFromDescription.includes(marker)) ? "away" : "home"
    : undefined;

  const title = summary.replace(/^zápas\s*:\s*/i, "").trim();
  const homeMatch = title.match(/^o5my(?:\s+futsal)?\s+(?:vs\.?|[-–])\s+(.+)$/i);
  const awayMatch = title.match(/^(.+?)\s+(?:vs\.?|[-–])\s+o5my(?:\s+futsal)?$/i);
  if (!opponent && homeMatch?.[1]) opponent = homeMatch[1].trim();
  if (!opponent && awayMatch?.[1]) opponent = awayMatch[1].trim();
  if (!homeAway && homeMatch) homeAway = "home";
  if (!homeAway && awayMatch) homeAway = "away";

  return { opponent, homeAway };
}

function parseGoogleDate(value?: { date?: string; dateTime?: string }) {
  if (!value) return null;
  const raw = value.dateTime || value.date;
  if (!raw) return null;

  const candidate = value.dateTime ? new Date(raw) : new Date(`${raw}T00:00:00`);
  return Number.isNaN(candidate.getTime()) ? null : candidate.toISOString();
}

function toGoogleDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString();
}

function resolveGoogleEndTime(startTime: string, endTime?: string | null) {
  if (endTime) return toGoogleDateTime(endTime);

  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) return toGoogleDateTime(startTime);

  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return end.toISOString();
}

function getServiceAccountCredentials() {
  const rawCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!rawCredentials) {
    return null;
  }

  try {
    return JSON.parse(rawCredentials);
  } catch {
    return null;
  }
}

async function getGoogleAccessToken() {
  const explicitToken = process.env.GOOGLE_CALENDAR_ACCESS_TOKEN;
  if (explicitToken) {
    return explicitToken;
  }

  const credentials = getServiceAccountCredentials();
  if (!credentials?.client_email || !credentials?.private_key || !credentials?.token_uri) {
    throw new Error("Google service account credentials are not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON to the service-account JSON contents.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/calendar.events",
    aud: credentials.token_uri,
    iat: now - 60,
    exp: now + 3600,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(credentials.private_key, "base64url");
  const assertion = `${signingInput}.${signature}`;

  const response = await fetch(credentials.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const tokenPayload = await response.json().catch(() => ({}));
  if (!response.ok || !tokenPayload.access_token) {
    throw new Error(tokenPayload.error_description || tokenPayload.error || "Failed to obtain Google access token.");
  }

  return tokenPayload.access_token as string;
}

interface WritableGoogleCalendarEvent {
  type: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startTime: string;
  endTime?: string | null;
  opponent?: string | null;
  homeAway?: string | null;
}

function buildGoogleEventDescription(event: WritableGoogleCalendarEvent) {
  const eventTypeLabel = event.type === "match"
    ? "Zápas"
    : event.type === "teambuilding"
      ? "Team building"
      : "Tréning";

  const descriptionParts = [`Typ: ${eventTypeLabel}`];
  const userDescription = getUserEventDescription(event.description);
  if (userDescription) descriptionParts.push(userDescription);
  if (event.opponent) descriptionParts.push(`Súper: ${event.opponent}`);
  if (event.homeAway) descriptionParts.push(`Strana: ${event.homeAway === "home" ? "Domáci" : "Hostia"}`);
  return descriptionParts;
}

function buildGoogleEventPayload(event: WritableGoogleCalendarEvent) {
  return {
    summary: event.title,
    description: buildGoogleEventDescription(event).join("\n"),
    location: event.location || undefined,
    start: { dateTime: toGoogleDateTime(event.startTime) },
    end: { dateTime: resolveGoogleEndTime(event.startTime, event.endTime) },
  };
}

export async function createGoogleCalendarEvent(
  event: WritableGoogleCalendarEvent,
  options: {
    calendarId?: string;
    accessToken?: string;
  } = {}
) {
  const calendarId = options.calendarId || process.env.GOOGLE_CALENDAR_ID || "primary";

  const accessToken = options.accessToken || process.env.GOOGLE_CALENDAR_ACCESS_TOKEN || await getGoogleAccessToken();
  if (!accessToken) {
    throw new Error("Google OAuth access token nie je nastavený. Potrebný je autorizovaný prístup k Google Calendar.");
  }

  const payload = buildGoogleEventPayload(event);

  console.log(`[google-calendar] Sending payload to Google Calendar:`, JSON.stringify(payload));

  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const responseBody = await response.json().catch(() => ({}));
  console.log(`[google-calendar] Create response status: ${response.status}`);
  console.log(`[google-calendar] Create response body:`, JSON.stringify(responseBody));
  if (!response.ok) {
    const reason = responseBody?.error?.errors?.[0]?.reason || responseBody?.error?.status || "unknown";
    const message = responseBody?.error?.message || "Google Calendar event creation failed";
    throw new Error(`${message} (${reason})`);
  }

  return responseBody;
}

export async function updateGoogleCalendarEvent(
  event: WritableGoogleCalendarEvent & { externalId?: string | null },
  options: {
    calendarId?: string;
    accessToken?: string;
  } = {}
) {
  if (!event.externalId) return null;

  const calendarId = options.calendarId || process.env.GOOGLE_CALENDAR_ID || "primary";
  const accessToken = options.accessToken || process.env.GOOGLE_CALENDAR_ACCESS_TOKEN || await getGoogleAccessToken();
  if (!accessToken) {
    throw new Error("Google OAuth access token nie je nastavený. Potrebný je autorizovaný prístup k Google Calendar.");
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event.externalId)}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(buildGoogleEventPayload(event)),
  });

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = responseBody?.error?.errors?.[0]?.reason || responseBody?.error?.status || "unknown";
    const message = responseBody?.error?.message || "Google Calendar event update failed";
    throw new Error(`${message} (${reason})`);
  }

  return responseBody;
}

export async function updateGoogleCalendarEventAttendance(
  event: WritableGoogleCalendarEvent & {
    externalId?: string | null;
  },
  responses: Array<{ status: string; user?: { name?: string | null } }> = [],
  options: {
    calendarId?: string;
    accessToken?: string;
  } = {}
) {
  if (!event.externalId) return null;

  const calendarId = options.calendarId || process.env.GOOGLE_CALENDAR_ID || "primary";
  const accessToken = options.accessToken || process.env.GOOGLE_CALENDAR_ACCESS_TOKEN || await getGoogleAccessToken();
  if (!accessToken) {
    throw new Error("Google OAuth access token nie je nastavený. Potrebný je autorizovaný prístup k Google Calendar.");
  }

  const counts = {
    going: responses.filter(r => r.status === "going").length,
    maybe: responses.filter(r => r.status === "maybe").length,
    not_going: responses.filter(r => r.status === "not_going").length,
  };

  const groupedNames = {
    going: responses.filter(r => r.status === "going").map(r => r.user?.name).filter(Boolean).slice(0, 20) as string[],
    maybe: responses.filter(r => r.status === "maybe").map(r => r.user?.name).filter(Boolean).slice(0, 20) as string[],
    not_going: responses.filter(r => r.status === "not_going").map(r => r.user?.name).filter(Boolean).slice(0, 20) as string[],
  };

  const descriptionLines = buildGoogleEventDescription(event);
  descriptionLines.push(`Účasť: Idú ${counts.going}, Možno ${counts.maybe}, Neidú ${counts.not_going}`);
  if (groupedNames.going.length > 0) {
    descriptionLines.push(`Idú: ${groupedNames.going.join(", ")}`);
  }
  if (groupedNames.maybe.length > 0) {
    descriptionLines.push(`Možno: ${groupedNames.maybe.join(", ")}`);
  }
  if (groupedNames.not_going.length > 0) {
    descriptionLines.push(`Neidú: ${groupedNames.not_going.join(", ")}`);
  }

  const payload = {
    description: descriptionLines.filter(Boolean).join("\n"),
  };

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event.externalId)}`;
  console.log(`[google-calendar] Updating attendance in Google Calendar: ${url}`);

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const responseBody = await response.json().catch(() => ({}));
  console.log(`[google-calendar] Attendance update response status: ${response.status}`);
  console.log(`[google-calendar] Attendance update response body:`, JSON.stringify(responseBody));

  if (!response.ok) {
    const reason = responseBody?.error?.errors?.[0]?.reason || responseBody?.error?.status || "unknown";
    throw new Error(`Google Calendar attendance update failed (${reason})`);
  }

  return responseBody;
}

export async function deleteGoogleCalendarEvent(
  externalId: string | null | undefined,
  options: {
    calendarId?: string;
    accessToken?: string;
  } = {}
) {
  if (!externalId) return null;

  const calendarId = options.calendarId || process.env.GOOGLE_CALENDAR_ID || "primary";
  const accessToken = options.accessToken || process.env.GOOGLE_CALENDAR_ACCESS_TOKEN || await getGoogleAccessToken();
  if (!accessToken) {
    throw new Error("Google OAuth access token nie je nastavený. Potrebný je autorizovaný prístup k Google Calendar.");
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalId)}`;
  console.log(`[google-calendar] Deleting event from Google Calendar: ${url}`);

  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 404) {
    return null;
  }

  const responseText = await response.text();
  console.log(`[google-calendar] Delete response status: ${response.status}`);
  console.log(`[google-calendar] Delete response body:`, responseText);

  if (!response.ok) {
    throw new Error(`Google Calendar event deletion failed (${response.status})`);
  }

  return true;
}

export async function syncGoogleCalendarEvents(options: {
  calendarId?: string;
  accessToken?: string;
  refreshToken?: string;
  userId: number;
}) {
  const calendarId = options.calendarId || process.env.GOOGLE_CALENDAR_ID || "primary";

  const accessToken = options.accessToken || process.env.GOOGLE_CALENDAR_ACCESS_TOKEN || await getGoogleAccessToken();
  if (!accessToken) {
    throw new Error("Google OAuth access token nie je nastavený. Potrebný je autorizovaný prístup k Google Calendar.");
  }

  const now = new Date();
  const timeMin = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    timeMin,
    timeMax,
  });

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;
  const headers: HeadersInit = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  console.log(`[google-calendar] Fetching events from URL: ${url}`);
  const response = await fetch(url, { headers });
  const payload = await response.json().catch(() => ({}));
  console.log(`[google-calendar] Sync response status: ${response.status}`);
  console.log(`[google-calendar] Sync response body:`, JSON.stringify(payload));

  if (!response.ok) {
    const reason = payload?.error?.errors?.[0]?.reason || payload?.error?.status || "unknown";
    const message = payload?.error?.message || "Google Calendar request failed";
    const detail = reason === "accessNotConfigured"
      ? "Google Calendar API is not enabled for the project or the calendar is not accessible with the provided credentials."
      : reason === "forbidden"
        ? "The supplied OAuth token does not have permission to read this calendar."
        : reason === "notFound"
          ? "The supplied calendar ID could not be found."
          : message;
    throw new Error(`${detail} (${reason})`);
  }

  const items = Array.isArray(payload.items) ? (payload.items as GoogleCalendarEventItem[]) : [];
  let created = 0;
  let updated = 0;

  for (const item of items) {
    if (!item.id) continue;

    const startTime = parseGoogleDate(item.start);
    const endTime = parseGoogleDate(item.end) || startTime;
    if (!startTime || !endTime) continue;

    const type = inferEventType(item.summary || "");
    const normalizedTitle = item.summary || "Google event";
    const matchMetadata: { opponent?: string; homeAway?: "home" | "away" } = type === "match"
      ? parseGoogleMatchMetadata(normalizedTitle, item.description || "")
      : {};

    const eventData = {
      type,
      title: normalizedTitle,
      description: getUserEventDescription(item.description) || undefined,
      location: item.location || undefined,
      startTime,
      endTime,
      opponent: type === "match" ? matchMetadata.opponent : undefined,
      homeAway: type === "match" ? matchMetadata.homeAway : undefined,
      createdBy: options.userId,
      externalId: item.id,
      source: "google",
    };

    const matchesByGoogleId = storage.getEventsByExternalId(item.id);
    const existingByGoogleId = matchesByGoogleId.find(existingEvent => existingEvent.source === "local")
      || matchesByGoogleId[0];
    const existingByTitle = !existingByGoogleId ? storage.getAllEvents().find(existingEvent =>
      existingEvent.source === "local" &&
      existingEvent.title === normalizedTitle &&
      existingEvent.startTime === startTime &&
      existingEvent.endTime === endTime
    ) : undefined;

    const existing = existingByGoogleId || existingByTitle;

    if (existing) {
      storage.updateEvent(existing.id, {
        ...eventData,
        opponent: type === "match" ? matchMetadata.opponent || existing.opponent : null,
        homeAway: type === "match" ? matchMetadata.homeAway || existing.homeAway || "home" : null,
        source: existing.source === "google" ? "google" : "local",
      } as any);

      const responseUserIds = new Set(
        storage.getEventResponses(existing.id).map(response => response.userId),
      );

      for (const duplicate of matchesByGoogleId) {
        if (duplicate.id === existing.id) continue;

        for (const response of storage.getEventResponses(duplicate.id)) {
          if (responseUserIds.has(response.userId)) continue;

          storage.upsertEventResponse({
            eventId: existing.id,
            userId: response.userId,
            status: response.status,
            note: response.note,
          });
          responseUserIds.add(response.userId);
        }

        storage.deleteEvent(duplicate.id);
      }

      updated += 1;
    } else {
      storage.createEvent({
        ...eventData,
        homeAway: type === "match" ? matchMetadata.homeAway || "home" : undefined,
      } as any);
      created += 1;
    }
  }

  return {
    synced: created + updated,
    created,
    updated,
    count: items.length,
  };
}
