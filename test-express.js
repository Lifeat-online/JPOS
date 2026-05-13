import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.get('*', (req, res) => res.sendFile(__dirname + '/missing.html'));
app.listen(8081, () => console.log('started'));