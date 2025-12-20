import { useState, useEffect } from 'react';
import { FileText, Save } from 'lucide-react';

interface TickerNotesProps {
    ticker: string;
}

export function TickerNotes({ ticker }: TickerNotesProps) {
    const [note, setNote] = useState('');
    const [isSaved, setIsSaved] = useState(false);

    useEffect(() => {
        if (!ticker) {
            setNote('');
            return;
        }
        const savedNote = localStorage.getItem(`note_${ticker}`);
        setNote(savedNote || '');
        setIsSaved(false);
    }, [ticker]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setNote(e.target.value);
        setIsSaved(false);
    };

    const handleSave = () => {
        if (ticker) {
            localStorage.setItem(`note_${ticker}`, note);
            setIsSaved(true);
            setTimeout(() => setIsSaved(false), 2000);
        }
    };

    // Auto-save on blur
    const handleBlur = () => {
        if (ticker) {
            localStorage.setItem(`note_${ticker}`, note);
        }
    };

    if (!ticker) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-text-secondary p-4 text-center">
                <FileText className="w-8 h-8 mb-2 opacity-20" />
                <p className="text-xs">Select a ticker to view notes</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-bg-primary p-2 relative group">
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-border-primary">
                <div className="flex items-center gap-2">
                    <FileText className="w-3 h-3 text-accent-primary" />
                    <h3 className="font-bold text-text-primary uppercase tracking-wide text-[10px]">Notes <span className="text-text-secondary">| {ticker}</span></h3>
                </div>
                {isSaved && <span className="text-[9px] text-emerald-500 animate-fade-in">Saved</span>}
            </div>

            <textarea
                value={note}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder={`Add notes for ${ticker}...`}
                className="flex-1 w-full bg-bg-secondary/50 border border-border-primary rounded p-2 text-xs text-text-primary focus:border-accent-primary outline-none resize-none font-mono custom-scrollbar"
            />

            <button
                onClick={handleSave}
                className="absolute bottom-4 right-4 p-1.5 bg-accent-primary text-bg-primary rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent-secondary"
                title="Save Note"
            >
                <Save className="w-3 h-3" />
            </button>
        </div>
    );
}
