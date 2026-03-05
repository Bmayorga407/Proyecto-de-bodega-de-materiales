/// <reference types="vite/client" />
import axios from 'axios';
import { Product } from '../types';

// Use the current machine's IP/hostname in dev so mobile testing works, and relative Vercel route in production
const API_URL = import.meta.env.DEV ? `http://${window.location.hostname}:3001/api` : '/api';

export const setInventoryUserEmail = (email: string | null) => {
    if (email) {
        axios.defaults.headers.common['x-user-email'] = email;
    } else {
        delete axios.defaults.headers.common['x-user-email'];
    }
};

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
                channel: data.channel || '',
                entryDate: data.entryDate || new Date().toISOString().split('T')[0],
                imageUrl: directImageUrl, // Base64 string will be saved directly into Google Sheets!
                registeredBy: data.registeredBy || ''
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
    },

    updateProduct: async (id: string, productData: Partial<Product>, imageFile?: File): Promise<any> => {
        try {
            let base64Image = productData.imageUrl; // Retain existing image if no new file is provided

            if (imageFile) {
                // Compress and convert NEW image to base64
                base64Image = await new Promise((resolve) => {
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
                ...productData,
                imageUrl: base64Image
            };

            const response = await axios.put(`${API_URL}/products/${id}`, payload, {
                headers: { 'Content-Type': 'application/json' },
                maxBodyLength: Infinity,
            });

            return response.data;
        } catch (error) {
            console.error('Error updating product:', error);
            throw error;
        }
    },

    // ----------------------------------------------------
    // SOLICITUDES API (Tab "Solicitudes")
    // ----------------------------------------------------
    fetchRequests: async (): Promise<any[]> => {
        try {
            const response = await axios.get(`${API_URL}/solicitudes`);
            return response.data;
        } catch (error) {
            console.error('Error fetching requests:', error);
            throw error;
        }
    },

    createRequest: async (data: any): Promise<any> => {
        try {
            const response = await axios.post(`${API_URL}/solicitudes`, data);
            return response.data;
        } catch (error) {
            console.error('Error creating request:', error);
            throw error;
        }
    },

    updateRequest: async (id: string, data: any): Promise<any> => {
        try {
            const response = await axios.put(`${API_URL}/solicitudes/${id}`, data);
            return response.data;
        } catch (error) {
            console.error('Error updating request:', error);
            throw error;
        }
    },

    deleteRequest: async (id: string): Promise<any> => {
        try {
            const response = await axios.delete(`${API_URL}/solicitudes/${id}`);
            return response.data;
        } catch (error) {
            console.error('Error deleting request:', error);
            throw error;
        }
    }
};
