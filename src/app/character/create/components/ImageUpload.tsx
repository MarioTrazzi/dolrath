'use client';

import { ChangeEvent, useRef, useState } from 'react';
import { Upload, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { isCloudinaryUploadConfigured, uploadImageToCloudinary } from '@/lib/cloudinaryUpload';

interface ImageUploadProps {
  onImageSelect: (imageUrl: string | null) => void;
  selectedImage: string | null;
}

export function ImageUpload({ onImageSelect, selectedImage }: ImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Prefer Cloudinary HTTPS URLs for wallet/market compatibility.
    if (isCloudinaryUploadConfigured()) {
      setIsUploading(true);
      try {
        const { secureUrl } = await uploadImageToCloudinary({
          file,
          folder: 'dolrath/characters/avatars',
          tags: ['dolrath', 'character-avatar'],
        });
        onImageSelect(secureUrl);
        return;
      } catch {
        // Fall back to local data URL below.
      } finally {
        setIsUploading(false);
      }
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      onImageSelect(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    onImageSelect(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // Clear the file input
    }
  };

  return (
    <div className="space-y-4">
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />
      
      {!selectedImage ? (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full h-32 border-2 border-dashed border-white/30 rounded-lg flex flex-col items-center justify-center text-text-secondary hover:border-primary hover:text-primary transition-colors"
        >
          <Upload className="w-8 h-8 mb-2" />
          <span className="text-sm font-medium">{isUploading ? 'Enviando...' : 'Clique para fazer upload ou arraste e solte'}</span>
          <span className="text-xs text-text-secondary/70 mt-1">(JPG, PNG, GIF, WEBP)</span>
        </button>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative w-full aspect-square rounded-lg overflow-hidden border-2 border-primary shadow-lg shadow-primary/25"
        >
          <img src={selectedImage} alt="Uploaded character" className="w-full h-full object-cover" />
          <button
            onClick={handleRemoveImage}
            className="absolute top-2 right-2 bg-red-500/80 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
            title="Remover imagem"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </motion.div>
      )}
    </div>
  );
}
