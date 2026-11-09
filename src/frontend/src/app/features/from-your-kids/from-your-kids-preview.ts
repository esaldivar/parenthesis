import { KidsDiaryEntry, KidsGalleryItem } from './from-your-kids-contract';

const day = 86_400_000;
const previewSource = { childId: 'preview', visibleToViewer: true } as const;

export function previewDiary(now: number): readonly KidsDiaryEntry[] {
  return [
    { ...previewSource, kind: 'Diary', id: 'garden', createdAt: new Date(now).toISOString(),
      title: 'A little garden', body: 'I planted a seed and drew a picture of what it might grow into.', mood: 'Happy' },
    { ...previewSource, kind: 'Diary', id: 'clouds', createdAt: new Date(now - day).toISOString(),
      title: 'Watching clouds', body: 'One cloud looked like a giant rabbit.', mood: 'Calm' },
  ];
}

export function previewGallery(kind: KidsGalleryItem['kind'], now: number): readonly KidsGalleryItem[] {
  const examples = kind === 'Artwork'
    ? [
      { label: 'Sample flower drawing', asset: 'art-flower' },
      { label: 'Sample rainbow drawing', asset: 'art-rainbow' },
      { label: 'Sample cat drawing', asset: 'art-cat' },
      { label: 'Sample rocket drawing', asset: 'art-rocket' },
      { label: 'Sample heart drawing', asset: 'art-heart' },
    ]
    : [
      { label: 'Sample sunset photo', asset: 'sample-sunset' },
      { label: 'Sample dog photo', asset: 'sample-dog' },
      { label: 'Sample playground photo', asset: 'sample-swing' },
    ];
  return examples.map(({ label, asset }, index) => {
    const imageUrl = `/art/from-your-kids/${asset}.webp`;
    const createdAt = now - index * day;
    const bookmarked = index === 1;
    return {
      ...previewSource, kind, id: label, altText: label, createdAt: new Date(createdAt).toISOString(),
      imageUrl, thumbnailUrl: imageUrl, bookmarked, expiresAt: bookmarked ? null : new Date(createdAt + 60 * day).toISOString(),
      heartedByViewer: false, viewerComment: null, downloadUrl: null,
    };
  });
}
