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
    ? [{ label: 'Sample flower drawing', symbol: '🌼' }, { label: 'Sample rainbow drawing', symbol: '🌈' }]
    : [{ label: 'Sample mountain scene', symbol: '⛰️' }, { label: 'Sample beach scene', symbol: '🏖️' }];
  return examples.map(({ label, symbol }, index) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" fill="#f7f5ed"/><text x="80" y="105" font-size="66" text-anchor="middle">${symbol}</text></svg>`;
    const imageUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    const createdAt = now - index * day;
    const bookmarked = index === 1;
    return {
      ...previewSource, kind, id: label, altText: label, createdAt: new Date(createdAt).toISOString(),
      imageUrl, thumbnailUrl: imageUrl, bookmarked, expiresAt: bookmarked ? null : new Date(createdAt + 60 * day).toISOString(),
      heartedByViewer: false, viewerComment: null, downloadUrl: null,
    };
  });
}
