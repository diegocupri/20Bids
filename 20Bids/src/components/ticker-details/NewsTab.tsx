import { formatDistanceToNow } from 'date-fns';


interface NewsItem {
    id: string;
    publisher: {
        name: string;
        logo_url?: string;
        homepage_url?: string;
    };
    title: string;
    author: string;
    published_utc: string;
    article_url: string;
    tickers: string[];
    image_url?: string;
    description?: string;
}

interface NewsTabProps {
    news: NewsItem[];
    isLoading: boolean;
}

export function NewsTab({ news, isLoading }: NewsTabProps) {
    if (isLoading) {
        return (
            <div className="space-y-4 p-4">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="animate-pulse space-y-2">
                        <div className="h-4 bg-bg-secondary rounded w-3/4"></div>
                        <div className="h-3 bg-bg-secondary rounded w-1/2"></div>
                    </div>
                ))}
            </div>
        );
    }

    if (news.length === 0) {
        return (
            <div className="p-8 text-center text-text-secondary text-sm">
                No recent news found.
            </div>
        );
    }

    return (
        <div className="divide-y divide-border-primary/50">
            {news.map((item) => (
                <a
                    key={item.id}
                    href={item.article_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-4 hover:bg-bg-secondary/30 transition-colors group"
                >
                    <div className="flex gap-4">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                                {item.publisher.logo_url && (
                                    <img
                                        src={item.publisher.logo_url}
                                        alt={item.publisher.name}
                                        className="w-4 h-4 object-contain rounded-sm"
                                        onError={(e) => (e.currentTarget.style.display = 'none')}
                                    />
                                )}
                                <span className="text-xs font-medium text-text-secondary">
                                    {item.publisher.name}
                                </span>
                                <span className="text-[10px] text-text-secondary/60">
                                    • {formatDistanceToNow(new Date(item.published_utc), { addSuffix: true })}
                                </span>
                            </div>

                            <h3 className="text-sm font-semibold text-text-primary leading-snug mb-1 group-hover:text-accent-primary transition-colors line-clamp-2">
                                {item.title}
                            </h3>

                            {item.description && (
                                <p className="text-xs text-text-secondary line-clamp-2 mb-2">
                                    {item.description}
                                </p>
                            )}

                            <div className="flex items-center gap-2">
                                {item.tickers.slice(0, 3).map(t => (
                                    <span key={t} className="text-[10px] bg-bg-secondary text-text-secondary px-1.5 py-0.5 rounded">
                                        {t}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {item.image_url && (
                            <div className="w-20 h-20 flex-shrink-0 bg-bg-secondary rounded-lg overflow-hidden border border-border-primary/30">
                                <img
                                    src={item.image_url}
                                    alt={item.title}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                            </div>
                        )}
                    </div>
                </a>
            ))}
        </div>
    );
}
