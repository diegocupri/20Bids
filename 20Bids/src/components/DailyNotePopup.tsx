import { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { fetchDailyNote, saveDailyNote } from '../api/client';

interface DailyNotePopupProps {
    date: Date;
    onClose: () => void;
    anchorRect: DOMRect | null;
}

export function DailyNotePopup({ date, onClose, anchorRect }: DailyNotePopupProps) {
    const [content, setContent] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const loadNote = async () => {
            setIsLoading(true);
            try {
                const note = await fetchDailyNote(date);
                setContent(note?.content || '');
            } catch (error) {
                console.error("Failed to load note:", error);
            } finally {
                setIsLoading(false);
            }
        };
        loadNote();
    }, [date]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await saveDailyNote(date, content);
            onClose();
        } catch (error) {
            console.error("Failed to save note:", error);
        } finally {
            setIsSaving(false);
        }
    };

    if (!anchorRect) return null;

    // Calculate position: to the right of the anchor
    const top = anchorRect.top;
    const left = anchorRect.right + 10;

    return (
        <div className="fixed inset-0 z-50 flex" onClick={onClose}>
            {/* Transparent backdrop to close on click outside */}

            <div
                className="absolute bg-bg-secondary border border-border-primary shadow-xl rounded-xl w-72 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                style={{ top, left }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-3 py-2 border-b border-border-primary/50 bg-bg-tertiary/50">
                    <span className="text-xs font-bold text-text-primary">Note for {format(date, 'MMM dd')}</span>
                    <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
                        <X className="w-3 h-3" />
                    </button>
                </div>

                <div className="p-3">
                    {isLoading ? (
                        <div className="flex justify-center py-4">
                            <Loader2 className="w-4 h-4 animate-spin text-text-secondary" />
                        </div>
                    ) : (
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className="w-full h-32 bg-bg-primary border border-border-primary/50 rounded-lg p-2 text-sm text-text-primary resize-none focus:outline-none focus:border-accent-primary"
                            placeholder="Add notes about this day..."
                            autoFocus
                        />
                    )}
                </div>

                <div className="px-3 pb-3 flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={isSaving || isLoading}
                        className="flex items-center gap-2 px-3 py-1.5 bg-accent-primary text-white text-xs font-bold rounded-lg hover:bg-accent-primary/90 transition-colors disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}
