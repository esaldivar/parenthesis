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
      title: t('A little garden', 'Un pequeño jardín'), body: t('I planted a sunflower seed in a little pot today. I drew a picture of how tall it might get and put the picture on the fridge. I want to check it every morning and draw the first leaf when it comes up. Grandma says sunflowers turn to follow the sun, so I put the pot by the kitchen window where it is sunny after lunch. I gave it a little water, not too much, because too much water can make the seed sad. I made a chart with a box for every day so I can write down how tall it is. If it grows taller than me I will name it Captain Sunny and take a photo standing next to it. Tomorrow I am going to plant a second seed so the first one has a friend.', 'Hoy planté una semilla de girasol en una maceta pequeña. Hice un dibujo de lo alto que podría crecer y lo puse en el refrigerador. Quiero revisarla cada mañana y dibujar la primera hoja cuando salga. La abuela dice que los girasoles giran para seguir al sol, así que puse la maceta junto a la ventana de la cocina, donde da el sol después del almuerzo. Le di un poquito de agua, no demasiada, porque demasiada agua puede poner triste a la semilla. Hice una tabla con una casilla para cada día y así anotar cuánto crece. Si crece más alta que yo, la llamaré Capitana Sol y me tomaré una foto a su lado. Mañana voy a plantar otra semilla para que la primera tenga una amiga.'), mood: 'Happy' },
    { ...previewSource, kind: 'Diary', id: 'clouds', createdAt: new Date(now - day).toISOString(),
      title: t('Watching clouds', 'Mirando las nubes'), body: t('One cloud looked like a giant rabbit.', 'Una nube parecía un conejo gigante.'), mood: 'Calm' },
    { ...previewSource, kind: 'Diary', id: 'rain', createdAt: new Date(now - 2 * day).toISOString(),
      title: t('Rainy day drawings', 'Dibujos de un día de lluvia'), body: t('I drew a rocket while the rain tapped on the window.', 'Dibujé un cohete mientras la lluvia golpeaba la ventana.'), mood: 'Proud' },
  ];
}

export function previewGallery(kind: KidsGalleryItem['kind'], now: number, locale: AppLocale = 'en'): readonly KidsGalleryItem[] {
  return kind === 'Photo' ? previewPhotos(now, locale) : previewArtwork(now, locale);
}

/**
 * Synthetic gallery items for the board, gallery and detail views, newest first and a day apart, alternating
 * afternoon times; every other one is already hearted. The Figma mock images are illustrative only.
 */
function previewItems(kind: KidsGalleryItem['kind'], folder: string, count: number, samples: readonly { label: string; asset: string }[], now: number): readonly KidsGalleryItem[] {
  const today = new Date(now);
  return Array.from({ length: count }, (_, index) => {
    const { label, asset } = samples[index % samples.length];
    const shared = new Date(today.getFullYear(), today.getMonth(), today.getDate() - index, index % 2 ? 16 : 14, index % 2 ? 42 : 15);
    const imageUrl = `/art/from-your-kids/${folder}/${asset}.webp`;
    return {
      ...previewSource, kind, id: `${asset}-${index}`, altText: label, createdAt: shared.toISOString(),
      imageUrl, thumbnailUrl: imageUrl, bookmarked: false, expiresAt: null,
      heartedByViewer: index % 2 === 1, viewerComment: null, downloadUrl: null,
    };
  });
}

/** Six sample photos (three images, each twice) for Photos (#710). */
export function previewPhotos(now: number, locale: AppLocale = 'en'): readonly KidsGalleryItem[] {
  const t = (en: string, es: string) => pick(locale, en, es);
  return previewItems('Photo', 'photos', 6, [
    { label: t('Sample photo of a kite over a park', 'Foto de ejemplo de un papalote sobre un parque'), asset: 'sample-kite' },
    { label: t('Sample photo of a sandcastle on the beach', 'Foto de ejemplo de un castillo de arena en la playa'), asset: 'sample-beach' },
    { label: t('Sample photo of a chalk rainbow on a path', 'Foto de ejemplo de un arcoíris de gis en un camino'), asset: 'sample-chalk' },
  ], now);
}

/** Five different sample drawings for Artwork (#714): three on the fridge, and more behind View all. */
export function previewArtwork(now: number, locale: AppLocale = 'en'): readonly KidsGalleryItem[] {
  const t = (en: string, es: string) => pick(locale, en, es);
  return previewItems('Artwork', 'artwork', 5, [
    { label: t('Sample drawing of a family under a smiling sun', 'Dibujo de ejemplo de una familia bajo un sol sonriente'), asset: 'sample-sun-family' },
    { label: t('Sample drawing of a rocket and the moon', 'Dibujo de ejemplo de un cohete y la luna'), asset: 'sample-rocket' },
    { label: t('Sample drawing of a fish jumping under a rainbow', 'Dibujo de ejemplo de un pez saltando bajo un arcoíris'), asset: 'sample-rainbow-fish' },
    { label: t('Sample drawing of a cat in a flower garden', 'Dibujo de ejemplo de un gato en un jardín de flores'), asset: 'sample-cat-garden' },
    { label: t('Sample drawing of a dinosaur eating leaves', 'Dibujo de ejemplo de un dinosaurio comiendo hojas'), asset: 'sample-dinosaur' },
  ], now);
}
