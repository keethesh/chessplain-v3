export interface RecentReview {
  id: string;
  shareId?: string;
  headline?: string;
  players?: string;
  createdAt: string;
}

const STORAGE_KEY = 'chessplain_recent_reviews';
const MAX_REVIEWS = 5;

export function getRecentReviews(): RecentReview[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRecentReview(review: RecentReview): void {
  if (typeof window === 'undefined' || !review.id || review.id === 'demo') return;
  try {
    const current = getRecentReviews();
    const filtered = current.filter((r) => r.id !== review.id);
    const updated = [review, ...filtered].slice(0, MAX_REVIEWS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // LocalStorage quota or access denied (private browsing)
  }
}

export function clearRecentReviews(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}
