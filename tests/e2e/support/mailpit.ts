import { expect, request } from '@playwright/test';

// The release candidate sends real email to Mailpit, a local catch-all server. Tests read links out of it.
const mailpitUrl = process.env['MAILPIT_URL'] ?? 'http://localhost:8025';

interface MessageSummary {
  ID: string;
  Subject: string;
}

/** Waits for the newest email to `to` whose subject contains `subject`, then returns the first app link in it. */
export async function linkFromEmail(to: string, subject: string, path: string): Promise<URL> {
  const mailpit = await request.newContext({ baseURL: mailpitUrl });
  try {
    let id: string | undefined;
    await expect
      .poll(
        async () => {
          const search = await mailpit.get('/api/v1/search', { params: { query: `to:"${to}"` } });
          const { messages } = (await search.json()) as { messages: MessageSummary[] };
          id = messages.find((m) => m.Subject.toLowerCase().includes(subject.toLowerCase()))?.ID;
          return id;
        },
        { message: `an email to ${to} about "${subject}"`, timeout: 15_000 },
      )
      .toBeTruthy();

    const message = (await (await mailpit.get(`/api/v1/message/${id}`)).json()) as { Text: string };
    const link = message.Text.match(/https?:\/\/\S+/g)?.find((candidate) => new URL(candidate).pathname === path);
    expect(link, `a ${path} link in the email to ${to}`).toBeDefined();
    return new URL(link!);
  } finally {
    await mailpit.dispose();
  }
}
