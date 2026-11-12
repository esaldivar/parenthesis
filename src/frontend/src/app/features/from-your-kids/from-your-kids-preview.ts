import { AppLocale } from '../../core/i18n/locale.service';
import { KidsDiaryEntry, KidsGalleryItem } from './from-your-kids-contract';

const day = 86_400_000;
const previewSource = { childId: 'preview', visibleToViewer: true } as const;

/** Sample text, English then Spanish (#534). Development builds only. */
const pick = (locale: AppLocale, en: string, es: string) => (locale === 'es-419' ? es : en);

export function previewDiary(now: number, locale: AppLocale = 'en'): readonly KidsDiaryEntry[] {
  const t = (en: string, es: string) => pick(locale, en, es);
  return [
    { ...previewSource, kind: 'Diary', id: 'garden', createdAt: new Date(now).toISOString(),
      title: t('A little garden', 'Un pequeño jardín'), body: t('I planted a sunflower seed in a little pot today. I drew a picture of how tall it might get and put the picture on the fridge. I want to check it every morning and draw the first leaf when it comes up.', 'Hoy planté una semilla de girasol en una maceta pequeña. Hice un dibujo de lo alto que podría crecer y lo puse en el refrigerador. Quiero revisarla cada mañana y dibujar la primera hoja cuando salga.'), mood: 'Happy' },
    { ...previewSource, kind: 'Diary', id: 'clouds', createdAt: new Date(now - day).toISOString(),
      title: t('Watching clouds', 'Mirando las nubes'), body: t('One cloud looked like a giant rabbit.', 'Una nube parecía un conejo gigante.'), mood: 'Calm' },
    { ...previewSource, kind: 'Diary', id: 'rain', createdAt: new Date(now - 2 * day).toISOString(),
      title: t('Rainy day drawings', 'Dibujos de un día de lluvia'), body: t('I drew a rocket while the rain tapped on the window.', 'Dibujé un cohete mientras la lluvia golpeaba la ventana.'), mood: 'Proud' },
  ];
}

export function previewGallery(kind: KidsGalleryItem['kind'], now: number, locale: AppLocale = 'en'): readonly KidsGalleryItem[] {
  const t = (en: string, es: string) => pick(locale, en, es);
  const examples = kind === 'Artwork'
    ? [
      { label: t('Sample flower drawing', 'Dibujo de ejemplo de una flor'), asset: 'art-flower' },
      { label: t('Sample rainbow drawing', 'Dibujo de ejemplo de un arcoíris'), asset: 'art-rainbow' },
      { label: t('Sample cat drawing', 'Dibujo de ejemplo de un gato'), asset: 'art-cat' },
      { label: t('Sample rocket drawing', 'Dibujo de ejemplo de un cohete'), asset: 'art-rocket' },
      { label: t('Sample heart drawing', 'Dibujo de ejemplo de un corazón'), asset: 'art-heart' },
    ]
    : [
      { label: t('Sample sunset photo', 'Foto de ejemplo de un atardecer'), asset: 'sample-sunset' },
      { label: t('Sample dog photo', 'Foto de ejemplo de un perro'), asset: 'sample-dog' },
      { label: t('Sample playground photo', 'Foto de ejemplo de un parque infantil'), asset: 'sample-swing' },
    ];
  return examples.map(({ label, asset }, index) => {
    const imageUrl = `/art/from-your-kids/${asset}.webp`;
    const createdAt = now - index * day;
    const bookmarked = index === 1;
    return {
      ...previewSource, kind, id: asset, altText: label, createdAt: new Date(createdAt).toISOString(),
      imageUrl, thumbnailUrl: imageUrl, bookmarked, expiresAt: bookmarked ? null : new Date(createdAt + 60 * day).toISOString(),
      heartedByViewer: false, viewerComment: null, downloadUrl: null,
    };
  });
}
