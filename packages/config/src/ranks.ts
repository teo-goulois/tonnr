// The score each rank is reached at: decision 041. A rank is reached by what an account wrote of
// the breaks and that was confirmed. A break described whole, its eight lines of words and its
// four texts, is 80 points: the first rank is a few lines, the last several breaks. The API
// awards a rank by these, and the web app draws the way to each with the same.
export const RANK_FROM = { qs: 20, cs: 150, ct: 600 } as const;
