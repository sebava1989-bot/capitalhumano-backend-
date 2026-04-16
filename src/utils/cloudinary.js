import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Sube un Buffer a Cloudinary.
 * @param {Buffer} buffer - El archivo en memoria
 * @param {object} options - Opciones de Cloudinary (resource_type, folder, public_id, etc.)
 * @returns {Promise<object>} Resultado con secure_url y public_id
 */
export async function uploadBuffer(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
    stream.end(buffer);
  });
}

/**
 * Elimina un archivo de Cloudinary por su public_id.
 * @param {string} publicId
 * @param {string} resourceType - 'image' | 'raw'
 */
export async function deleteFile(publicId, resourceType = 'raw') {
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}

export { cloudinary };
