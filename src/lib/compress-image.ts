/**
 * Client-side image compression using Canvas API.
 * Resizes to max dimension and converts to compressed JPEG.
 * This runs in the browser before upload to reduce file size
 * and avoid Vercel's 4.5MB serverless body size limit.
 */

const MAX_DIMENSION = 1200   // px – longest edge
const JPEG_QUALITY = 0.7     // 0–1 quality factor

export async function compressImage(file: File): Promise<File> {
  // Skip compression for non-image files or tiny files
  if (!file.type.startsWith('image/') || file.size < 100_000) {
    return file
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      let { width, height } = img

      // Calculate new dimensions maintaining aspect ratio
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = Math.round((height / width) * MAX_DIMENSION)
          width = MAX_DIMENSION
        } else {
          width = Math.round((width / height) * MAX_DIMENSION)
          height = MAX_DIMENSION
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(file) // fallback to original
        return
      }

      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file) // fallback to original
            return
          }

          // Create a new File from the blob with .jpg extension
          const compressedFile = new File(
            [blob],
            file.name.replace(/\.[^.]+$/, '.jpg'),
            { type: 'image/jpeg', lastModified: Date.now() }
          )

          console.log(
            `[Compress] ${(file.size / 1024).toFixed(0)}KB → ${(compressedFile.size / 1024).toFixed(0)}KB (${Math.round((1 - compressedFile.size / file.size) * 100)}% reduction)`
          )

          resolve(compressedFile)
        },
        'image/jpeg',
        JPEG_QUALITY
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file) // fallback to original on error
    }

    img.src = url
  })
}
