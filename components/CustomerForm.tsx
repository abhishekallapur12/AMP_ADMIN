import React, { useState, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import { supabase } from '../lib/supabase';
import { fileToGenerativePart } from '../lib/helpers';
import { Appointment } from '../types';
import { UploadIcon, SpinnerIcon, SuccessIcon } from './Icons';

const CustomerForm = ({ onAppointmentSubmit }: { onAppointmentSubmit: (name: string, phone: string, imageFiles: File[]) => Promise<void> }) => {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);
    
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const resetForm = useCallback(() => {
        setName('');
        setPhone('');
        setImageFiles([]);
        setImagePreviews([]);
        setStatus('idle');
        setErrorMessage(null);
    }, []);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files ? Array.from(e.target.files) as File[] : [];
        const newFiles: File[] = [];
        const newPreviews: string[] = [];

        for (const file of files) {
             if (!['image/jpeg', 'image/png'].includes(file.type)) {
                setErrorMessage('Unsupported file type. Please upload JPG or PNG images.');
                continue;
            }
            if (file.size > 8 * 1024 * 1024) {
                setErrorMessage('Image is too large (max 8 MB).');
                continue;
            }
            newFiles.push(file);
            newPreviews.push(URL.createObjectURL(file));
        }

        if (newFiles.length > 0) {
            setErrorMessage(null);
            setImageFiles(prev => [...prev, ...newFiles]);
            setImagePreviews(prev => [...prev, ...newPreviews]);
        }
        e.target.value = ''; // Reset input to allow re-uploading the same file
    };
    
    const removeImage = (indexToRemove: number) => {
        setImageFiles(prev => prev.filter((_, index) => index !== indexToRemove));
        setImagePreviews(prev => {
            const newPreviews = prev.filter((_, index) => index !== indexToRemove);
            URL.revokeObjectURL(prev[indexToRemove]);
            return newPreviews;
        });
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!name || !phone || imageFiles.length === 0) {
            setErrorMessage('All fields and at least one image are required.');
            return;
        }

        setStatus('loading');
        setErrorMessage(null);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            
            const validationPromises = imageFiles.map(async (file) => {
                const imagePart = await fileToGenerativePart(file);
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [{ parts: [
                        { text: "Is this image of a vehicle wheel or rim? Answer with only 'yes' or 'no'." },
                        imagePart
                    ]}]
                });
                return response.text.trim().toLowerCase().includes('yes');
            });

            const validationResults = await Promise.all(validationPromises);
            
            if (validationResults.every(isValid => isValid)) {
                await onAppointmentSubmit(name, phone, imageFiles);
                setStatus('success');
            } else {
                setStatus('error');
                setErrorMessage('One or more images are not wheels or rims. Please review your selection.');
            }
        } catch (error: any) {
            console.error("Error during submission process:", error);
            setStatus('error');
            const message = error.message || 'An unexpected error occurred. Please try again.';
            setErrorMessage(message);
        }
    };

    const renderForm = () => (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <label htmlFor="name" className="block mb-2 text-sm font-medium text-gray-700">Full Name</label>
                <input type="text" id="name" value={name} onChange={(e) => setName(e.target.value)} className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5" placeholder="John Doe" required aria-label="Full Name" />
            </div>
            <div>
                <label htmlFor="phone" className="block mb-2 text-sm font-medium text-gray-700">Phone Number</label>
                <input type="tel" id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5" placeholder="555-123-4567" required aria-label="Phone Number" />
            </div>
            <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">Wheel/Rim Photos</label>
                <div className="p-2 border-2 border-gray-300 border-dashed rounded-lg bg-gray-50 min-h-[10rem] grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {imagePreviews.map((src, index) => (
                        <div key={index} className="relative aspect-square">
                            <img src={src} alt={`Wheel preview ${index + 1}`} className="w-full h-full object-cover rounded-lg" />
                            <button type="button" onClick={() => removeImage(index)} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center font-bold text-xs" aria-label={`Remove image ${index+1}`}>&times;</button>
                        </div>
                    ))}
                    <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full aspect-square cursor-pointer hover:bg-gray-100 rounded-lg">
                        <div className="flex flex-col items-center justify-center text-center">
                          <UploadIcon />
                          <p className="text-xs text-gray-500"><span className="font-semibold">Add photos</span></p>
                        </div>
                        <input id="dropzone-file" type="file" className="hidden" accept="image/png, image/jpeg" multiple onChange={handleImageChange} aria-label="Upload wheel or rim photo" />
                    </label>
                </div>
                 <p className="mt-1 text-xs text-center text-gray-500">PNG or JPG (MAX. 8MB each)</p>
            </div>
            {errorMessage && <div className="p-4 mb-4 text-sm text-red-800 rounded-lg bg-red-50" role="alert"><span className="font-medium">Error:</span> {errorMessage}</div>}
            <button type="submit" disabled={status === 'loading' || !supabase} className="w-full text-white bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center justify-center">{status === 'loading' ? <SpinnerIcon /> : 'Book Appointment'}</button>
            <p className="text-xs text-center text-gray-500">We use AI to verify your images are wheels or rims.</p>
        </form>
    );

    const renderSuccess = () => (
        <div className="text-center">
            <SuccessIcon />
            <h2 className="text-2xl font-bold text-gray-800 mt-4">Appointment Requested!</h2>
            <p className="text-gray-600 mt-2">Thank you, {name}. We've received your request and will contact you shortly at {phone} to confirm.</p>
            <button onClick={resetForm} className="mt-6 text-white bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center">Submit Another Request</button>
        </div>
    );
    
    return status === 'success' ? renderSuccess() : renderForm();
};

export default CustomerForm;
