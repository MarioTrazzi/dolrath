type UploadResult = {
  secureUrl: string;
  publicId?: string;
};

function getCloudinaryConfig() {
  const cloudName = (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || '').trim();
  const uploadPreset = (process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || '').trim();
  return { cloudName, uploadPreset };
}

export function isCloudinaryUploadConfigured(): boolean {
  const { cloudName, uploadPreset } = getCloudinaryConfig();
  return Boolean(cloudName && uploadPreset);
}

export async function uploadImageToCloudinary(input: {
  file?: File;
  dataUrl?: string;
  folder?: string;
  tags?: string[];
}): Promise<UploadResult> {
  const { cloudName, uploadPreset } = getCloudinaryConfig();
  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary upload não configurado (NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME / NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET)');
  }

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const form = new FormData();
  form.append('upload_preset', uploadPreset);

  if (input.folder) form.append('folder', input.folder);
  if (input.tags?.length) form.append('tags', input.tags.join(','));

  if (input.file) {
    form.append('file', input.file);
  } else if (input.dataUrl) {
    // Cloudinary accepts data URIs as the `file` field.
    form.append('file', input.dataUrl);
  } else {
    throw new Error('Nenhum arquivo/imagem fornecido para upload');
  }

  const res = await fetch(url, {
    method: 'POST',
    body: form,
  });

  const raw = await res.text().catch(() => '');
  let json: any = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg = typeof json?.error?.message === 'string' ? json.error.message : `Falha ao subir imagem (HTTP ${res.status})`;
    throw new Error(msg);
  }

  const secureUrl = typeof json?.secure_url === 'string' ? json.secure_url : '';
  const publicId = typeof json?.public_id === 'string' ? json.public_id : undefined;

  if (!secureUrl) throw new Error('Upload para Cloudinary não retornou secure_url');

  return { secureUrl, publicId };
}
