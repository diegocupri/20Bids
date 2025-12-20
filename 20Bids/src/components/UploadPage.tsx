import { useState } from 'react';
import { Upload, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { uploadRecommendations } from '../api/client';

export function UploadPage() {
    const navigate = useNavigate();
    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string; successCount?: number; errorCount?: number; errors?: any[] } | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(e.target.files || []);
        const validFiles = selectedFiles.filter(f => f.name.endsWith('.csv'));

        if (validFiles.length > 0) {
            setFiles(validFiles);
            setResult(null);
            if (validFiles.length < selectedFiles.length) {
                alert('Algunos archivos no eran CSV y fueron ignorados.');
            }
        } else if (selectedFiles.length > 0) {
            alert('Por favor selecciona archivos CSV');
        }
    };

    const handleUpload = async () => {
        if (files.length === 0) return;

        setUploading(true);
        setResult(null);

        try {
            const formData = new FormData();
            files.forEach(file => {
                formData.append('files', file);
            });

            const data = await uploadRecommendations(formData);

            if (!data.error) {
                setResult(data);
                setFiles([]);
                // Reset file input
                const fileInput = document.getElementById('file-input') as HTMLInputElement;
                if (fileInput) fileInput.value = '';
            } else {
                setResult({
                    success: false,
                    message: data.error || 'Error al subir los archivos'
                });
            }
        } catch (error) {
            setResult({
                success: false,
                message: 'Error de conexión con el servidor'
            });
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="min-h-screen bg-bg-secondary p-8">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <button
                        onClick={() => navigate('/')}
                        className="p-2 hover:bg-bg-primary rounded-lg transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-text-secondary" />
                    </button>
                    <h1 className="text-2xl font-bold text-text-primary">Upload Recommendations</h1>
                </div>

                {/* Upload Card */}
                <div className="bg-bg-primary border border-border-primary rounded-lg p-8">
                    <div className="text-center mb-6">
                        <Upload className="w-16 h-16 text-accent-primary mx-auto mb-4" />
                        <h2 className="text-lg font-semibold text-text-primary mb-2">
                            Sube tus archivos CSV
                        </h2>
                        <p className="text-sm text-text-secondary">
                            Puedes seleccionar múltiples archivos a la vez.
                        </p>
                        <p className="text-xs text-text-secondary mt-1">
                            Formato: Ticker, Open, Date, voltotal, prob_media
                        </p>
                    </div>

                    {/* File Input */}
                    <div className="mb-6">
                        <input
                            id="file-input"
                            type="file"
                            accept=".csv"
                            multiple
                            onChange={handleFileChange}
                            className="block w-full text-sm text-text-secondary
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-md file:border-0
                                file:text-sm file:font-semibold
                                file:bg-accent-primary file:text-white
                                hover:file:bg-accent-secondary
                                file:cursor-pointer cursor-pointer"
                        />
                    </div>

                    {/* Selected Files */}
                    {files.length > 0 && (
                        <div className="mb-6 p-4 bg-bg-secondary rounded-lg border border-border-primary max-h-40 overflow-y-auto">
                            <p className="text-sm font-semibold text-text-primary mb-2">
                                {files.length} archivo(s) seleccionado(s):
                            </p>
                            <ul className="space-y-1">
                                {files.map((f, i) => (
                                    <li key={i} className="text-xs text-text-secondary flex justify-between">
                                        <span>{f.name}</span>
                                        <span className="opacity-70">{(f.size / 1024).toFixed(2)} KB</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Upload Button */}
                    <button
                        onClick={handleUpload}
                        disabled={files.length === 0 || uploading}
                        className="w-full py-3 px-4 bg-accent-primary text-white font-semibold rounded-lg
                            hover:bg-accent-secondary disabled:opacity-50 disabled:cursor-not-allowed
                            transition-colors"
                    >
                        {uploading ? 'Subiendo...' : 'Upload All'}
                    </button>

                    {/* Result */}
                    {result && (
                        <div className={`mt-6 p-4 rounded-lg border ${result.success
                            ? 'bg-emerald-500/10 border-emerald-500/30'
                            : 'bg-rose-500/10 border-rose-500/30'
                            }`}>
                            <div className="flex items-start gap-3">
                                {result.success ? (
                                    <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                                ) : (
                                    <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                                )}
                                <div className="flex-1">
                                    <p className={`font-semibold mb-1 ${result.success ? 'text-emerald-500' : 'text-rose-500'
                                        }`}>
                                        {result.success ? '✓ Upload exitoso' : '✗ Error'}
                                    </p>
                                    <p className="text-sm text-text-secondary">
                                        {result.message}
                                    </p>
                                    {result.errorCount && result.errorCount > 0 && (
                                        <div className="mt-3 text-xs">
                                            <p className="font-semibold text-text-primary mb-2">Errores:</p>
                                            <div className="space-y-1 max-h-40 overflow-y-auto">
                                                {result.errors?.map((err, idx) => (
                                                    <p key={idx} className="text-rose-400">
                                                        • {err.file ? `[${err.file}] ` : ''}{err.symbol}: {err.error}
                                                    </p>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Instructions */}
                <div className="mt-6 p-4 bg-bg-primary border border-border-primary rounded-lg">
                    <h3 className="text-sm font-semibold text-text-primary mb-2">
                        📋 Formato del CSV
                    </h3>
                    <div className="text-xs text-text-secondary space-y-1">
                        <p>• <strong>Ticker:</strong> Símbolo del ticker (ej: AAPL, MSFT)</p>
                        <p>• <strong>Open:</strong> Precio de apertura</p>
                        <p>• <strong>Date:</strong> Fecha (formato: 2025-12-08)</p>
                        <p>• <strong>voltotal:</strong> Volumen total</p>
                        <p>• <strong>prob_media:</strong> Probabilidad media (0-1)</p>
                    </div>
                    <p className="text-xs text-text-secondary mt-3 italic">
                        El resto de datos (sector, nombre, etc.) se obtendrán automáticamente de Polygon API.
                    </p>
                </div>
            </div>
        </div>
    );
}
