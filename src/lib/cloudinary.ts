import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})

export default cloudinary

export function getCloudinaryFolder(
  companySlug: string,
  siteSlug: string,
  module: string
): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `civil-tracker/${companySlug}/${siteSlug}/${module}/${year}/${month}`
}
