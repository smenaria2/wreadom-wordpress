const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;

export const uploadUrlToCloudinary = async (imageUrl: string, folder: string = 'wordpress-imports'): Promise<string> => {
  const formData = new FormData();
  formData.append('file', imageUrl);
  formData.append('upload_preset', 'ml_default'); 
  formData.append('folder', `librebook/${folder}`);
  
  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Failed to upload image to Cloudinary');
    }

    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
};
