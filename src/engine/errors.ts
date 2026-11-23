/**
 * Каталог ошибок: у каждой — идентификатор, причина и способ исправления.
 * Диапазоны:
 *   E-1xxx — валидация кода (HTML/CSS/JS/Python)
 *   E-2xxx — сборка APK
 *   E-3xxx — декомпиляция
 *   E-4xxx — XAPK
 *   E-5xxx — ключи и подпись
 *   E-6xxx — движок / окружение
 */
export interface ErrorDef {
  id: string;
  title: string;
  cause: string;
  fix: string;
  severity: 'error' | 'warning' | 'info';
  scope: 'validator' | 'build' | 'decompile' | 'xapk' | 'sign' | 'engine';
}

export const ERROR_CATALOG: ErrorDef[] = [
  /* ---------------- валидация ---------------- */
  {
    id: 'E-1001',
    title: 'Незакрытый HTML-тег',
    cause: 'Открывающий тег не имеет парного закрывающего. Браузер закроет его автоматически, но структура документа может поехать.',
    fix: 'Добавьте закрывающий тег </...> или сделайте элемент самозакрывающимся.',
    severity: 'error',
    scope: 'validator',
  },
  {
    id: 'E-1002',
    title: 'Лишний закрывающий тег',
    cause: 'Закрывающий тег не соответствует ни одному открытому элементу.',
    fix: 'Удалите тег или проверьте вложенность — возможно, он должен закрывать другой элемент.',
    severity: 'error',
    scope: 'validator',
  },
  {
    id: 'E-1003',
    title: 'Несовпадение тегов',
    cause: 'Закрывающий тег не совпадает с последним открытым.',
    fix: 'Проверьте порядок закрывающих тегов: последним открывается — первым закрывается.',
    severity: 'error',
    scope: 'validator',
  },
  {
    id: 'E-1004',
    title: 'Синтаксическая ошибка JavaScript',
    cause: 'Встроенный скрипт содержит синтаксическую ошибку и не будет исполнен.',
    fix: 'Исправьте указанную позицию: проверьте скобки, запятые, кавычки и ключевые слова.',
    severity: 'error',
    scope: 'validator',
  },
  {
    id: 'E-1005',
    title: 'Синтаксическая ошибка CSS',
    cause: 'Браузер проигнорирует правило с ошибкой — стиль не применится.',
    fix: 'Проверьте фигурные скобки, двоеточия и точки с запятой в правиле.',
    severity: 'error',
    scope: 'validator',
  },
  {
    id: 'E-1006',
    title: 'Незакрытая фигурная скобка',
    cause: 'Количество { и } в CSS не совпадает.',
    fix: 'Добавьте недостающую закрывающую скобку.',
    severity: 'error',
    scope: 'validator',
  },
  {
    id: 'E-1007',
    title: 'Отсутствует <!DOCTYPE html>',
    cause: 'Без doctype браузер работает в режиме совместимости, что ломает современные стили.',
    fix: 'Добавьте первой строкой: <!DOCTYPE html>',
    severity: 'warning',
    scope: 'validator',
  },
  {
    id: 'E-1008',
    title: 'Дублирующийся id',
    cause: 'Атрибут id должен быть уникальным в пределах документа.',
    fix: 'Переименуйте дубликат или используйте класс.',
    severity: 'warning',
    scope: 'validator',
  },
  {
    id: 'E-1009',
    title: 'Изображение без alt',
    cause: 'Без альтернативного текста изображение недоступно для скринридеров и SEO.',
    fix: 'Добавьте атрибут alt с описанием изображения.',
    severity: 'info',
    scope: 'validator',
  },
  {
    id: 'E-1010',
    title: 'Синтаксическая ошибка Python',
    cause: 'Интерпретатор не сможет выполнить файл.',
    fix: 'Исправьте указанную строку: проверьте отступы, двоеточия и скобки.',
    severity: 'error',
    scope: 'validator',
  },
  {
    id: 'E-1011',
    title: 'Смешанные табы и пробелы',
    cause: 'Python запрещает смешивать табуляцию и пробелы в отступах.',
    fix: 'Используйте только пробелы (PEP 8 рекомендует 4 пробела на уровень).',
    severity: 'error',
    scope: 'validator',
  },
  {
    id: 'E-1012',
    title: 'Неправильное имя пакета',
    cause: 'Имя пакета Android должно содержать только латиницу, цифры, точки и подчёркивания, иметь минимум два сегмента и не начинаться с цифры.',
    fix: 'Например: com.example.myapp',
    severity: 'error',
    scope: 'build',
  },
  {
    id: 'E-1013',
    title: 'Пустой или слишком короткий код',
    cause: 'В проекте нет ни одного файла с кодом — собирать нечего.',
    fix: 'Добавьте HTML-файл или выберите другой исходник.',
    severity: 'error',
    scope: 'validator',
  },
  {
    id: 'E-1014',
    title: 'Некорректный URL',
    cause: 'Адрес должен начинаться с http:// или https://.',
    fix: 'Укажите полный адрес, например https://example.com',
    severity: 'error',
    scope: 'build',
  },
  {
    id: 'E-1015',
    title: 'Не найден index.html',
    cause: 'В папке проекта нет точки входа index.html.',
    fix: 'Создайте index.html в корне папки проекта.',
    severity: 'error',
    scope: 'build',
  },

  /* ---------------- сборка ---------------- */
  {
    id: 'E-2001',
    title: 'Не выбран ключ подписи',
    cause: 'APK без подписи не установится на устройство.',
    fix: 'Создайте ключ в разделе «Подпись» или выберите существующий.',
    severity: 'error',
    scope: 'build',
  },
  {
    id: 'E-2002',
    title: 'Ошибка генерации DEX',
    cause: 'Не удалось скомпилировать байткод Activity.',
    fix: 'Проверьте имя класса и повторите сборку.',
    severity: 'error',
    scope: 'build',
  },
  {
    id: 'E-2003',
    title: 'Ошибка сборки манифеста',
    cause: 'Бинарный AndroidManifest.xml не смог быть сериализован.',
    fix: 'Проверьте имя пакета, версию и разрешения.',
    severity: 'error',
    scope: 'build',
  },
  {
    id: 'E-2004',
    title: 'Слишком большой проект',
    cause: 'Размер assets превышает разумный лимит (512 МБ).',
    fix: 'Удалите лишние файлы или сожмите медиа.',
    severity: 'error',
    scope: 'build',
  },
  {
    id: 'E-2005',
    title: 'Недопустимое имя приложения',
    cause: 'Имя приложения пустое.',
    fix: 'Укажите отображаемое имя приложения.',
    severity: 'error',
    scope: 'build',
  },
  {
    id: 'E-2006',
    title: 'Некорректная иконка',
    cause: 'Иконка должна быть PNG не меньше 48×48 px.',
    fix: 'Загрузите PNG 192×192 или 512×512.',
    severity: 'error',
    scope: 'build',
  },

  /* ---------------- декомпиляция ---------------- */
  {
    id: 'E-3001',
    title: 'Файл не является APK',
    cause: 'Не найден AndroidManifest.xml внутри архива.',
    fix: 'Выберите корректный .apk файл.',
    severity: 'error',
    scope: 'decompile',
  },
  {
    id: 'E-3002',
    title: 'Повреждённый архив',
    cause: 'ZIP-структура нарушена или архив запаролен.',
    fix: 'Попробуйте другой файл или переархивируйте APK.',
    severity: 'error',
    scope: 'decompile',
  },
  {
    id: 'E-3003',
    title: 'Нет classes.dex',
    cause: 'В приложении нет исполняемого кода (только ресурсы) либо он защищён.',
    fix: 'Декомпиляция будет выполнена частично — только ресурсы и манифест.',
    severity: 'warning',
    scope: 'decompile',
  },
  {
    id: 'E-3004',
    title: 'Манифест не декодирован',
    cause: 'Бинарный XML имеет нестандартную структуру.',
    fix: 'Будет сохранён исходный бинарный манифест.',
    severity: 'warning',
    scope: 'decompile',
  },

  /* ---------------- XAPK ---------------- */
  {
    id: 'E-4001',
    title: 'Файл не является XAPK/APKS',
    cause: 'В архиве нет manifest.json и base.apk.',
    fix: 'Выберите корректный .xapk или .apks файл.',
    severity: 'error',
    scope: 'xapk',
  },
  {
    id: 'E-4002',
    title: 'Отсутствует base.apk',
    cause: 'Базовый APK не найден в архиве.',
    fix: 'Проверьте целостность XAPK.',
    severity: 'error',
    scope: 'xapk',
  },
  {
    id: 'E-4003',
    title: 'Несовместимые split-APK',
    cause: 'Split-модули имеют разные подписи и не могут быть объединены в один APK.',
    fix: 'Оставлен базовый APK без split-модулей.',
    severity: 'warning',
    scope: 'xapk',
  },
  {
    id: 'E-4004',
    title: 'Конфликт ресурсов при слиянии',
    cause: 'Split-модуль содержит resources.arsc, который нельзя безопасно объединить.',
    fix: 'Объединены только dex/lib/assets; ресурсы базового APK сохранены.',
    severity: 'warning',
    scope: 'xapk',
  },

  /* ---------------- ключи ---------------- */
  {
    id: 'E-5001',
    title: 'Некорректный ключ',
    cause: 'Файл ключа повреждён или не является PKCS#8.',
    fix: 'Импортируйте корректный PKCS#8 (.pem) или создайте новый ключ.',
    severity: 'error',
    scope: 'sign',
  },
  {
    id: 'E-5002',
    title: 'APK уже подписан',
    cause: 'Файл содержит подпись. Повторная подпись заменит её.',
    fix: 'Это нормально — старая подпись будет удалена.',
    severity: 'info',
    scope: 'sign',
  },
  {
    id: 'E-5003',
    title: 'Ключ не найден',
    cause: 'Выбранный ключ был удалён.',
    fix: 'Выберите другой ключ или создайте новый.',
    severity: 'error',
    scope: 'sign',
  },

  /* ---------------- движок ---------------- */
  {
    id: 'E-6001',
    title: 'WebCrypto недоступен',
    cause: 'Браузер не поддерживает SubtleCrypto (нужен HTTPS или localhost).',
    fix: 'Откройте приложение по HTTPS или в браузере с поддержкой WebCrypto.',
    severity: 'error',
    scope: 'engine',
  },
  {
    id: 'E-6002',
    title: 'Не хватает памяти',
    cause: 'Проект слишком большой для обработки в браузере.',
    fix: 'Уменьшите размер проекта или закройте другие вкладки.',
    severity: 'error',
    scope: 'engine',
  },
  {
    id: 'E-6003',
    title: 'Ошибка чтения файла',
    cause: 'Не удалось прочитать файл с диска.',
    fix: 'Проверьте права доступа и повторите попытку.',
    severity: 'error',
    scope: 'engine',
  },
];

const MAP = new Map(ERROR_CATALOG.map((e) => [e.id, e]));

export function getErrorDef(id: string): ErrorDef {
  return MAP.get(id) ?? {
    id,
    title: 'Неизвестная ошибка',
    cause: 'Описание отсутствует.',
    fix: 'Обратитесь к документации.',
    severity: 'error',
    scope: 'engine',
  };
}

export interface AppError extends Error {
  code?: string;
}

/** Бросает ошибку с идентификатором из каталога. */
export function fail(id: string, detail?: string): never {
  const def = getErrorDef(id);
  const e = new Error(detail ? `${def.title}: ${detail}` : def.title) as AppError;
  e.code = id;
  throw e;
}

export function describeError(e: unknown): { id: string; title: string; detail: string } {
  if (e instanceof Error) {
    const id = (e as AppError).code ?? 'E-6003';
    const def = getErrorDef(id);
    return { id, title: def.title, detail: e.message };
  }
  return { id: 'E-6003', title: 'Неизвестная ошибка', detail: String(e) };
}
