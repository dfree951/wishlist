export async function prepareImage(file: File): Promise<Blob> {
  if (!file.size) throw new Error('Choose an image to upload.');
  if (file.size > 25_000_000) throw new Error('Choose an image smaller than 25 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => { throw new Error('This image could not be opened. Choose a JPG, PNG, WebP, or GIF image.'); });
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to prepare this image. Try another browser.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error('Unable to prepare this image.')), 'image/jpeg', .85);
    });
    if (blob.size > 3_500_000) throw new Error('This image is too large. Choose a smaller image.');
    return blob;
  } finally { URL.revokeObjectURL(url); }
}
