/** Only paths within the app, never "//evil.example" or absolute URLs (open redirect). */
export function safeReturnUrl(url: string | null | undefined, fallback = '/'): string {
  return url && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\') ? url : fallback;
}
