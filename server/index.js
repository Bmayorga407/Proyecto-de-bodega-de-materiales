import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Expose the uploads folder statically (keep for any existing old uploads if any)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Google Service Account Setup
const KEY_FILE_PATH = path.join(__dirname, '..', 'credentials.json');
const SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets'
];

const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE_PATH,
    scopes: SCOPES,
});

const drive = google.drive({ version: 'v3', auth });
const sheets = google.sheets({ version: 'v4', auth });

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// API ROUTES

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Backend Bodega Coca-Cola Operativo' });
});

app.post('/api/products', async (req, res) => {
    try {
        const { name, code, description, stock, details, imageUrl = '' } = req.body;

        // 1. Append to Google Sheets
        const resource = {
            values: [
                // Matches columns: ID, Code, Name, Description, Stock, ImageURL, Details
                [Date.now().toString(), code, name, description, stock, imageUrl, details]
            ],
        };

        const sheetRes = await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Hoja 1!A:A', // Change to A:A so it always anchors to the first column
            valueInputOption: 'USER_ENTERED',
            requestBody: resource,
        });

        res.status(200).json({
            success: true,
            message: 'Product added successfully',
            imageUrl,
            sheetUpdates: sheetRes.data?.updates
        });

    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({ success: false, error: 'Failed to process request' });
    }
});

app.get('/api/products', async (req, res) => {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Hoja 1!A:G',
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return res.status(200).json([]);
        }

        // Skip headers if the first row contains 'Code' or 'Nombre'
        const data = rows[0][0]?.toLowerCase().includes('id') || rows[0][1]?.toLowerCase().includes('code')
            ? rows.slice(1)
            : rows;

        const products = data.map(row => {
            // Google sheets drops trailing empty cells from rows, and if there are missing cells at the start it might shift.
            // We just ensure we pad the array up to 7 items if necessary.
            return {
                id: row[0] || '',
                code: row[1] || '',
                name: row[2] || '',
                description: row[3] || '',
                stock: Number(row[4]) || 0,
                imageUrl: row[5] || '',
                details: row[6] || ''
            };
        }).filter(p => p.id && p.id.trim() !== ''); // Filter out any completely empty / broken ghost rows

        res.status(200).json(products);
    } catch (error) {
        console.error('Error fetching products from Sheets:', error);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        const productId = req.params.id;

        // 1. Get the sheet ID for "Hoja 1"
        const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
        const sheetProperties = sheetMeta.data.sheets.find(s => s.properties.title === 'Hoja 1')?.properties;
        if (!sheetProperties) return res.status(404).json({ error: 'Sheet not found' });

        // 2. Fetch column A to find the row index
        const getRes = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Hoja 1!A:A',
        });
        const rows = getRes.data.values;
        if (!rows) return res.status(404).json({ error: 'No data' });

        let rowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] === productId) {
                rowIndex = i;
                break;
            }
        }

        if (rowIndex === -1) return res.status(404).json({ error: 'Product not found' });

        // 3. Delete the specific row
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                requests: [{
                    deleteDimension: {
                        range: {
                            sheetId: sheetProperties.sheetId,
                            dimension: 'ROWS',
                            startIndex: rowIndex,
                            endIndex: rowIndex + 1
                        }
                    }
                }]
            }
        });

        res.status(200).json({ success: true, message: 'Deleted' });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

app.listen(process.env.PORT || 3001, () => {
    console.log(`Server running on port ${process.env.PORT || 3001}`);
});
