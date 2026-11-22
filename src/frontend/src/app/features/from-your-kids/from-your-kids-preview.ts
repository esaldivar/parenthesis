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
  if (kind === 'Photo') return previewPhotos(now, locale);
  const t = (en: string, es: string) => pick(locale, en, es);
  const examples = [
    { label: t('Sample flower drawing', 'Dibujo de ejemplo de una flor'), asset: 'art-flower' },
    { label: t('Sample rainbow drawing', 'Dibujo de ejemplo de un arcoíris'), asset: 'art-rainbow' },
    { label: t('Sample cat drawing', 'Dibujo de ejemplo de un gato'), asset: 'art-cat' },
    { label: t('Sample rocket drawing', 'Dibujo de ejemplo de un cohete'), asset: 'art-rocket' },
    { label: t('Sample heart drawing', 'Dibujo de ejemplo de un corazón'), asset: 'art-heart' },
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

/**
 * Six synthetic photos for the Photos board, gallery and detail (#710), newest first and a day apart, alternating
 * afternoon times; every other one is already hearted. The Figma mock photos are illustrative only.
 */
export function previewPhotos(now: number, locale: AppLocale = 'en'): readonly KidsGalleryItem[] {
  const t = (en: string, es: string) => pick(locale, en, es);
  const photos = [
    { label: t('Sample photo of a kite over a park', 'Foto de ejemplo de un papalote sobre un parque'), asset: 'sample-kite' },
    { label: t('Sample photo of a sandcastle on the beach', 'Foto de ejemplo de un castillo de arena en la playa'), asset: 'sample-beach' },
    { label: t('Sample photo of a chalk rainbow on a path', 'Foto de ejemplo de un arcoíris de gis en un camino'), asset: 'sample-chalk' },
  ];
  const today = new Date(now);
  return Array.from({ length: 6 }, (_, index) => {
    const { label, asset } = photos[index % photos.length];
    const shared = new Date(today.getFullYear(), today.getMonth(), today.getDate() - index, index % 2 ? 16 : 14, index % 2 ? 42 : 15);
    const imageUrl = `/art/from-your-kids/photos/${asset}.webp`;
    return {
      ...previewSource, kind: 'Photo' as const, id: `${asset}-${index}`, altText: label, createdAt: shared.toISOString(),
      imageUrl, thumbnailUrl: imageUrl, bookmarked: false, expiresAt: null,
      heartedByViewer: index % 2 === 1, viewerComment: null, downloadUrl: null,
    };
  });
}
