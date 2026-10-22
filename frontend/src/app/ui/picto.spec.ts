import { pictoFor } from './picto';

describe('pictoFor', () => {
  it('maps node kinds to action pictograms', () => {
    expect(pictoFor({ kind: 'consult', title: 'x' })).toBe('calendar');
    expect(pictoFor({ kind: 'volunteer', title: 'x' })).toBe('people');
    expect(pictoFor({ kind: 'donate', title: 'x' })).toBe('gift');
    expect(pictoFor({ kind: 'link', title: 'x' })).toBe('link');
  });

  it('maps topic titles from the NGO answers by keyword', () => {
    expect(pictoFor({ kind: 'menu', title: 'Обучение и образование' })).toBe('book');
    expect(pictoFor({ kind: 'menu', title: 'Поведение и общение' })).toBe('chat');
    expect(pictoFor({ kind: 'menu', title: 'Медицинская помощь и поиск специалистов' })).toBe(
      'medical',
    );
    expect(pictoFor({ kind: 'menu', title: 'Социальные льготы и поддержка' })).toBe('hands');
    expect(
      pictoFor({ kind: 'menu', title: 'Усталость, тревога и эмоциональное состояние близких' }),
    ).toBe('heart');
    expect(pictoFor({ kind: 'menu', title: 'Бытовая и личная безопасность' })).toBe('shield');
    expect(pictoFor({ kind: 'menu', title: 'Повседневные навыки и самостоятельная жизнь' })).toBe(
      'home',
    );
  });

  it('falls back to doc for answers and chat for menus', () => {
    expect(pictoFor({ kind: 'answer', title: 'Что-то' })).toBe('doc');
    expect(pictoFor({ kind: 'menu', title: 'Что-то' })).toBe('chat');
  });
});
