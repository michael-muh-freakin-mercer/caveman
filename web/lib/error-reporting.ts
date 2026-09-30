/**
 * What the web server may send to Sentry (instrumentation.ts). Reports carry
 * the error, its stack and the route that failed; never request bodies,
 * cookies, query strings or auth headers, which hold prompts, sessions and tokens.
 * Query strings go from every URL, including the Referer (/app/new?prompt=...,
 * /reset-password?token=...) and breadcrumbs of outgoing requests.
 */
export function reportingEnabled(): boolean {
  return Boolean(process.env.SENTRY_DSN?.trim());
}

type ReportedRequest = {
  url?: string;
  data?: unknown;
  cookies?: unknown;
  query_string?: unknown;
  headers?: Record<string, string>;
};

const KEPT_HEADERS = new Set(["user-agent", "content-type", "accept", "host", "referer"]);

const withoutQuery = (path: string) => path.split(/[?#]/)[0];

type Breadcrumb = { message?: string; data?: Record<string, unknown> };

export function scrubEvent<E extends {
  request?: ReportedRequest;
  user?: unknown;
  breadcrumbs?: Breadcrumb[];
  contexts?: Record<string, Record<string, unknown> | undefined>;
}>(event: E): E {
  const request = event.request;
  if (request) {
    if (typeof request.url === "string") request.url = withoutQuery(request.url);
    delete request.data;
    delete request.cookies;
    delete request.query_string;
    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers)
          .filter(([name]) => KEPT_HEADERS.has(name.toLowerCase()))
          .map(([name, value]) => [name, name.toLowerCase() === "referer" ? withoutQuery(value) : value]),
      );
    }
  }
  // The Next.js integration copies the full path, query string included.
  const nextjs = event.contexts?.["nextjs"];
  if (nextjs && typeof nextjs.request_path === "string") nextjs.request_path = withoutQuery(nextjs.request_path);
  for (const crumb of event.breadcrumbs ?? []) {
    if (typeof crumb.message === "string" && crumb.message.includes("?")) crumb.message = withoutQuery(crumb.message);
    if (crumb.data) {
      if (typeof crumb.data.url === "string") crumb.data.url = withoutQuery(crumb.data.url);
      delete crumb.data["http.query"];
      delete crumb.data["http.fragment"];
    }
  }
  delete event.user;
  return event;
}
