import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env as an import side-effect so it runs before any module that reads
// process.env at import time (e.g. db/index.ts constructing the pg Pool).
// ESM hoists `import` statements above module-body code, so calling
// dotenv.config() in index.ts's body runs *after* its imports have already
// executed — too late for the Pool. Importing this module first fixes that.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), override: true });
