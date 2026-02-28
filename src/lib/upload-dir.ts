import path from 'path'

/** Persistent base directory for all uploaded files (documents, etc.) */
export const UPLOAD_BASE = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), 'uploads')

/** Base directory for document pool files */
export const DOCUMENTS_DIR = path.join(UPLOAD_BASE, 'documents')
