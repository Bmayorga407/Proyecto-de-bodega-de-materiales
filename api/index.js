import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Re-define '__dirname' for ES modules
const typeofModule = typeof module !== 'undefined' ? module : null;
let currentDir;
if (typeof __dirname !== 'undefined') {
    currentDir = __dirname;
} else {
    try {
        currentDir = path.dirname(fileURLToPath(import.meta.url));
    } catch (e) {
        currentDir = process.cwd();
    }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ----------------------------------------------------
// Google Service Account Setup (Locally vs Vercel)
// ----------------------------------------------------
let auth;
const SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets'
];

if (process.env.GOOGLE_CREDENTIALS) {
    // VERCEL CLOUD: Parse from Environment Variable
    console.log("Using Google Credentials from Environment Variable");
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    auth = new google.auth.GoogleAuth({
        credentials,
        scopes: SCOPES,
    });
} else {
    // LOCALHOST DEVELOPMENT: Read from credentials.json
    console.log("Using local credentials.json file");
    const KEY_FILE_PATH = path.join(currentDir, '..', 'credentials.json');
    auth = new google.auth.GoogleAuth({
        keyFile: KEY_FILE_PATH,
        scopes: SCOPES,
    });
}

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// ----------------------------------------------------
// TEST ENVIRONMENT UTILS
// ----------------------------------------------------
const TEST_EMAILS = [
    'brian.mayorga@coca-cola.local', // Test Bodega
    'ventas1@coca-cola.local'        // Test Ventas
];

function getSheetNames(req) {
    const userEmail = req.headers['x-user-email'];
    if (userEmail && TEST_EMAILS.includes(userEmail.toLowerCase())) {
        return {
            inventoryTab: 'Pruebas_Hoja 1',
            requestsTab: 'Pruebas_Solicitudes'
        };
    }
    return {
        inventoryTab: 'Hoja 1',
        requestsTab: 'Solicitudes'
    };
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Backend Bodega Coca-Cola Operativo en Vercel' });
});

app.post('/api/products', async (req, res) => {
    try {
        const { name, code, description, stock, details, imageUrl = '', entryDate = '', registeredBy = '', channel = '' } = req.body;

        const newId = Date.now().toString();
        const resource = {
            values: [
                [newId, code, name, description, stock, imageUrl, details, entryDate, registeredBy, '', channel]
            ],
        };

        const sheetRes = await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${getSheetNames(req).inventoryTab}!A:K`,
            valueInputOption: 'USER_ENTERED',
            requestBody: resource,
        });

        res.status(200).json({
            success: true,
            message: 'Product added successfully',
            id: newId,
            imageUrl
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
            range: `${getSheetNames(req).inventoryTab}!A:K`,
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return res.status(200).json([]);
        }

        const data = rows[0][0]?.toLowerCase().includes('id') || rows[0][1]?.toLowerCase().includes('code')
            ? rows.slice(1)
            : rows;

        const products = data.map(row => {
            return {
                id: row[0] || '',
                code: row[1] || '',
                name: row[2] || '',
                description: row[3] || '',
                stock: Number(row[4]) || 0,
                imageUrl: row[5] || '',
                details: row[6] || '',
                entryDate: row[7] || '',
                registeredBy: row[8] || '',
                editedBy: row[9] || '',
                channel: row[10] || ''
            };
        }).filter(p => p.id && p.id.trim() !== '');

        res.status(200).json(products);
    } catch (error) {
        console.error('Error fetching products from Sheets:', error);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        const productId = req.params.id;

        const { inventoryTab } = getSheetNames(req);
        const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
        const sheetProperties = sheetMeta.data.sheets.find(s => s.properties.title === inventoryTab)?.properties;
        if (!sheetProperties) return res.status(404).json({ error: 'Sheet not found' });

        const getRes = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${inventoryTab}!A:A`,
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

app.put('/api/products/:id', async (req, res) => {
    try {
        const productId = req.params.id;
        const { name, code, description, stock, details, imageUrl, entryDate = '', registeredBy = '', editedBy = '', channel = '' } = req.body;

        // Fetch all rows to find the exact rowIndex for the given ID
        const { inventoryTab } = getSheetNames(req);
        const getRes = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${inventoryTab}!A:K`,
        });

        const rows = getRes.data.values;
        if (!rows) return res.status(404).json({ error: 'No data' });

        let rowIndex = -1;
        // Search starting from row 0
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] === productId) {
                rowIndex = i + 1; // Sheets rows are 1-indexed for range queries
                break;
            }
        }

        if (rowIndex === -1) return res.status(404).json({ error: 'Product not found' });

        // Build the update row (maintaining the original productId timestamp)
        const updateRange = `${inventoryTab}!A${rowIndex}:K${rowIndex}`;
        const resource = {
            values: [
                [productId, code, name, description, stock, imageUrl, details, entryDate, registeredBy, editedBy, channel]
            ],
        };

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: updateRange,
            valueInputOption: 'USER_ENTERED',
            requestBody: resource,
        });

        res.status(200).json({ success: true, message: 'Updated successfully' });
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

// ----------------------------------------------------
// SOLICITUDES API ROUTES (Tab "Solicitudes")
// ----------------------------------------------------

app.post('/api/solicitudes', async (req, res) => {
    try {
        const { productCode, productName, quantity, requestedBy, receptorName = '', status = 'PENDIENTE', dateRequested = new Date().toISOString(), processedBy = '', requesterEmail = '' } = req.body;
        const resource = {
            values: [
                [Date.now().toString(), productCode, productName, quantity, requestedBy, receptorName, status, dateRequested, processedBy, requesterEmail]
            ],
        };
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${getSheetNames(req).requestsTab}!A:J`,
            valueInputOption: 'USER_ENTERED',
            requestBody: resource,
        });
        res.status(200).json({ success: true, message: 'Request added successfully' });
    } catch (error) {
        console.error('Error adding request:', error);
        res.status(500).json({ success: false, error: 'Failed to add request' });
    }
});

app.get('/api/solicitudes', async (req, res) => {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${getSheetNames(req).requestsTab}!A:J`,
        });
        const rows = response.data.values;
        if (!rows || rows.length === 0) return res.status(200).json([]);
        const data = rows[0][0]?.toLowerCase().includes('id') ? rows.slice(1) : rows;
        const requests = data.map(row => ({
            id: row[0] || '',
            productCode: row[1] || '',
            productName: row[2] || '',
            quantity: Number(row[3]) || 0,
            requestedBy: row[4] || '',
            receptorName: row[5] || '',
            status: row[6] || 'PENDIENTE',
            dateRequested: row[7] || '',
            processedBy: row[8] || '',
            requesterEmail: row[9] || ''
        })).filter(r => r.id && r.id.trim() !== '');
        res.status(200).json(requests);
    } catch (error) {
        console.error('Error fetching requests from Sheets:', error);
        res.status(500).json({ error: 'Failed to fetch requests' });
    }
});

app.put('/api/solicitudes/:id', async (req, res) => {
    try {
        const requestId = req.params.id;
        const { productCode, productName, quantity, requestedBy, receptorName = '', status, dateRequested, processedBy = '', requesterEmail = '' } = req.body;

        const { requestsTab } = getSheetNames(req);
        const getRes = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${requestsTab}!A:J`,
        });
        const rows = getRes.data.values;
        if (!rows) return res.status(404).json({ error: 'No data' });

        let rowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] === requestId) {
                rowIndex = i + 1;
                break;
            }
        }
        if (rowIndex === -1) return res.status(404).json({ error: 'Request not found' });

        const updateRange = `${requestsTab}!A${rowIndex}:J${rowIndex}`;
        const resource = {
            values: [
                [requestId, productCode, productName, quantity, requestedBy, receptorName, status, dateRequested, processedBy, requesterEmail]
            ],
        };
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: updateRange,
            valueInputOption: 'USER_ENTERED',
            requestBody: resource,
        });
        res.status(200).json({ success: true, message: 'Updated successfully' });
    } catch (error) {
        console.error('Error updating request:', error);
        res.status(500).json({ error: 'Failed to update request' });
    }
});

// Vercel Serverless Function export
export default app;
