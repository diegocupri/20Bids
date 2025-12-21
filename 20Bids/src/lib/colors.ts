/**
 * Returns the color class string based on probability value.
 * > 80%: Green (Emerald)
 * 75% - 80%: Orange (Amber)
 * < 75%: Red (Rose)
 */
export function getProbabilityColor(probability: number): string {
    if (probability > 80) return "text-emerald-600";
    if (probability >= 75) return "text-amber-600";
    return "text-rose-600";
}

export function getProbabilityBg(probability: number): string {
    if (probability > 80) return "bg-emerald-500";
    if (probability >= 75) return "bg-amber-500";
    return "bg-rose-500";
}
