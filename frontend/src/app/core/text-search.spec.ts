import { ARASAAC_SET_ID, DEFAULT_PICTOGRAM_SELECTION, buildPictogramCatalog, isArasaacPictogram } from './pictogram-catalog';
import { createTextSearch, editDistance, rankTextSearch, searchScenarios } from './text-search';

describe('Поиск сценариев и пиктограмм', () => {
  const catalog = buildPictogramCatalog([
    [2467, 'врач', 'Люди', ['терапевт']],
    [39018, 'сканировать QR код', 'Действия', ['39018']],
  ]);
  const pictograms = (query: string, setId = DEFAULT_PICTOGRAM_SELECTION.set_id) => {
    const set = catalog.sets.find(({ id }) => id === setId)!;
    const enabled = catalog.pictograms.filter(({ id }) => set.pictogram_ids.includes(id));
    return rankTextSearch(enabled, query, (symbol) => symbol).map(({ id }) => id);
  };
  const scenarios = [
    { title: 'Покупка продуктов', description: '' },
    { title: 'Поход к врачу', description: 'Подготовка к приёму.' },
    { title: 'Я потерялся', description: '' },
    { title: 'Поездка к другу', description: 'Как найти нужный адрес.' },
  ];

  it('считает перестановку соседних букв одной правкой', () => {
    expect(editDistance('варч', 'врач')).toBe(1);
  });

  it('находит пиктограмму по названию, синониму, ё/е или опечатке', () => {
    expect(pictograms('  ВРАЧ ')).toEqual(['doctor']);
    expect(pictograms('доктор')).toEqual(['doctor']);
    expect(pictograms('жилье')).toEqual(['home']);
    expect(pictograms('варч')).toEqual(['doctor']);
    expect(pictograms('докор')).toEqual(['doctor']);
  });

  it('сохраняет прямые результаты выше приблизительных', () => {
    const items = [{ title: 'Прачечная', aliases: ['врач'] }, { title: 'Врач' }, { title: 'Грач' }];
    expect(rankTextSearch(items, 'врач', (item) => item)).toEqual([items[1], items[0]]);
  });

  it('переиспользует индекс при повторном вводе запроса', () => {
    const items = [{ title: 'Врач' }, { title: 'Библиотека' }];
    const readEntry = vi.fn((item: { title: string }) => item);
    const search = createTextSearch(items, readEntry);
    expect(search('')).toEqual(items);
    expect(readEntry).not.toHaveBeenCalled();
    expect(search('варч')).toEqual([items[0]]);
    expect(search('библотка')).toEqual([items[1]]);
    expect(readEntry).toHaveBeenCalledTimes(items.length);
  });

  it('ищет пиктограммы ARASAAC в отдельном наборе', () => {
    expect(pictograms('варч', ARASAAC_SET_ID)[0]).toBe('arasaac-2467');
    expect(pictograms('очередь', ARASAAC_SET_ID)).toEqual(['arasaac-27547']);
    expect(pictograms('сканировть QR код', ARASAAC_SET_ID)).toEqual(['arasaac-39018']);
    expect(pictograms('терапевт', ARASAAC_SET_ID)).toContain('arasaac-2467');
    const doctor = catalog.pictograms.filter(({ id }) => id === 'arasaac-2467');
    expect(doctor.map(({ url }) => url)).toEqual(['/kolibri/pictograms/arasaac/2467.png']);
    const scan = catalog.pictograms.find(({ id }) => id === 'arasaac-39018');
    expect(isArasaacPictogram(scan?.url)).toBe(true);
  });

  it('находит результаты при другой раскладке и нескольких пропущенных буквах', () => {
    expect(pictograms('dhfx', ARASAAC_SET_ID)[0]).toBe('arasaac-2467');
    expect(pictograms(',b,kbjntrf', ARASAAC_SET_ID)[0]).toBe('arasaac-6063');
    expect(pictograms('библотка', ARASAAC_SET_ID)[0]).toBe('arasaac-6063');
    expect(rankTextSearch([{ title: 'Help' }], 'рудз', (item) => item)).toEqual([{ title: 'Help' }]);
  });

  it('ищет сценарии по синонимам, описанию и нескольким словам', () => {
    expect(searchScenarios(scenarios, 'супермаркет')).toEqual([scenarios[0]]);
    expect(searchScenarios(scenarios, 'поход докор')).toEqual([scenarios[1]]);
    expect(searchScenarios(scenarios, 'поликлиника')).toEqual([scenarios[1]]);
    expect(searchScenarios(scenarios, 'приему')).toEqual([scenarios[1]]);
    expect(searchScenarios(scenarios, 'заблудился')).toEqual([scenarios[2]]);
    expect(searchScenarios(scenarios, 'найти адрес')).toEqual([scenarios[3]]);
  });

  it('использует синонимичные фразы для бытовых, медицинских и транспортных сценариев', () => {
    const examples = [
      ['Как оплатить коммуналку', 'оплата жкх'],
      ['Как передать показания счётчика', 'отправить показания счетчика'],
      ['Возврат товара', 'вернуть покупку'],
      ['Записаться к стоматологу', 'дантист'],
      ['Поездка на пригородном поезде', 'электричка'],
      ['На автовокзале', 'автобусный вокзал'],
      ['Обратиться за помощью', 'попросить о помощи'],
      ['Что делать, если потерялась', 'заблудилась'],
    ];
    const entries = examples.map(([title]) => ({ title, description: '' }));
    for (const [index, [, query]] of examples.entries()) {
      expect(searchScenarios(entries, query), query).toEqual([entries[index]]);
    }
  });

  it('не расширяет неоднозначные слова отдельно от фразы и не подменяет близкие действия', () => {
    const titles = [
      'Поход к врачу', 'Приём гостей', 'Получить степень доктора наук', 'Работа в супермаркете', 'Работа в продуктовом магазине',
      'Покупка продуктов', 'Заполнить заявление', 'Школьная форма', 'Как оплатить коммуналку',
      'Оплата штрафа', 'Передать показания счётчика', 'Снять показания счётчика', 'Потерялся ключ',
    ];
    const entries = titles.map((title) => ({ title, description: '' }));
    const matches = (query: string) => searchScenarios(entries, query).map(({ title }) => title);
    expect(matches('прием гостей')).toEqual(['Приём гостей']);
    expect(matches('приём')).toEqual(['Приём гостей']);
    expect(matches('врач')).toEqual(['Поход к врачу']);
    expect(matches('купить продукты')).toEqual(['Покупка продуктов']);
    expect(matches('форма')).toEqual(['Школьная форма']);
    expect(matches('заполнить форму заявления')).toEqual(['Заполнить заявление']);
    expect(matches('оплата штрафа')).toEqual(['Оплата штрафа']);
    expect(matches('отправить показания счетчика')).toEqual(['Передать показания счётчика']);
    expect(matches('заблудился')).toEqual([]);
    expect(matches('штраф')).toEqual(['Оплата штрафа']);
  });

  it('сохраняет осмысленные слова запроса при отсутствии соответствующего сценария', () => {
    const entries = ['Измерить давление', 'Налить стакан воды'].map((title) => ({ title, description: '' }));
    expect(searchScenarios(entries, 'заявление')).toEqual([]);
    expect(searchScenarios(entries, 'платить')).toEqual([]);
    expect(searchScenarios(entries, 'дваление')).toEqual([entries[0]]);
  });

  it('сохраняет порядок пустого запроса и не ищет опечатки в коротких словах', () => {
    expect(searchScenarios(scenarios, ' … ')).toEqual(scenarios);
    expect(pictograms('вч')).toEqual([]);
  });
});
