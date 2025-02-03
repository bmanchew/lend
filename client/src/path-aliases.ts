
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const aliases = {
  '@': path.resolve(__dirname, '../src'),
  '@components': path.resolve(__dirname, '../src/components'),
  '@hooks': path.resolve(__dirname, '../src/hooks'),
  '@pages': path.resolve(__dirname, '../src/pages'),
  '@lib': path.resolve(__dirname, '../src/lib')
}
