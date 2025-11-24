

export function SkeletonTable() {
    return (
        <div className="animate-pulse p-8 space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
            <div className="space-y-3">
                {[...Array(10)].map((_, i) => (
                    <div key={i} className="h-12 bg-gray-100 rounded-md w-full"></div>
                ))}
            </div>
        </div>
    );
}
