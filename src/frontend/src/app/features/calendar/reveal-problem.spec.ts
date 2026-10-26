import { revealFirstProblem } from './reveal-problem';

describe('refused-save focus', () => {
  let root: HTMLElement;
  beforeEach(() => {
    root = document.createElement('div');
    document.body.append(root);
  });
  afterEach(() => root.remove());

  it('focuses the red readonly date even while Material’s ARIA value awaits restoration', () => {
    root.innerHTML = '<input name="startDate" readonly aria-invalid="false"><input name="endDate" readonly class="date-invalid" aria-invalid="false" aria-describedby="reason"><span id="reason" class="visually-hidden">Choose an end after the start.</span><button>Save</button>';
    const end = root.querySelector<HTMLInputElement>('[name="endDate"]')!;
    const scroll = vi.fn();
    end.scrollIntoView = scroll;
    root.querySelector('button')!.focus();
    revealFirstProblem(root);
    expect(document.activeElement).toBe(end);
    expect(scroll).toHaveBeenCalledOnce();
  });

  it('still focuses a general server refusal when there is no field problem', () => {
    root.innerHTML = '<p class="alert">Could not save. Try again.</p><button>Save</button>';
    root.querySelector('button')!.focus();
    revealFirstProblem(root);
    expect(document.activeElement).toBe(root.querySelector('.alert'));
  });
});
