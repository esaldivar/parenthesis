import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Api, Child, MedicationItem, MedicationValues, MedicationView } from '../../core/api/api';
import { MedicationSection, isDeletion } from './medication-section';

const child = (id: string, firstName: string): Child => ({
  id,
  firstName,
  status: 'Active',
  changeRequestId: null,
  signIn: { enabled: false } as Child['signIn'],
});

const item = (id: string, name: string, extra: Partial<MedicationItem> = {}): MedicationItem => ({
  id, name, dose: '5 mL', schedule: 'Before bed', instructions: null, discontinued: false,
  updatedBy: 'Sample Parent', updatedAt: '2026-11-12T15:00:00Z', ...extra,
});

const view = (entries: readonly MedicationItem[], revision = 1, acknowledged = true): MedicationView =>
  ({ revision, acknowledged, entries });

function setup(api: Partial<Record<keyof Api, unknown>>) {
  TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
  const fixture = TestBed.createComponent(MedicationSection);
  fixture.componentRef.setInput('familyId', 'family');
  fixture.componentRef.setInput('childId', 'first');
  fixture.componentRef.setInput('children', [child('first', 'Sam'), child('second', 'Jo')]);
  const el = fixture.nativeElement as HTMLElement;
  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const field = (name: string) => el.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[formcontrolname="${name}"]`)!;
  const enter = (name: string, value: string) => {
    field(name).value = value;
    field(name).dispatchEvent(new Event('input'));
  };
  const button = (text: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === text)!;
  return { fixture, el, render, field, enter, button };
}

describe('Medication reference (#127)', () => {
  it('asks a parent to confirm once before their first medication and sends what they entered', async () => {
    const saveMedication = vi.fn(async (_f: string, _c: string, _r: number, entries: readonly MedicationValues[]) =>
      view(entries.map(entry => item(entry.id, entry.name, entry)), 1, true));
    const { el, render, enter, field, button } = setup({
      medication: vi.fn(async () => view([], 0, false)),
      saveMedication,
    });
    await render();
    expect(el.textContent).toContain('No current medications.');
    expect(el.textContent).toContain('doesn’t give medical advice');

    button('Add medication').click();
    await render();
    const submit = el.querySelector<HTMLButtonElement>('button[type=submit]')!;
    enter('name', '  Sample allergy tablet ');
    enter('dose', '1 tablet');
    await render();
    expect(submit.disabled).toBe(true);
    expect(el.textContent).toContain('your co-parent can see it');
    const confirm = el.querySelector<HTMLInputElement>('[formcontrolname="acknowledge"]')!;
    confirm.click();
    await render();
    expect(submit.disabled).toBe(false);
    submit.click();
    await render();

    expect(saveMedication).toHaveBeenCalledWith('family', 'first', 0, [expect.objectContaining({
      name: 'Sample allergy tablet', dose: '1 tablet', schedule: null, instructions: null, discontinued: false,
    })], true);
    expect(el.textContent).toContain('Medication saved.');
    expect(el.querySelector('h4')?.textContent).toBe('Sample allergy tablet');
    expect(field('name')).toBeNull();
  });

  it('shows current entries first and discontinued below, and discontinues without asking again', async () => {
    const saveMedication = vi.fn(async (_f: string, _c: string, _r: number, entries: readonly MedicationValues[]) =>
      view(entries.map(entry => item(entry.id, entry.name, entry)), 3));
    const { el, render } = setup({
      medication: vi.fn(async () => view([item('a', 'Old syrup', { discontinued: true }), item('b', 'Sample tablet')], 2)),
      saveMedication,
    });
    await render();
    const headings = [...el.querySelectorAll('h3, h4')].map(h => h.textContent?.trim());
    expect(headings).toEqual(['Current medications', 'Sample tablet', 'Discontinued medications', 'Old syrup']);
    expect(el.textContent).toContain('Updated by Sample Parent');

    el.querySelector<HTMLButtonElement>('button[aria-label="Discontinue Sample tablet"]')!.click();
    await render();
    expect(el.querySelector('[formcontrolname="acknowledge"]')).toBeNull();
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await render();
    expect(saveMedication).toHaveBeenCalledWith('family', 'first', 2, [
      expect.objectContaining({ id: 'a', discontinued: true }),
      expect.objectContaining({ id: 'b', discontinued: true }),
    ], false);
  });

  it('deletes permanently only after its own explanation', async () => {
    const deleteMedication = vi.fn(async () => view([], 4));
    const saveMedication = vi.fn();
    const { el, render } = setup({
      medication: vi.fn(async () => view([item('a', 'Sample tablet')], 3)),
      deleteMedication,
      saveMedication,
    });
    await render();
    el.querySelector<HTMLButtonElement>('button[aria-label="Delete Sample tablet permanently"]')!.click();
    await render();
    expect(el.textContent).toContain('can’t be undone');
    expect(el.textContent).toContain('discontinue it instead');
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await render();
    expect(deleteMedication).toHaveBeenCalledWith('family', 'first', 'a');
    expect(saveMedication).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Medication deleted permanently.');
  });

  it('keeps the draft and shows the latest when the co-parent saved first', async () => {
    const latest = view([item('b', 'Co-parent entry')], 2);
    const saveMedication = vi.fn()
      .mockRejectedValueOnce(new HttpErrorResponse({ status: 409, error: latest }))
      .mockImplementationOnce(async (_f: string, _c: string, _r: number, entries: readonly MedicationValues[]) =>
        view(entries.map(entry => item(entry.id, entry.name, entry)), 3));
    const { el, render, enter, field, button } = setup({
      medication: vi.fn(async () => view([], 1)),
      saveMedication,
    });
    await render();
    button('Add medication').click();
    await render();
    enter('name', 'My entry');
    await render();
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await render();
    expect(el.textContent).toContain('saved changes first');
    expect(field('name').value).toBe('My entry');

    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await render();
    expect(saveMedication).toHaveBeenLastCalledWith('family', 'first', 2, [
      expect.objectContaining({ id: 'b' }), expect.objectContaining({ name: 'My entry' }),
    ], false);
  });

  it('downloads the dated PDF with the current-only choice', async () => {
    const downloadMedicationPdf = vi.fn(async () => ({ pdf: new Blob(['%PDF']), fileName: 'medications-2026-11-12.pdf' }));
    const { el, render, button } = setup({ medication: vi.fn(async () => view([])), downloadMedicationPdf });
    URL.createObjectURL = vi.fn(() => 'blob:pdf');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await render();
    button('Download medication PDF').click();
    await render();
    el.querySelector<HTMLInputElement>('#medication-pdf-options input[type=checkbox]')!.click();
    button('Download PDF').click();
    await render();
    expect(downloadMedicationPdf).toHaveBeenCalledWith('family', 'first', true);
    expect(click).toHaveBeenCalled();
    expect(el.textContent).toContain('Medication PDF downloaded.');
    click.mockRestore();
  });

  it('recognizes a deletion in history', () => {
    const values = [{ id: 'b', name: 'Kept', dose: null, schedule: null, instructions: null, discontinued: false }];
    expect(isDeletion({ revision: 4, editedBy: 'A parent', editedAt: '', previous: values, current: values })).toBe(true);
    expect(isDeletion({ revision: 3, editedBy: 'A parent', editedAt: '', previous: [], current: values })).toBe(false);
  });
});
