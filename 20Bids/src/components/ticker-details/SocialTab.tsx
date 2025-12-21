import { MessageSquare, ThumbsUp, TrendingUp, TrendingDown, Users } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Tweet {
    id: string;
    user: string;
    text: string;
    time: string;
    sentiment: 'Bullish' | 'Bearish';
}

interface SentimentData {
    sentiment: 'Bullish' | 'Bearish';
    score: string;
    volume: number;
    tweets: Tweet[];
}

interface SocialTabProps {
    data: SentimentData | null;
    isLoading: boolean;
}

export function SocialTab({ data, isLoading }: SocialTabProps) {
    if (isLoading) {
        return (
            <div className="p-4 space-y-4">
                <div className="h-20 bg-bg-secondary rounded-xl animate-pulse"></div>
                <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-24 bg-bg-secondary rounded-xl animate-pulse"></div>
                    ))}
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="p-8 text-center text-text-secondary text-sm">
                No social data available.
            </div>
        );
    }

    const isBullish = data.sentiment === 'Bullish';

    return (
        <div className="p-4 space-y-6">
            {/* Sentiment Summary Card */}
            <div className={cn(
                "p-4 rounded-xl border flex items-center justify-between",
                isBullish
                    ? "bg-emerald-500/5 border-emerald-500/20"
                    : "bg-rose-500/5 border-rose-500/20"
            )}>
                <div className="space-y-1">
                    <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                        Crowd Sentiment
                    </div>
                    <div className={cn(
                        "text-xl font-bold flex items-center gap-2",
                        isBullish ? "text-emerald-500" : "text-rose-500"
                    )}>
                        {data.sentiment}
                        {isBullish ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                    </div>
                </div>

                <div className="flex gap-6 text-right">
                    <div>
                        <div className="text-[10px] text-text-secondary uppercase">Score</div>
                        <div className="text-lg font-bold text-text-primary">{data.score}</div>
                    </div>
                    <div>
                        <div className="text-[10px] text-text-secondary uppercase">Volume</div>
                        <div className="text-lg font-bold text-text-primary flex items-center gap-1">
                            <Users className="w-3 h-3 text-text-secondary" />
                            {data.volume.toLocaleString()}
                        </div>
                    </div>
                </div>
            </div>

            {/* Tweets Feed */}
            <div className="space-y-3">
                <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider px-1">
                    Latest Discourse
                </h4>

                {data.tweets.map((tweet) => (
                    <div key={tweet.id} className="p-3 bg-bg-secondary/30 rounded-xl border border-border-primary/50 hover:border-border-primary transition-colors">
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-accent-primary/20 flex items-center justify-center text-[10px] font-bold text-accent-primary">
                                    {tweet.user[0]}
                                </div>
                                <span className="text-xs font-semibold text-text-primary">@{tweet.user}</span>
                            </div>
                            <span className={cn(
                                "text-[10px] font-bold px-1.5 py-0.5 rounded border",
                                tweet.sentiment === 'Bullish'
                                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                    : "bg-rose-500/10 text-rose-500 border-rose-500/20"
                            )}>
                                {tweet.sentiment}
                            </span>
                        </div>

                        <p className="text-sm text-text-primary mb-2 leading-relaxed">
                            {tweet.text}
                        </p>

                        <div className="flex items-center justify-between text-text-secondary/60 text-[10px]">
                            <span>{tweet.time}</span>
                            <div className="flex gap-3">
                                <button className="hover:text-text-primary transition-colors flex items-center gap-1">
                                    <MessageSquare className="w-3 h-3" /> 2
                                </button>
                                <button className="hover:text-emerald-500 transition-colors flex items-center gap-1">
                                    <ThumbsUp className="w-3 h-3" /> 5
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
