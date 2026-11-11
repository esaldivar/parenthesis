import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { Api, SavedTranscript, TranscriptPreview, TranscriptRange } from '../../core/api/api';
import { Toasts } from '../../shared/toast/toasts';
import { axeViolations } from '../../../testing/axe';
import { fakeAuth } from '../../../testing/fake-auth';
import { ChatTranscripts, EMPTY_RANGE, HALF_RANGE, REVERSED_RANGE } from './chat-transcripts';

// Synthetic family only: Alex (this parent) and Jamie. The API is faked; the component's behaviour is under test.
const OCTOBER: SavedTranscript = {
  id: 't-1',
  fileName: 'Chat_2026-10-01_to_2026-10-31.pdf',
  from: '2026-10-01',
  to: '2026-10-31',
  rangeLabel: 'Oct 1–31, 2026',
  messageCount: 12,
  createdAt: '2026-11-01T15:00:00Z',
};

const preview = (range: TranscriptRange, count = 2): TranscriptPreview => ({
  fileName: range.from
    ? `Chat_${range.from}_to_${range.to}.pdf`
    : 'Chat_all_messages_2026-11-07.pdf',
  title: 'Communication Transcript',
  rangeLabel: range.from ? 'Nov 1–6, 2026' : 'All messages · Nov 1–6, 2026',
  timeZone: 'America/Chicago',
  preparedLabel: 'November 7, 2026 • 11:14:00 AM UTC-06:00',
  participants: 'Alex Rivera and Jamie Rivera',
  labels: {
    description: 'Parenthesis export of recorded messages',
    participants: 'Participants',
    inclusiveRange: 'Inclusive date range',
    displayTimeZone: 'Display time zone',
    generated: 'Generated',
  },
  from: range.from,
  to: range.to,
  messageCount: count,
  days:
    count === 0
      ? []
      : [
          {
            date: '2026-11-01',
            label: 'Sunday, November 1, 2026',
            messages: [
              {
                time: 'November 1, 2026 • 11:12:00 AM UTC-06:00',
                sender: 'Jamie Rivera',
                text: 'Can you do the soccer pickup on Saturday?',
                event: null,
              },
              {
                time: 'November 1, 2026 • 11:13:00 AM UTC-06:00',
                sender: 'Alex Rivera',
                text: 'Yes, I can.',
                event: 'Linked Calendar Event',
              },
            ],
          },
        ],
});

interface Internals {
  from: FormControl<string>;
  to: FormControl<string>;
}

describe('Chat transcripts (#125, slice 3)', () => {
  let saved: SavedTranscript[];
  let count: number;
  let toasts: string[];

  async function render(level: 1 | 2 = 2) {
    const api = {
      transcripts: vi.fn(async () => saved),
      transcriptPreview: vi.fn(async (_family: string, range: TranscriptRange) =>
        preview(range, count),
      ),
      saveTranscript: vi.fn(
        async (_family: string, range: TranscriptRange): Promise<SavedTranscript> => ({
          id: 't-2',
          fileName: preview(range).fileName,
          from: range.from,
          to: range.to,
          rangeLabel: 'Nov 1–6, 2026',
          messageCount: count,
          createdAt: '2026-11-07T15:00:00Z',
        }),
      ),
      savedTranscriptUrl: (family: string, id: string) =>
        `/api/families/${family}/chat/transcripts/${id}/pdf`,
      transcriptPdfUrl: (family: string, range: TranscriptRange, download: boolean) =>
        `/api/families/${family}/chat/transcripts/pdf?${range.from ? `from=${range.from}&to=${range.to}&` : ''}download=${download}`,
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), fakeAuth(), { provide: Api, useValue: api }],
    });
    toasts = [];
    TestBed.inject(Toasts).show = (message: string) => {
      toasts.push(message);
    };
    const fixture = TestBed.createComponent(ChatTranscripts);
    fixture.componentRef.setInput('level', level);
    document.body.appendChild(fixture.nativeElement);
    await settle(fixture);
    return {
      fixture,
      api,
      el: fixture.nativeElement as HTMLElement,
      internals: fixture.componentInstance as unknown as Internals,
    };
  }

  async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const button = (el: HTMLElement, name: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === name)!;
  const dialog = (el: HTMLElement) => el.querySelector<HTMLElement>('[role="dialog"]');
  const radio = (el: HTMLElement, value: string) =>
    el.querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`)!;

  beforeEach(() => {
    saved = [OCTOBER];
    count = 2;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('lists this parent’s saved transcripts by file name and dates, each reopening its saved PDF', async () => {
    const { el } = await render();

    expect(text(el.querySelector('h2'))).toBe('Transcripts');
    expect(text(el.querySelector('h3'))).toBe('Saved transcripts');
    const link = el.querySelector<HTMLAnchorElement>('.saved-item')!;
    expect(text(link)).toContain('Chat_2026-10-01_to_2026-10-31.pdf');
    expect(text(link)).toContain('Oct 1–31, 2026');
    expect(link.getAttribute('href')).toBe('/api/families/family-1/chat/transcripts/t-1/pdf');
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener');
    expect(await axeViolations(el)).toEqual([]);
  });

  it('says when nothing is saved yet, and is the page heading on the phone screen', async () => {
    saved = [];
    const { el } = await render(1);

    expect(text(el.querySelector('h1'))).toBe('Transcripts');
    expect(text(el.querySelector('h2'))).toBe('Saved transcripts');
    expect(text(el)).toContain('No saved transcripts yet.');
  });

  it('previews a date range with names and times, then saves it, separately from Download', async () => {
    const { fixture, el, api, internals } = await render();
    const opener = button(el, 'Save transcript');
    opener.click();
    await settle(fixture);

    expect(dialog(el)?.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement?.textContent?.trim()).toBe('Save transcript');
    radio(el, 'range').click();
    await settle(fixture);
    internals.from.setValue('2026-11-01');
    internals.to.setValue('2026-11-06');
    button(el, 'Preview PDF').click();
    await settle(fixture);

    expect(api.transcriptPreview).toHaveBeenCalledWith('family-1', {
      from: '2026-11-01',
      to: '2026-11-06',
    });
    const paper = el.querySelector('.paper')!;
    expect(text(paper.querySelector('h3'))).toBe('Communication Transcript');
    expect(text(paper)).toContain('Nov 1–6, 2026');
    const first = paper.querySelector('.paper-messages li')!;
    expect(text(first.querySelector('.time'))).toBe('November 1, 2026 • 11:12:00 AM UTC-06:00');
    expect(text(first.querySelector('strong'))).toBe('Jamie Rivera');
    expect(text(first.querySelector('.text'))).toBe('Can you do the soccer pickup on Saturday?');
    expect(text(paper)).toContain('Alex Rivera and Jamie Rivera');
    expect(text(paper.querySelector('h4'))).toBe('Sunday, November 1, 2026');
    expect(text(paper)).toContain('Linked Calendar Event');
    expect(text(el.querySelector('.file-name'))).toBe('Chat_2026-11-01_to_2026-11-06.pdf');
    const download = [...el.querySelectorAll<HTMLAnchorElement>('a')].find(
      (a) => text(a) === 'Download PDF',
    )!;
    expect(download.getAttribute('href')).toBe(
      '/api/families/family-1/chat/transcripts/pdf?from=2026-11-01&to=2026-11-06&download=true',
    );
    expect(download.getAttribute('download')).toBe('Chat_2026-11-01_to_2026-11-06.pdf');
    expect(api.saveTranscript).not.toHaveBeenCalled();
    expect(await axeViolations(el)).toEqual([]);

    button(dialog(el)!, 'Save transcript').click();
    await settle(fixture);

    expect(api.saveTranscript).toHaveBeenCalledWith('family-1', {
      from: '2026-11-01',
      to: '2026-11-06',
    });
    expect(dialog(el)).toBeNull();
    expect(toasts).toEqual(['Saved Chat_2026-11-01_to_2026-11-06.pdf.']);
    expect(el.querySelectorAll('.saved-item')).toHaveLength(2);
    expect(text(el.querySelector('.saved-item'))).toContain('Chat_2026-11-01_to_2026-11-06.pdf');
    expect(document.activeElement).toBe(opener);
  });

  it('previews all messages without dates', async () => {
    const { fixture, el, api } = await render();
    button(el, 'Save transcript').click();
    await settle(fixture);

    expect(radio(el, 'all').checked).toBe(true);
    button(el, 'Preview PDF').click();
    await settle(fixture);

    expect(api.transcriptPreview).toHaveBeenCalledWith('family-1', { from: null, to: null });
    expect(text(el.querySelector('.paper'))).toContain('All messages · Nov 1–6, 2026');
  });

  it('rejects a reversed or half-chosen range inline, without asking the server', async () => {
    const { fixture, el, api, internals } = await render();
    button(el, 'Save transcript').click();
    await settle(fixture);
    radio(el, 'range').click();
    await settle(fixture);

    internals.from.setValue('2026-11-06');
    internals.to.setValue('2026-11-01');
    button(el, 'Preview PDF').click();
    await settle(fixture);
    expect(text(el.querySelector('.field-error'))).toBe(REVERSED_RANGE);

    internals.to.setValue('');
    button(el, 'Preview PDF').click();
    await settle(fixture);
    expect(text(el.querySelector('.field-error'))).toBe(HALF_RANGE);
    expect(api.transcriptPreview).not.toHaveBeenCalled();
  });

  it('keeps the dates of an empty range and offers no export', async () => {
    count = 0;
    const { fixture, el, internals } = await render();
    button(el, 'Save transcript').click();
    await settle(fixture);
    radio(el, 'range').click();
    await settle(fixture);
    internals.from.setValue('2026-11-04');
    internals.to.setValue('2026-11-04');
    button(el, 'Preview PDF').click();
    await settle(fixture);

    expect(text(el.querySelector('[role="status"]'))).toBe(EMPTY_RANGE);
    expect(internals.from.value).toBe('2026-11-04');
    expect(internals.to.value).toBe('2026-11-04');
    expect(el.querySelector('.paper')).toBeNull();
    expect([...el.querySelectorAll('a')].some((a) => text(a) === 'Download PDF')).toBe(false);
  });

  it('shows the server’s field errors beside the dates', async () => {
    const { fixture, el, api, internals } = await render();
    api.transcriptPreview.mockRejectedValueOnce(
      new HttpErrorResponse({
        status: 400,
        error: {
          errors: { from: ['That range has more than 5,000 messages. Choose a shorter range.'] },
        },
      }),
    );
    button(el, 'Save transcript').click();
    await settle(fixture);
    radio(el, 'range').click();
    await settle(fixture);
    internals.from.setValue('2020-01-01');
    internals.to.setValue('2026-11-06');
    button(el, 'Preview PDF').click();
    await settle(fixture);

    expect(text(el.querySelector('.field-error'))).toBe(
      'That range has more than 5,000 messages. Choose a shorter range.',
    );
  });

  it('closes with Escape or Cancel and returns focus to Save transcript', async () => {
    const { fixture, el } = await render();
    const opener = button(el, 'Save transcript');
    opener.click();
    await settle(fixture);

    dialog(el)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle(fixture);
    expect(dialog(el)).toBeNull();
    expect(document.activeElement).toBe(opener);

    opener.click();
    await settle(fixture);
    button(el, 'Cancel').click();
    await settle(fixture);
    expect(dialog(el)).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('says so when the saved list can’t load, and tries again', async () => {
    const { fixture, el, api } = await render();
    api.transcripts.mockRejectedValueOnce(new HttpErrorResponse({ status: 503 }));
    await (fixture.componentInstance as unknown as { loadSaved(): Promise<void> }).loadSaved();
    await settle(fixture);

    expect(text(el.querySelector('[role="alert"]'))).toBe(
      'Something went wrong on our side. Please try again.',
    );
    button(el, 'Try again').click();
    await settle(fixture);
    expect(text(el.querySelector('.saved-item'))).toContain('Oct 1–31, 2026');
  });
});
