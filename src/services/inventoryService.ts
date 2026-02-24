/// <reference types="vite/client" />
import axios from 'axios';
import { Product } from '../types';

// Use exact localhost port in dev, and relative Vercel route in production
const API_URL = import.meta.env.DEV ? 'http://localhost:3001/api' : '/api';

export const inventoryService = {
    fetchProducts: async (): Promise<Product[]> => {
        try {
            const response = await axios.get(`${API_URL}/products`);
            return response.data;
        } catch (error) {
            console.error('Error fetching products:', error);
            throw error;
        }
    },

    addProduct: async (data: Partial<Product>, imageFile?: File): Promise<any> => {
        try {
            let directImageUrl = '';

            if (imageFile) {
                // Compress image and convert to Base64 on the client side
                directImageUrl = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(imageFile);
                    reader.onload = (event) => {
                        const img = new Image();
                        img.src = event.target?.result as string;
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            const MAX_WIDTH = 400; // Limit size to ensure base64 is small enough for Google Sheets cell
                            const MAX_HEIGHT = 400;
                            let width = img.width;
                            let height = img.height;

                            if (width > height) {
                                if (width > MAX_WIDTH) {
                                    height *= MAX_WIDTH / width;
                                    width = MAX_WIDTH;
                                }
                            } else {
                                if (height > MAX_HEIGHT) {
                                    width *= MAX_HEIGHT / height;
                                    height = MAX_HEIGHT;
                                }
                            }

                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext('2d');
                            ctx?.drawImage(img, 0, 0, width, height);
                            // Compress heavily to keep the string under 50,000 chars
                            const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
                            resolve(dataUrl);
                        };
                    };
                });
            }

            const payload = {
                name: data.name || '',
                code: data.code || '',
                description: data.description || '',
                stock: data.stock || 0,
                details: data.details || '',
                imageUrl: directImageUrl // Base64 string will be saved directly into Google Sheets!
            };

            const response = await axios.post(`${API_URL}/products`, payload);
            return response.data;
        } catch (error) {
            console.error('Error adding product:', error);
            throw error;
        }
    },

    deleteProduct: async (id: string): Promise<any> => {
        try {
            const response = await axios.delete(`${API_URL}/products/${id}`);
            return response.data;
        } catch (error) {
            console.error('Error deleting product:', error);
            throw error;
        }
    }
};
