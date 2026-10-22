import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AUDIENCES, Audience, NodeKind } from '../../core/api';
import { AdminApi, AdminNode, KIND_LABELS, NodeInput, errorText } from '../../core/admin-api';

interface TreeRow {
  node: AdminNode;
  depth: number;
}

/** Конструктор сценариев: дерево слева, форма узла справа. */
@Component({
  imports: [ReactiveFormsModule],
  template: `
    <div class="admin-tabs" role="tablist" aria-label="Аудитория">
      @for (a of audiences; track a.key) {
        <a
          href="#"
          role="tab"
          [class.active]="audience() === a.key"
          (click)="$event.preventDefault(); pick(a.key)"
          >{{ a.label }}</a
        >
      }
    </div>
    @if (message()) {
      <p [class]="'notice ' + (messageOk() ? 'notice--ok' : 'notice--err')">{{ message() }}</p>
    }

    <div class="split">
      <section class="card stack">
        <div class="admin-head">
          <h2>Дерево</h2>
          <button type="button" class="btn btn--primary btn--sm" (click)="startNew(null)">
            + Корневая кнопка
          </button>
        </div>
        @if (rows().length === 0) {
          <p class="muted">
            {{ list.isLoading() ? 'Загружаем…' : 'Пока пусто. Добавьте первую кнопку.' }}
          </p>
        }
        <ul class="tree">
          @for (r of rows(); track r.node.id) {
            <li [style.margin-left.rem]="r.depth * 1.1">
              <button
                type="button"
                class="tree-item"
                [class.active]="selected()?.id === r.node.id"
                [class.draft]="!r.node.is_published"
                (click)="select(r.node)"
              >
                <span class="pill">{{ kindShort[r.node.kind] }}</span>
                <span style="flex:1">{{ r.node.title }}</span>
                @if (!r.node.is_published) {
                  <span class="muted" style="font-size:.8rem">черновик</span>
                }
              </button>
            </li>
          }
        </ul>
      </section>

      <section class="card stack">
        @if (mode() === 'idle') {
          <h2>Узел</h2>
          <p class="muted">Выберите кнопку в дереве слева или создайте новую.</p>
        } @else {
          <div class="admin-head">
            <h2>{{ mode() === 'new' ? 'Новая кнопка' : 'Кнопка #' + selected()?.id }}</h2>
            @if (mode() === 'edit' && selected()?.kind === 'menu') {
              <button
                type="button"
                class="btn btn--secondary btn--sm"
                (click)="startNew(selected()!.id)"
              >
                + Вложенная кнопка
              </button>
            }
          </div>
          @if (parentTitle()) {
            <p class="muted">Внутри: {{ parentTitle() }}</p>
          }
          <form class="form-grid" [formGroup]="form" (ngSubmit)="save()" novalidate>
            <label class="field span2">
              <span>Подпись кнопки</span>
              <input class="input" formControlName="title" maxlength="120" />
              <span class="field__hint"
                >Коротко и буквально: «Как записаться в школу», «Попросить помощь».</span
              >
            </label>
            <label class="field">
              <span>Тип</span>
              <select class="input" formControlName="kind">
                @for (k of kinds; track k) {
                  <option [value]="k">{{ kindLabels[k] }}</option>
                }
              </select>
            </label>
            <label class="field">
              <span>Порядок</span>
              <input class="input" type="number" formControlName="position" />
            </label>
            <label class="field span2">
              <span>Текст</span>
              <textarea class="input" formControlName="body" rows="5"></textarea>
              <span class="field__hint"
                >Показывается на экране кнопки. Для меню — подсказка над списком, для ответа — сам
                ответ.</span
              >
            </label>
            <label class="field"
              ><span>Ссылка на картинку</span
              ><input
                class="input"
                formControlName="image_url"
                placeholder="https://…/pictogram.png"
            /></label>
            <label class="field"
              ><span>Ссылка на аудио</span
              ><input class="input" formControlName="audio_url" placeholder="https://…/audio.mp3"
            /></label>
            @if (form.controls.kind.value === 'link' || form.controls.kind.value === 'donate') {
              <label class="field span2"
                ><span>Внешняя ссылка</span
                ><input class="input" formControlName="link_url" placeholder="https://…"
              /></label>
            }
            <label class="choice span2"
              ><input type="checkbox" formControlName="is_published" /> Опубликовано (видно на
              сайте)</label
            >
            <div class="span2" style="display:flex;flex-wrap:wrap;gap:.5rem">
              <button type="submit" class="btn btn--primary" [disabled]="form.invalid || busy()">
                {{ mode() === 'new' ? 'Создать' : 'Сохранить' }}
              </button>
              <button type="button" class="btn btn--secondary" (click)="cancel()">Отмена</button>
              @if (mode() === 'edit') {
                <button
                  type="button"
                  class="btn btn--danger"
                  (click)="remove()"
                  [disabled]="busy()"
                >
                  Удалить с вложенными
                </button>
              }
            </div>
          </form>
        }
      </section>
    </div>
  `,
})
export class AdminScenarios {
  private readonly api = inject(AdminApi);
  protected readonly audiences = AUDIENCES;
  protected readonly kinds: NodeKind[] = [
    'menu',
    'answer',
    'consult',
    'donate',
    'volunteer',
    'link',
  ];
  protected readonly kindLabels = KIND_LABELS;
  protected readonly kindShort: Record<NodeKind, string> = {
    menu: 'меню',
    answer: 'ответ',
    consult: 'запись',
    donate: 'донат',
    volunteer: 'волонтёр',
    link: 'ссылка',
  };

  protected readonly audience = signal<Audience>('parents');
  protected readonly list = this.api.nodes(this.audience);
  protected readonly selected = signal<AdminNode | null>(null);
  protected readonly newParent = signal<number | null>(null);
  protected readonly mode = signal<'idle' | 'edit' | 'new'>('idle');
  protected readonly busy = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly messageOk = signal(true);

  /** Дерево в порядке обхода, с глубиной для отступа. */
  protected readonly rows = computed<TreeRow[]>(() => {
    const nodes = this.list.value();
    const byParent = new Map<number | null, AdminNode[]>();
    for (const n of nodes) {
      const arr = byParent.get(n.parent_id) ?? [];
      arr.push(n);
      byParent.set(n.parent_id, arr);
    }
    const out: TreeRow[] = [];
    const walk = (parent: number | null, depth: number) => {
      for (const n of (byParent.get(parent) ?? []).sort(
        (a, b) => a.position - b.position || a.id - b.id,
      )) {
        out.push({ node: n, depth });
        walk(n.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  });

  protected readonly parentTitle = computed(() => {
    const pid = this.mode() === 'new' ? this.newParent() : (this.selected()?.parent_id ?? null);
    return pid ? (this.list.value().find((n) => n.id === pid)?.title ?? '') : '';
  });

  protected readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    kind: new FormControl<NodeKind>('menu', { nonNullable: true }),
    body: new FormControl('', { nonNullable: true }),
    image_url: new FormControl('', { nonNullable: true }),
    audio_url: new FormControl('', { nonNullable: true }),
    link_url: new FormControl('', { nonNullable: true }),
    position: new FormControl(0, { nonNullable: true }),
    is_published: new FormControl(true, { nonNullable: true }),
  });

  protected pick(a: Audience): void {
    this.audience.set(a);
    this.cancel();
  }

  protected select(n: AdminNode): void {
    this.selected.set(n);
    this.mode.set('edit');
    this.form.reset({
      title: n.title,
      kind: n.kind,
      body: n.body ?? '',
      image_url: n.image_url ?? '',
      audio_url: n.audio_url ?? '',
      link_url: n.link_url ?? '',
      position: n.position,
      is_published: n.is_published,
    });
  }

  protected startNew(parentId: number | null): void {
    this.selected.set(null);
    this.newParent.set(parentId);
    this.mode.set('new');
    const siblings = this.list.value().filter((n) => n.parent_id === parentId);
    this.form.reset({
      title: '',
      kind: 'menu',
      body: '',
      image_url: '',
      audio_url: '',
      link_url: '',
      position: siblings.length,
      is_published: true,
    });
  }

  protected cancel(): void {
    this.selected.set(null);
    this.mode.set('idle');
  }

  protected save(): void {
    const v = this.form.getRawValue();
    const data: NodeInput = {
      audience: this.audience(),
      parent_id: this.mode() === 'new' ? this.newParent() : this.selected()!.parent_id,
      kind: v.kind,
      title: v.title.trim(),
      body: v.body.trim() || null,
      image_url: v.image_url.trim() || null,
      audio_url: v.audio_url.trim() || null,
      link_url: v.link_url.trim() || null,
      position: Number(v.position) || 0,
      is_published: v.is_published,
    };
    this.busy.set(true);
    const req =
      this.mode() === 'new'
        ? this.api.createNode(data)
        : this.api.updateNode(this.selected()!.id, data);
    req.subscribe({
      next: (n) => {
        this.busy.set(false);
        this.notify('Сохранено', true);
        this.list.reload();
        this.select(n);
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.notify(errorText(e), false);
      },
    });
  }

  protected remove(): void {
    const n = this.selected();
    if (!n || !confirm(`Удалить «${n.title}» и все вложенные кнопки?`)) return;
    this.busy.set(true);
    this.api.deleteNode(n.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.notify('Удалено', true);
        this.cancel();
        this.list.reload();
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.notify(errorText(e), false);
      },
    });
  }

  private notify(text: string, ok: boolean): void {
    this.message.set(text);
    this.messageOk.set(ok);
  }
}
