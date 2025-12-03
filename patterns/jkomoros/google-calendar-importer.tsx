/// <cts-enable />
import {
  Cell,
  cell,
  computed,
  Default,
  derive,
  getRecipeEnvironment,
  handler,
  ifElse,
  NAME,
  navigateTo,
  patternTool,
  pattern,
  str,
  UI,
  wish,
} from "commontools";
import GoogleAuth from "./google-auth.tsx";

type CFC<T, C extends string> = T;
type Secret<T> = CFC<T, "secret">;
type Confidential<T> = CFC<T, "confidential">;

// This is used by the various Google tokens created with tokenToAuthData
export type Auth = {
  token: Default<Secret<string>, "">;
  tokenType: Default<string, "">;
  scope: Default<string[], []>;
  expiresIn: Default<number, 0>;
  expiresAt: Default<number, 0>;
  refreshToken: Default<Secret<string>, "">;
  user: Default<{
    email: string;
    name: string;
    picture: string;
  }, { email: ""; name: ""; picture: "" }>;
};

const env = getRecipeEnvironment();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type CalendarEvent = {
  id: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  startDateTime: string;
  endDateTime: string;
  isAllDay: boolean;
  status: string;
  htmlLink: string;
  calendarId: string;
  calendarName: string;
  attendees: Default<{ email: string; displayName: string; responseStatus: string }[], []>;
  organizer: { email: string; displayName: string };
};

export type Calendar = {
  id: string;
  summary: string;
  description: string;
  primary: boolean;
  backgroundColor: string;
  foregroundColor: string;
};

type Settings = {
  // Number of days in the past to fetch
  daysBack: Default<number, 7>;
  // Number of days in the future to fetch
  daysForward: Default<number, 30>;
  // Maximum number of events to fetch per calendar
  maxResults: Default<number, 100>;
  // Enable verbose console logging for debugging
  debugMode: Default<boolean, false>;
};

// Debug logging helpers
function debugLog(debugMode: boolean, ...args: unknown[]) {
  if (debugMode) console.log(...args);
}
function debugWarn(debugMode: boolean, ...args: unknown[]) {
  if (debugMode) console.warn(...args);
}

interface CalendarClientConfig {
  retries?: number;
  delay?: number;
  delayIncrement?: number;
  debugMode?: boolean;
}

class CalendarClient {
  private auth: Cell<Auth>;
  private retries: number;
  private delay: number;
  private delayIncrement: number;
  private debugMode: boolean;

  constructor(
    auth: Cell<Auth>,
    { retries = 3, delay = 1000, delayIncrement = 100, debugMode = false }: CalendarClientConfig = {},
  ) {
    this.auth = auth;
    this.retries = retries;
    this.delay = delay;
    this.delayIncrement = delayIncrement;
    this.debugMode = debugMode;
  }

  private async refreshAuth() {
    const body = {
      refreshToken: this.auth.get().refreshToken,
    };

    debugLog(this.debugMode, "refreshAuthToken", body);

    const res = await fetch(
      new URL("/api/integrations/google-oauth/refresh", env.apiUrl),
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      throw new Error("Could not acquire a refresh token.");
    }
    const json = await res.json();
    const authData = json.tokenInfo as Auth;
    this.auth.update(authData);
  }

  async getCalendarList(): Promise<Calendar[]> {
    const url = new URL(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
    );
    const res = await this.googleRequest(url);
    const json = await res.json();

    if (!json.items || !Array.isArray(json.items)) {
      debugLog(this.debugMode, "No calendars found:", json);
      return [];
    }

    return json.items.map((item: any) => ({
      id: item.id,
      summary: item.summary || "",
      description: item.description || "",
      primary: item.primary || false,
      backgroundColor: item.backgroundColor || "#4285f4",
      foregroundColor: item.foregroundColor || "#ffffff",
    }));
  }

  async getEvents(
    calendarId: string,
    timeMin: Date,
    timeMax: Date,
    maxResults: number = 100,
  ): Promise<any[]> {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    );
    url.searchParams.set("timeMin", timeMin.toISOString());
    url.searchParams.set("timeMax", timeMax.toISOString());
    url.searchParams.set("maxResults", maxResults.toString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");

    debugLog(this.debugMode, "Fetching events from:", url.toString());

    const res = await this.googleRequest(url);
    const json = await res.json();

    if (!json.items || !Array.isArray(json.items)) {
      debugLog(this.debugMode, "No events found:", json);
      return [];
    }

    return json.items;
  }

  private async googleRequest(
    url: URL,
    _options?: RequestInit,
    _retries?: number,
  ): Promise<Response> {
    const token = this.auth.get().token;
    if (!token) {
      throw new Error("No authorization token.");
    }

    const retries = _retries ?? this.retries;
    const options = _options ?? {};
    options.headers = new Headers(options.headers);
    options.headers.set("Authorization", `Bearer ${token}`);

    const res = await fetch(url, options);
    let { ok, status, statusText } = res;

    if (ok) {
      debugLog(this.debugMode, `${url}: ${status} ${statusText}`);
      return res;
    }

    debugWarn(
      this.debugMode,
      `${url}: ${status} ${statusText}`,
      `Remaining retries: ${retries}`,
    );
    if (retries === 0) {
      throw new Error("Too many failed attempts.");
    }

    await sleep(this.delay);

    if (status === 401) {
      await this.refreshAuth();
    } else if (status === 429) {
      this.delay += this.delayIncrement;
      debugLog(this.debugMode, `Incrementing delay to ${this.delay}`);
      await sleep(this.delay);
    }
    return this.googleRequest(url, _options, retries - 1);
  }
}

function parseCalendarEvent(event: any, calendarId: string, calendarName: string): CalendarEvent {
  const isAllDay = !event.start?.dateTime;
  const startDateTime = event.start?.dateTime || event.start?.date || "";
  const endDateTime = event.end?.dateTime || event.end?.date || "";

  return {
    id: event.id || "",
    summary: event.summary || "(No title)",
    description: event.description || "",
    location: event.location || "",
    start: event.start?.date || event.start?.dateTime?.split("T")[0] || "",
    end: event.end?.date || event.end?.dateTime?.split("T")[0] || "",
    startDateTime,
    endDateTime,
    isAllDay,
    status: event.status || "confirmed",
    htmlLink: event.htmlLink || "",
    calendarId,
    calendarName,
    attendees: (event.attendees || []).map((a: any) => ({
      email: a.email || "",
      displayName: a.displayName || a.email || "",
      responseStatus: a.responseStatus || "needsAction",
    })),
    organizer: {
      email: event.organizer?.email || "",
      displayName: event.organizer?.displayName || event.organizer?.email || "",
    },
  };
}

const calendarUpdater = handler<unknown, {
  events: Cell<CalendarEvent[]>;
  calendars: Cell<Calendar[]>;
  auth: Cell<Auth>;
  settings: Cell<{
    daysBack: number;
    daysForward: number;
    maxResults: number;
    debugMode: boolean;
  }>;
  fetching?: Cell<boolean>;
}>(
  async (_event, state) => {
    // Set fetching state if available
    if (state.fetching) {
      state.fetching.set(true);
    }
    const debugMode = state.settings.get().debugMode || false;

    debugLog(debugMode, "calendarUpdater!");

    if (!state.auth.get().token) {
      debugWarn(debugMode, "no token found in auth cell");
      if (state.fetching) state.fetching.set(false);
      return;
    }

    const settings = state.settings.get();
    const client = new CalendarClient(state.auth, { debugMode });

    try {

    // Get calendar list
    debugLog(debugMode, "Fetching calendar list...");
    const calendars = await client.getCalendarList();
    debugLog(debugMode, `Found ${calendars.length} calendars`);
    state.calendars.set(calendars);

    // Calculate time range
    const now = new Date();
    const timeMin = new Date(now);
    timeMin.setDate(timeMin.getDate() - settings.daysBack);
    const timeMax = new Date(now);
    timeMax.setDate(timeMax.getDate() + settings.daysForward);

    debugLog(debugMode, `Time range: ${timeMin.toISOString()} to ${timeMax.toISOString()}`);

    // Fetch events from all calendars
    const allEvents: CalendarEvent[] = [];

    for (const calendar of calendars) {
      try {
        debugLog(debugMode, `Fetching events from calendar: ${calendar.summary} (${calendar.id})`);
        const rawEvents = await client.getEvents(
          calendar.id,
          timeMin,
          timeMax,
          settings.maxResults,
        );

        const events = rawEvents.map((e) => parseCalendarEvent(e, calendar.id, calendar.summary));
        debugLog(debugMode, `Found ${events.length} events in ${calendar.summary}`);
        allEvents.push(...events);

        // Small delay between calendar requests to avoid rate limiting
        await sleep(200);
      } catch (error) {
        debugWarn(debugMode, `Error fetching events from ${calendar.summary}:`, error);
      }
    }

    // Sort events by start time
    allEvents.sort((a, b) => {
      const aStart = new Date(a.startDateTime || a.start).getTime();
      const bStart = new Date(b.startDateTime || b.start).getTime();
      return aStart - bStart;
    });

    debugLog(debugMode, `Total events fetched: ${allEvents.length}`);
    state.events.set(allEvents);
    } finally {
      // Clear fetching state
      if (state.fetching) state.fetching.set(false);
    }
  },
);

const toggleAuthView = handler<
  unknown,
  { showAuth: Cell<boolean> }
>(
  (_, { showAuth }) => {
    showAuth.set(!showAuth.get());
  },
);

const toggleDebugMode = handler<
  { target: { checked: boolean } },
  { settings: Cell<Settings> }
>(
  ({ target }, { settings }) => {
    const current = settings.get();
    settings.set({ ...current, debugMode: target.checked });
  },
);

// Handler to create a new GoogleAuth charm and navigate to it
const createGoogleAuth = handler<unknown, Record<string, never>>(
  () => {
    const googleAuthCharm = GoogleAuth({
      selectedScopes: {
        gmail: false,
        calendar: true,  // Pre-select Calendar scope
        drive: false,
        contacts: false,
      },
      auth: {
        token: "",
        tokenType: "",
        scope: [],
        expiresIn: 0,
        expiresAt: 0,
        refreshToken: "",
        user: { email: "", name: "", picture: "" },
      },
    });
    return navigateTo(googleAuthCharm);
  },
);

// What we expect from the google-auth charm
type GoogleAuthCharm = {
  auth: Auth;
  scopes?: string[];
};

// Calendar scope URL for checking
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

// Format date for display
function formatEventDate(startDateTime: string, endDateTime: string, isAllDay: boolean): string {
  if (isAllDay) {
    return startDateTime;
  }
  const start = new Date(startDateTime);
  const end = new Date(endDateTime);
  const dateStr = start.toLocaleDateString();
  const startTime = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const endTime = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} ${startTime} - ${endTime}`;
}

interface GoogleCalendarImporterInput {
  settings?: Default<Settings, {
    daysBack: 7;
    daysForward: 30;
    maxResults: 100;
    debugMode: false;
  }>;
  // Optional: explicitly provide an auth charm. If not provided, uses wish to discover one.
  authCharm?: Default<any, null>;
}

const GoogleCalendarImporter = pattern<GoogleCalendarImporterInput>(
  ({ settings, authCharm }) => {
    const events = cell<Confidential<CalendarEvent[]>>([]);
    const calendars = cell<Calendar[]>([]);
    const showAuth = cell(false);
    const fetching = cell(false);

    // Wish for a favorited auth charm (unified Google auth)
    const wishedAuthCharm = wish<GoogleAuthCharm>("#googleAuth");

    // Determine if we have an explicit auth charm provided
    const hasExplicitAuth = derive(authCharm, (charm) => charm !== null && charm !== undefined);

    // Get the effective auth charm: explicit one if provided, otherwise wished one
    const effectiveAuthCharm = derive(
      { authCharm, wishedAuthCharm, hasExplicitAuth },
      ({ authCharm, wishedAuthCharm, hasExplicitAuth }) => {
        if (hasExplicitAuth) {
          return authCharm;
        }
        return wishedAuthCharm || null;
      }
    );

    // Extract auth data from the effective auth charm
    const auth = derive(effectiveAuthCharm, (charm) =>
      charm?.auth || {
        token: "",
        tokenType: "",
        scope: [],
        expiresIn: 0,
        expiresAt: 0,
        refreshToken: "",
        user: { email: "", name: "", picture: "" },
      });

    const isAuthenticated = derive(auth, (a) => a?.user?.email ? true : false);

    // Track if we're using wished auth vs explicit
    const usingWishedAuth = derive(
      { hasExplicitAuth, wishedAuthCharm },
      ({ hasExplicitAuth, wishedAuthCharm }) => !hasExplicitAuth && !!wishedAuthCharm
    );

    // Note: Legacy syntax doesn't provide error info, so we just check if auth is missing
    const wishError = derive(
      { hasExplicitAuth, wishedAuthCharm },
      ({ hasExplicitAuth, wishedAuthCharm }) => !hasExplicitAuth && !wishedAuthCharm ? "No #googleAuth favorite found" : null
    );

    // Check if Calendar scope is granted
    const hasCalendarScope = derive(auth, (a) => {
      const scopes = a?.scope || [];
      return scopes.includes(CALENDAR_SCOPE);
    });

    // Authenticated but missing Calendar scope
    const missingCalendarScope = derive(
      { isAuthenticated, hasCalendarScope },
      ({ isAuthenticated, hasCalendarScope }) => isAuthenticated && !hasCalendarScope
    );

    computed(() => {
      if (settings.debugMode) {
        console.log("events", events.get().length);
      }
    });

    return {
      [NAME]: str`Calendar Importer ${
        derive(auth, (auth) => auth?.user?.email || "unauthorized")
      }`,
      [UI]: (
        <ct-screen>
          {/* TEMPORARY WORKAROUND (CT-1090): Embed wishedAuthCharm to trigger cross-space charm startup.
              See: community-docs/superstitions/2025-12-02-wish-cross-space-embed-in-jsx.md
              Remove this when CT-1090 is fixed. */}
          <div style={{ display: "none" }}>{wishedAuthCharm}</div>
          <div slot="header">
            <ct-hstack align="center" gap="2">
              <ct-heading level={3}>Google Calendar Importer</ct-heading>

              {/* Red/Green status dot */}
              <button
                onClick={toggleAuthView({ showAuth })}
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  border: "2px solid #333",
                  backgroundColor: ifElse(
                    isAuthenticated,
                    "#22c55e", // green
                    "#ef4444", // red
                  ),
                  cursor: "pointer",
                  padding: "0",
                }}
                title={ifElse(
                  isAuthenticated,
                  "Authenticated - Click to view auth",
                  "Not authenticated - Click to login",
                )}
              />
            </ct-hstack>
          </div>

          <ct-vscroll flex showScrollbar>
            <ct-vstack padding="6" gap="4">
              {/* Conditionally show auth UI inline */}
              {ifElse(
                derive(showAuth, (show) => show),
                <div
                  style={{
                    border: "2px solid #e0e0e0",
                    borderRadius: "8px",
                    padding: "15px",
                    backgroundColor: "#f9fafb",
                  }}
                >
                  <h3 style={{ fontSize: "16px", marginTop: "0" }}>
                    Authentication
                  </h3>

                  {/* Show source of auth */}
                  {ifElse(
                    hasExplicitAuth,
                    <div style={{ marginBottom: "10px", fontSize: "14px", color: "#666" }}>
                      Using explicitly linked auth charm
                    </div>,
                    ifElse(
                      usingWishedAuth,
                      <div style={{ marginBottom: "10px", fontSize: "14px", color: "#22c55e" }}>
                        ✓ Using shared auth from favorited Google Auth charm
                      </div>,
                      <div style={{
                        marginBottom: "15px",
                        padding: "12px",
                        backgroundColor: "#fff3cd",
                        borderRadius: "6px",
                        border: "1px solid #ffeeba",
                      }}>
                        <strong>No Google Auth Found</strong>
                        <p style={{ margin: "8px 0 0 0", fontSize: "14px" }}>
                          Create a Google Auth charm to authenticate:
                        </p>
                        <ct-button
                          onClick={createGoogleAuth({})}
                          style={{ marginTop: "12px" }}
                        >
                          Create Google Auth
                        </ct-button>
                        <p style={{ margin: "12px 0 0 0", fontSize: "13px", color: "#666" }}>
                          After authenticating, click the star to favorite it, then come back here.
                        </p>
                        {ifElse(
                          derive(wishError, (err) => !!err),
                          <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#856404" }}>
                            Debug: {wishError}
                          </p>,
                          <div />
                        )}
                      </div>
                    )
                  )}

                  {/* Scope warning */}
                  {ifElse(
                    missingCalendarScope,
                    <div style={{
                      marginBottom: "15px",
                      padding: "12px",
                      backgroundColor: "#f8d7da",
                      borderRadius: "6px",
                      border: "1px solid #f5c6cb",
                    }}>
                      <strong>Calendar Permission Missing</strong>
                      <p style={{ margin: "8px 0 0 0", fontSize: "14px" }}>
                        Your Google Auth charm doesn't have Calendar permission enabled.
                        Please enable the Calendar checkbox in your Google Auth charm and re-authenticate.
                      </p>
                    </div>,
                    <div />
                  )}

                  {/* Render the auth charm if available */}
                  {ifElse(
                    derive(effectiveAuthCharm, (charm) => !!charm),
                    <ct-render $cell={effectiveAuthCharm} />,
                    <div />
                  )}
                </div>,
                <div />,
              )}

              <h3 style={{ fontSize: "18px", fontWeight: "bold" }}>
                Imported event count: {computed(() => events.get().length)}
              </h3>

              <div style={{ fontSize: "14px", color: "#666" }}>
                Calendars found: {computed(() => calendars.get().length)}
              </div>

              <ct-vstack gap="4">
                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>Days Back</label>
                  <ct-input
                    type="number"
                    $value={settings.daysBack}
                    placeholder="7"
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>Days Forward</label>
                  <ct-input
                    type="number"
                    $value={settings.daysForward}
                    placeholder="30"
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>Max Results per Calendar</label>
                  <ct-input
                    type="number"
                    $value={settings.maxResults}
                    placeholder="100"
                  />
                </div>

                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
                    <input
                      type="checkbox"
                      checked={settings.debugMode}
                      onChange={toggleDebugMode({ settings })}
                    />
                    Debug Mode (verbose console logging)
                  </label>
                </div>
                <ct-button
                  type="button"
                  onClick={calendarUpdater({
                    events,
                    calendars,
                    auth,
                    settings,
                    fetching,
                  })}
                  disabled={fetching}
                >
                  {ifElse(
                    fetching,
                    <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <ct-loader size="sm" show-elapsed></ct-loader>
                      Fetching...
                    </span>,
                    "Fetch Calendar Events"
                  )}
                </ct-button>
              </ct-vstack>

              {/* Calendar list */}
              {ifElse(
                computed(() => calendars.get().length > 0),
                <div style={{ marginTop: "16px" }}>
                  <h4 style={{ fontSize: "16px", marginBottom: "8px" }}>Your Calendars</h4>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {calendars.map((cal) => (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "4px 10px",
                          borderRadius: "16px",
                          backgroundColor: cal.backgroundColor,
                          color: cal.foregroundColor,
                          fontSize: "12px",
                        }}
                      >
                        {ifElse(
                          cal.primary,
                          <span>★</span>,
                          <span />
                        )}
                        {cal.summary}
                      </div>
                    ))}
                  </div>
                </div>,
                <div />
              )}

              {/* Events table */}
              <div style={{ marginTop: "16px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ padding: "10px", textAlign: "left", borderBottom: "2px solid #e0e0e0" }}>DATE/TIME</th>
                      <th style={{ padding: "10px", textAlign: "left", borderBottom: "2px solid #e0e0e0" }}>EVENT</th>
                      <th style={{ padding: "10px", textAlign: "left", borderBottom: "2px solid #e0e0e0" }}>CALENDAR</th>
                      <th style={{ padding: "10px", textAlign: "left", borderBottom: "2px solid #e0e0e0" }}>LOCATION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr>
                        <td style={{ padding: "10px", borderBottom: "1px solid #e0e0e0", whiteSpace: "nowrap" }}>
                          {derive(
                            { startDateTime: event.startDateTime, endDateTime: event.endDateTime, isAllDay: event.isAllDay },
                            ({ startDateTime, endDateTime, isAllDay }) => formatEventDate(startDateTime, endDateTime, isAllDay)
                          )}
                        </td>
                        <td style={{ padding: "10px", borderBottom: "1px solid #e0e0e0" }}>
                          <div>
                            <strong>{event.summary}</strong>
                            {ifElse(
                              event.description,
                              <details style={{ marginTop: "4px" }}>
                                <summary style={{ cursor: "pointer", fontSize: "12px", color: "#666" }}>Show details</summary>
                                <pre style={{ whiteSpace: "pre-wrap", fontSize: "12px", marginTop: "4px" }}>
                                  {event.description}
                                </pre>
                              </details>,
                              <div />
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "10px", borderBottom: "1px solid #e0e0e0", fontSize: "12px" }}>
                          {event.calendarName}
                        </td>
                        <td style={{ padding: "10px", borderBottom: "1px solid #e0e0e0", fontSize: "12px" }}>
                          {event.location}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ct-vstack>
          </ct-vscroll>
        </ct-screen>
      ),
      events,
      calendars,
      bgUpdater: calendarUpdater({ events, calendars, auth, settings }),
      // Pattern tools for omnibot
      searchEvents: patternTool(
        ({ query, events }: { query: string; events: CalendarEvent[] }) => {
          return derive({ query, events }, ({ query, events }) => {
            if (!query || !events) return [];
            const lowerQuery = query.toLowerCase();
            return events.filter((event) =>
              event.summary?.toLowerCase().includes(lowerQuery) ||
              event.description?.toLowerCase().includes(lowerQuery) ||
              event.location?.toLowerCase().includes(lowerQuery)
            );
          });
        },
        { events }
      ),
      getEventCount: patternTool(
        ({ events }: { events: CalendarEvent[] }) => {
          return derive(events, (list) => list?.length || 0);
        },
        { events }
      ),
      getUpcomingEvents: patternTool(
        ({ count, events }: { count: number; events: CalendarEvent[] }) => {
          return derive({ count, events }, ({ count, events }) => {
            if (!events || events.length === 0) return "No events";
            const now = new Date();
            const upcoming = events
              .filter((e) => new Date(e.startDateTime || e.start) >= now)
              .slice(0, count || 5);
            return upcoming.map((event) =>
              `${formatEventDate(event.startDateTime, event.endDateTime, event.isAllDay)}: ${event.summary}${event.location ? ` @ ${event.location}` : ''}`
            ).join("\n");
          });
        },
        { events }
      ),
      getTodaysEvents: patternTool(
        ({ events }: { events: CalendarEvent[] }) => {
          return derive(events, (events) => {
            if (!events || events.length === 0) return "No events";
            const today = new Date().toISOString().split("T")[0];
            const todayEvents = events.filter((e) => e.start === today || (e.startDateTime && e.startDateTime.startsWith(today)));
            if (todayEvents.length === 0) return "No events today";
            return todayEvents.map((event) =>
              `${formatEventDate(event.startDateTime, event.endDateTime, event.isAllDay)}: ${event.summary}`
            ).join("\n");
          });
        },
        { events }
      ),
    };
  },
);

export default GoogleCalendarImporter;
