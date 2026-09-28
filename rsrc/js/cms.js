// The public export is the only source of content, locally and on GitHub Pages.
export async function loadContent(signal) {
  const response = await fetch('/content/cms/manifest.json', { cache: 'no-cache', signal });
  if (!response.ok) throw new Error('Le contenu du portfolio est indisponible. Réessaie.');
  const manifest = await response.json();
  if (manifest.version !== 1 || !Array.isArray(manifest.media) ||
      !Array.isArray(manifest.projects) || !Array.isArray(manifest.collaborations)) {
    throw new Error('Le contenu du portfolio est invalide.');
  }
  const media = new Map(manifest.media.map(item => [item.id, item]));
  const photos = manifest.photos.slice().reverse().map(id => media.get(id));
  const projects = manifest.projects.slice().reverse().map(record => ({
    ...record,
    url: record.url,
    photos: photos.filter(photo => photo?.projectId === record.id).map((photo, order) => ({
      ...photo,
      order,
      ...dimensions(photo),
      prepared: Boolean(photo.variants.small && photo.variants.large),
    })),
    showcase: record.showcase.map(id => media.get(id)).filter(Boolean).map(photo => ({
      id: photo.id, ...photo.variants.large,
    })),
  }));
  const videos = manifest.collaborations.slice().reverse().map(record => {
    const variant = media.get(record.videoId)?.variants.video;
    return {
      ...record,
      url: record.url,
      photos: record.images.map(id => media.get(id)).filter(Boolean).map((image, order) => ({
        ...image, order, ...dimensions(image), prepared: Boolean(image.variants.small && image.variants.large),
      })),
      poster: media.get(record.images[0])?.variants.large?.url || '',
      video: variant ? { ...variant, type: variant.mimeType } : null,
    };
  });
  return { manifest, media, projects, videos };
}

function dimensions(media) {
  const variant = media.variants.large || media.variants.small;
  return { width: variant?.width, height: variant?.height };
}
